import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, errorMessage, getCallerUserId, jsonResponse, serviceClient } from "../_shared/auth.ts";
import { COMPANY } from "../_shared/company.ts";
import { formatDateTimeInWords } from "../_shared/dates.ts";
import { emailTemplate, sendEmail } from "../_shared/email.ts";

// Complaint form (client list 2.11.2), from the site footer and Contact us.
// Anyone can send one, signed in or not. Each complaint gets a ticket
// number, is saved in public.complaints, and goes out as two emails: the
// full complaint to the admins only (reply-to = the customer), and a
// confirmation with the ticket number to the customer.
//
// Saved but shown nowhere - not on the site, not in the admin panel
// (client, 18 Nov 2026).
//
// Public endpoint (verify_jwt = false). Limits counted on the saved
// complaints stop the form being used to flood an inbox.
//
// POST { name, email, phone, category, order_number?, message, company_fax? }
//   -> 200 { ticket, ack_sent } | 4xx/5xx { error }

const MAX_PER_EMAIL_PER_DAY = 3;
const MAX_PER_IP_PER_HOUR = 5;
const MESSAGE_MIN = 20;
const MESSAGE_MAX = 3000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same keys and words as src/components/ComplaintForm.tsx.
const CATEGORIES: Record<string, string> = {
  order: "My order",
  delivery: "Delivery or tracking",
  return_refund: "Return, exchange or refund",
  payment: "Payment or charges",
  product: "Product quality or wrong item",
  boutique: "A boutique (seller)",
  website: "Website or my account",
  other: "Something else",
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// One line, no control characters (names and subjects go into headers).
const oneLine = (s: unknown, max: number) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max + 1);

// Same rule as toE164 in src/lib/authIdentifier.ts: Indian numbers as 10
// digits, with 0 / 91 in front, or +91; other countries in + form.
function toE164(raw: string): string | null {
  const text = raw.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(text)) return null;
  if (text.startsWith("+")) return /^\+[1-9]\d{7,14}$/.test(text) ? text : null;
  const indian = text.replace(/^(91|0)(?=[6-9]\d{9}$)/, "");
  return /^[6-9]\d{9}$/.test(indian) ? `+91${indian}` : null;
}

function formatPhone(e164: string): string {
  return e164.startsWith("+91") && e164.length === 13 ? `+91 ${e164.slice(3, 8)} ${e164.slice(8)}` : e164;
}

function clientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || null;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// CMP-261117-K7Q4X: the day (India time) plus 5 random letters/digits
// without look-alikes (0/O, 1/I/L) - ~20 million a day, so no clash without
// a counter in the database.
function ticketNumber(): string {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "2-digit", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as Record<string, string>);
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `CMP-${day.year}${day.month}${day.day}-${code}`;
}

interface Complaint {
  name: string;
  email: string;
  phone: string;
  category: string;
  orderNumber: string;
  message: string;
}

function validate(body: any): { complaint: Complaint } | { error: string } {
  const name = oneLine(body.name, 100);
  if (name.length < 2) return { error: "Enter your full name." };
  if (name.length > 100) return { error: "Your name is too long." };

  const email = String(body.email ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return { error: "Enter a valid email address." };

  const phone = toE164(String(body.phone ?? ""));
  if (!phone) return { error: "Enter a valid mobile number." };

  const category = String(body.category ?? "");
  if (!CATEGORIES[category]) return { error: "Choose what your complaint is about." };

  const orderNumber = oneLine(body.order_number, 40);
  if (orderNumber.length > 40) return { error: "That order number is too long." };

  const message = String(body.message ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .trim();
  if (message.length < MESSAGE_MIN) return { error: `Please tell us a little more (at least ${MESSAGE_MIN} characters).` };
  if (message.length > MESSAGE_MAX) return { error: `Please keep it under ${MESSAGE_MAX} characters.` };

  return { complaint: { name, email, phone, category, orderNumber, message } };
}

async function adminEmails(supabase: SupabaseClient): Promise<string[]> {
  const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const emails = await Promise.all(
    (roles ?? []).map(async (r) => {
      const { data } = await supabase.auth.admin.getUserById(r.user_id);
      return data?.user?.email ?? null;
    }),
  );
  return emails.filter((e): e is string => !!e);
}

// Who sent it, when they were signed in - helps the admin find the account.
async function signedIn(req: Request, supabase: SupabaseClient): Promise<{ id: string; label: string } | null> {
  try {
    const userId = await getCallerUserId(req);
    if (!userId) return null;
    const { data } = await supabase.auth.admin.getUserById(userId);
    const u = data?.user;
    if (!u) return null;
    return { id: u.id, label: u.email || (u.phone ? `+${u.phone}` : null) || u.id };
  } catch {
    return null;
  }
}

// Saves the complaint under a fresh ticket number (a new one on the rare
// clash with an existing ticket).
async function saveComplaint(
  supabase: SupabaseClient,
  c: Complaint,
  userId: string | null,
  ipHash: string | null,
): Promise<{ id: string; ticket: string; created_at: string }> {
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await supabase
      .from("complaints")
      .insert({
        ticket: ticketNumber(),
        name: c.name,
        email: c.email,
        phone: c.phone,
        category: c.category,
        order_number: c.orderNumber || null,
        message: c.message,
        user_id: userId,
        ip_hash: ipHash,
      })
      .select("id, ticket, created_at")
      .single();
    if (!error) return data;
    if (error.code !== "23505" || attempt >= 4) throw error;
  }
}

const row = (label: string, value: string) =>
  `<tr><td style="padding:4px 12px 4px 0; color:#6a6a6a; vertical-align:top; white-space:nowrap;">${label}</td><td style="padding:4px 0; color:#2a2a2a;">${value}</td></tr>`;

const messageBlock = (message: string) =>
  `<div style="margin:0 0 20px; padding:14px 16px; background-color:#f8f5f1; border-left:3px solid #7a2e22; white-space:pre-wrap; word-break:break-word;">${esc(message)}</div>`;

function adminEmail(c: Complaint, ticket: string, submittedAt: string, account: string | null) {
  const category = CATEGORIES[c.category];
  const subject = oneLine(`Complaint ${ticket}: ${category} - ${c.name}`, 200);
  const html = emailTemplate({
    preheader: `${c.name} raised a complaint about ${category.toLowerCase()}.`,
    heading: `New complaint ${ticket}`,
    bodyHtml: `
<p style="margin:0 0 16px;">A customer raised a complaint on the website. Reply to this email to answer the customer directly.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px; font-size:14px;">
${row("Ticket", `<strong>${ticket}</strong>`)}
${row("Received", esc(submittedAt))}
${row("About", esc(category))}
${row("Order number", c.orderNumber ? esc(c.orderNumber) : "Not given")}
${row("Name", esc(c.name))}
${row("Email", `<a href="mailto:${esc(c.email)}" style="color:#7a2e22;">${esc(c.email)}</a>`)}
${row("Mobile", `<a href="tel:${esc(c.phone)}" style="color:#7a2e22;">${esc(formatPhone(c.phone))}</a>`)}
${row("Account", account ? `Signed in as ${esc(account)}` : "Not signed in")}
</table>
<p style="margin:0 0 8px; font-weight:600;">Complaint</p>
${messageBlock(c.message)}
<p style="margin:0; font-size:13px; color:#6a6a6a;">The customer was told we aim to acknowledge it within 24 hours and resolve it within 7 days.</p>`,
  });
  return { subject, html };
}

function customerEmail(c: Complaint, ticket: string, submittedAt: string) {
  const g = COMPANY.grievanceOfficer;
  const subject = `We've received your complaint - ticket ${ticket}`;
  const html = emailTemplate({
    preheader: `Your ticket number is ${ticket}. We aim to acknowledge within 24 hours and resolve within 7 days.`,
    heading: "We've received your complaint",
    bodyHtml: `
<p style="margin:0 0 16px;">Hi ${esc(c.name)},</p>
<p style="margin:0 0 16px;">Thank you for telling us. Your complaint has been registered with our team.</p>
<p style="margin:0 0 4px; font-size:13px; color:#6a6a6a;">Your ticket number</p>
<p style="margin:0 0 20px; font-family:'Courier New',Courier,monospace; font-size:24px; font-weight:700; letter-spacing:2px; color:#7a2e22;">${ticket}</p>
<p style="margin:0 0 16px;">We aim to acknowledge your complaint within <strong>24 hours</strong> and resolve it within <strong>7 days</strong>. Please quote your ticket number whenever you write to us about it.</p>
<p style="margin:0 0 8px; font-weight:600;">What you told us</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px; font-size:14px;">
${row("Received", esc(submittedAt))}
${row("About", esc(CATEGORIES[c.category]))}
${c.orderNumber ? row("Order number", esc(c.orderNumber)) : ""}
${row("Mobile", esc(formatPhone(c.phone)))}
</table>
${messageBlock(c.message)}
<p style="margin:0 0 12px; font-size:13px; color:#6a6a6a;">Grievance Officer: ${esc(g.name)} · <a href="mailto:${g.email}" style="color:#7a2e22; text-decoration:none;">${g.email}</a> · ${g.phone}</p>
<p style="margin:0; font-size:13px; color:#6a6a6a;">Didn't send this? Please let us know by replying to this email.</p>`,
  });
  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const checked = validate(body);
    if ("error" in checked) return jsonResponse({ error: checked.error }, 400);
    const c = checked.complaint;

    // Hidden field only bots fill in: look like it worked, send nothing.
    if (String(body.company_fax ?? "").trim()) {
      console.log("submit-complaint: honeypot filled, dropped");
      return jsonResponse({ ticket: ticketNumber(), ack_sent: true });
    }

    const supabase = serviceClient();
    const now = Date.now();
    const ip = clientIp(req);
    const ipHash = ip ? await sha256(`complaint-ip:${ip}`) : null;

    const { count: byEmail, error: emailErr } = await supabase
      .from("complaints")
      .select("id", { count: "exact", head: true })
      .eq("email", c.email)
      .gte("created_at", new Date(now - 86_400_000).toISOString());
    if (emailErr) throw emailErr;
    if ((byEmail ?? 0) >= MAX_PER_EMAIL_PER_DAY) {
      return jsonResponse(
        { error: `You've already sent ${MAX_PER_EMAIL_PER_DAY} complaints today. We'll reply to those - or write to ${COMPANY.grievanceOfficer.email}.` },
        429,
      );
    }
    if (ipHash) {
      const { count: byIp, error: ipErr } = await supabase
        .from("complaints")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", new Date(now - 3_600_000).toISOString());
      if (ipErr) throw ipErr;
      if ((byIp ?? 0) >= MAX_PER_IP_PER_HOUR) {
        return jsonResponse({ error: "Too many complaints from this network. Please try again in an hour." }, 429);
      }
    }

    // 1. Saved first - from here on the complaint is on record, even if an
    // email fails, so the customer is told it went through.
    const account = await signedIn(req, supabase);
    const saved = await saveComplaint(supabase, c, account?.id ?? null, ipHash);
    const ticket = saved.ticket;
    // In words: the customer gets it too.
    const submittedAt = formatDateTimeInWords(saved.created_at);

    // 2. The full complaint to the admins only.
    const recipients = [...new Set((await adminEmails(supabase)).map((e) => e.toLowerCase()))];
    const admin = adminEmail(c, ticket, submittedAt, account?.label ?? null);
    let delivered = 0;
    for (const to of recipients) {
      try {
        const result = await sendEmail(to, admin.subject, admin.html, { replyTo: c.email });
        if (result.skipped) break;
        delivered++;
      } catch (e) {
        console.error("submit-complaint: admin email failed", ticket, to, errorMessage(e));
      }
    }
    if (delivered === 0) console.error("submit-complaint: no admin got", ticket, `(${recipients.length} admins)`);

    // 3. The customer's confirmation.
    let ackSent = false;
    try {
      const ack = customerEmail(c, ticket, submittedAt);
      const result = await sendEmail(c.email, ack.subject, ack.html);
      ackSent = !result.skipped;
    } catch (e) {
      console.error("submit-complaint: confirmation email failed", ticket, errorMessage(e));
    }

    const sentAt = new Date().toISOString();
    const { error: markErr } = await supabase
      .from("complaints")
      .update({ admins_emailed_at: delivered > 0 ? sentAt : null, customer_emailed_at: ackSent ? sentAt : null })
      .eq("id", saved.id);
    if (markErr) console.error("submit-complaint: marking emails sent failed", ticket, errorMessage(markErr));

    console.log("submit-complaint: saved", ticket, `admins=${delivered}/${recipients.length}`, `ack=${ackSent}`);
    return jsonResponse({ ticket, ack_sent: ackSent });
  } catch (e) {
    console.error("submit-complaint failed", errorMessage(e));
    return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
