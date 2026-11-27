import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { itemOptionsLabel } from "../_shared/itemOptions.ts";
import { corsHeaders, errorMessage, getCallerUserId, jsonResponse, serviceClient } from "../_shared/auth.ts";
import { formatDateTimeInWords } from "../_shared/dates.ts";
import { emailTemplate, sendEmail } from "../_shared/email.ts";
import { links, notifyAllAdmins, notifyVendorMembers } from "../_shared/notify.ts";

// The live website for email buttons, and this project's own address (set by
// Supabase) for checking upload links - what _shared/urls.ts gives on stage.
const SITE_URL = "https://allboutiqs.com";
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/+$/, "");

// Report a problem (client, 27 Nov 2026). Damage or a wrong item found
// after delivery is not a cancellation: for 24 hours from delivery the
// customer reports it from My Orders with an unboxing video, photos, a
// reason and a note. Saved in public.problem_reports under a ticket number;
// the customer gets the ticket by email, the admins and the boutique(s) a
// bell + email at once. After 24 hours nothing is taken - no late cases, no
// admin override (the user's decision, 27 Nov 2026).
//
// POST { order_id, order_item_ids[], reason, note, video_url, photo_urls[] }
//   -> 200 { ticket, ack_sent } | 4xx/5xx { error }

// Same numbers and words as src/lib/problemReport.ts.
const WINDOW_HOURS = 24;
const NOTE_MIN = 10;
const NOTE_MAX = 2000;
const MIN_PHOTOS = 1;
const MAX_PHOTOS = 6;
const MAX_REPORTS_PER_ORDER = 3;
const REASONS: Record<string, string> = {
  damaged: "Damaged",
  wrong_item: "Wrong item",
  missing_item: "Missing item",
  measurement_off: "Measurement more than 1 inch off",
  other: "Other",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVIDENCE_BUCKET = "category-images";
const EVIDENCE_FOLDER = "problem-reports";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const orderRef = (orderId: string) => `#${orderId.slice(0, 8).toUpperCase()}`;

// PRB-261127-K7Q4X: the day (India time) plus 5 letters/digits without
// look-alikes - same scheme as the complaint tickets (submit-complaint).
function ticketNumber(): string {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "2-digit", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as Record<string, string>);
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return `PRB-${day.year}${day.month}${day.day}-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

// The video and photos must be the customer's own uploads in their
// problem-reports folder (src/lib/userPhotoUpload.ts), not any link.
function ownEvidence(url: unknown, userId: string): url is string {
  if (typeof url !== "string" || url.length > 1000) return false;
  try {
    const u = new URL(url);
    if (SUPABASE_URL && u.origin !== new URL(SUPABASE_URL).origin) return false;
    return decodeURIComponent(u.pathname).startsWith(`/storage/v1/object/public/${EVIDENCE_BUCKET}/${userId}/${EVIDENCE_FOLDER}/`);
  } catch {
    return false;
  }
}

interface ReportInput {
  orderId: string;
  itemIds: string[];
  reason: string;
  note: string;
  videoUrl: string;
  photoUrls: string[];
}

function validate(body: any, userId: string): { input: ReportInput } | { error: string } {
  const orderId = String(body.order_id ?? "");
  if (!UUID_RE.test(orderId)) return { error: "Order not found." };
  const itemIds = Array.isArray(body.order_item_ids) ? [...new Set(body.order_item_ids.map(String))] as string[] : [];
  if (itemIds.length === 0 || itemIds.length > 50 || !itemIds.every((id) => UUID_RE.test(id))) {
    return { error: "Choose the piece(s) the problem is with." };
  }
  const reason = String(body.reason ?? "");
  if (!REASONS[reason]) return { error: "Choose what the problem is." };
  const note = String(body.note ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .trim();
  if (note.length < NOTE_MIN) return { error: `Please tell us a little more (at least ${NOTE_MIN} characters).` };
  if (note.length > NOTE_MAX) return { error: `Please keep the note under ${NOTE_MAX} characters.` };
  if (!ownEvidence(body.video_url, userId)) return { error: "Please add your unboxing video." };
  const photoUrls = Array.isArray(body.photo_urls) ? [...new Set(body.photo_urls)] : [];
  if (photoUrls.length < MIN_PHOTOS) return { error: "Please add at least one photo of the problem." };
  if (photoUrls.length > MAX_PHOTOS) return { error: `Please add at most ${MAX_PHOTOS} photos.` };
  if (!photoUrls.every((p) => ownEvidence(p, userId))) return { error: "Please upload the photos again." };
  return { input: { orderId, itemIds, reason, note, videoUrl: body.video_url, photoUrls: photoUrls as string[] } };
}

async function adminEmails(supabase: SupabaseClient): Promise<string[]> {
  const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const emails = await Promise.all(
    (roles ?? []).map(async (r) => (await supabase.auth.admin.getUserById(r.user_id)).data?.user?.email ?? null),
  );
  return [...new Set(emails.filter((e): e is string => !!e).map((e) => e.toLowerCase()))];
}

interface ReportItem {
  order_item_id: string;
  vendor_order_id: string;
  vendor_id: string | null;
  product_title: string;
  size: string | null;
  color: string | null;
  quantity: number;
}

const itemLine = (i: ReportItem) =>
  [i.product_title, itemOptionsLabel(i), `Qty ${i.quantity}`].filter(Boolean).join(" · ");

const row = (label: string, value: string) =>
  `<tr><td style="padding:4px 12px 4px 0; color:#6a6a6a; vertical-align:top; white-space:nowrap;">${label}</td><td style="padding:4px 0; color:#2a2a2a;">${value}</td></tr>`;

const noteBlock = (note: string) =>
  `<div style="margin:0 0 20px; padding:14px 16px; background-color:#f8f5f1; border-left:3px solid #7a2e22; white-space:pre-wrap; word-break:break-word;">${esc(note)}</div>`;

const itemsList = (items: ReportItem[]) =>
  `<ul style="margin:0 0 16px; padding-left:20px;">${items.map((i) => `<li style="margin:0 0 4px;">${esc(itemLine(i))}</li>`).join("")}</ul>`;

const evidenceLinks = (videoUrl: string, photoUrls: string[]) =>
  `<p style="margin:0 0 20px;"><a href="${esc(videoUrl)}" style="color:#7a2e22;">Unboxing video</a>${photoUrls
    .map((p, n) => ` · <a href="${esc(p)}" style="color:#7a2e22;">Photo ${n + 1}</a>`)
    .join("")}</p>`;

// Staff copy (admins: every piece; a boutique: only its own pieces, and no
// customer contact details).
function staffEmail(opts: {
  ticket: string;
  orderId: string;
  reportedAt: string;
  reason: string;
  note: string;
  items: ReportItem[];
  videoUrl: string;
  photoUrls: string[];
  customer?: { name: string; email: string | null; phone: string | null };
  link: string;
}) {
  const reasonLabel = REASONS[opts.reason];
  const subject = `Problem reported ${opts.ticket}: ${reasonLabel} - order ${orderRef(opts.orderId)}`;
  const html = emailTemplate({
    preheader: `${reasonLabel} reported on order ${orderRef(opts.orderId)} within 24 hours of delivery.`,
    heading: `Problem reported - ${opts.ticket}`,
    bodyHtml: `
<p style="margin:0 0 16px;">A customer reported a problem with a delivered order, with an unboxing video and photos.${
      opts.customer ? " Reply to this email to answer the customer directly." : " AllBoutiqs will contact you about it."
    }</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px; font-size:14px;">
${row("Ticket", `<strong>${esc(opts.ticket)}</strong>`)}
${row("Order", esc(orderRef(opts.orderId)))}
${row("Reported", esc(opts.reportedAt))}
${row("Problem", esc(reasonLabel))}
${opts.customer ? row("Customer", esc(opts.customer.name)) : ""}
${opts.customer?.email ? row("Email", `<a href="mailto:${esc(opts.customer.email)}" style="color:#7a2e22;">${esc(opts.customer.email)}</a>`) : ""}
${opts.customer?.phone ? row("Mobile", esc(opts.customer.phone)) : ""}
</table>
<p style="margin:0 0 8px; font-weight:600;">Pieces</p>
${itemsList(opts.items)}
<p style="margin:0 0 8px; font-weight:600;">What the customer says</p>
${noteBlock(opts.note)}
${evidenceLinks(opts.videoUrl, opts.photoUrls)}`,
    ctaLabel: "Open the report",
    ctaUrl: `${SITE_URL}${opts.link}`,
  });
  return { subject, html };
}

function customerEmail(opts: { name: string; ticket: string; orderId: string; reportedAt: string; reason: string; items: ReportItem[] }) {
  const subject = `We've received your problem report - ticket ${opts.ticket}`;
  const html = emailTemplate({
    preheader: `Your ticket number is ${opts.ticket}. Our team will contact you about it.`,
    heading: "We've received your report",
    bodyHtml: `
<p style="margin:0 0 16px;">Hi ${esc(opts.name || "there")},</p>
<p style="margin:0 0 16px;">Thank you for telling us, and sorry about the trouble. Your report on order ${esc(orderRef(opts.orderId))} has reached our team and the boutique, with your unboxing video and photos.</p>
<p style="margin:0 0 4px; font-size:13px; color:#6a6a6a;">Your ticket number</p>
<p style="margin:0 0 20px; font-family:'Courier New',Courier,monospace; font-size:24px; font-weight:700; letter-spacing:2px; color:#7a2e22;">${esc(opts.ticket)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px; font-size:14px;">
${row("Reported", esc(opts.reportedAt))}
${row("Problem", esc(REASONS[opts.reason]))}
</table>
${itemsList(opts.items)}
<p style="margin:0 0 16px;">We'll check it and get back to you within 48 hours. Please keep the piece, its tag and the packaging as they are until then, and quote your ticket number whenever you write to us about it.</p>`,
    ctaLabel: "View my orders",
    ctaUrl: `${SITE_URL}${links.customerOrder(opts.orderId)}`,
  });
  return { subject, html };
}

// Saved under a fresh ticket number (a new one on the rare clash).
async function saveReport(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<{ id: string; ticket: string; created_at: string }> {
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await supabase
      .from("problem_reports")
      .insert({ ...row, ticket: ticketNumber() })
      .select("id, ticket, created_at")
      .single();
    if (!error) return data;
    if (error.code !== "23505" || attempt >= 4) throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Please sign in again." }, 401);

    const body = await req.json().catch(() => ({}));
    const checked = validate(body, userId);
    if ("error" in checked) return jsonResponse({ error: checked.error }, 400);
    const input = checked.input;

    const supabase = serviceClient();
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, user_id, customer_name, customer_email, customer_phone")
      .eq("id", input.orderId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    // Only the customer's own order (the same answer as "not there").
    if (!order || order.user_id !== userId) return jsonResponse({ error: "Order not found." }, 404);

    const { data: itemRows, error: itemsErr } = await supabase
      .from("order_items")
      .select("id, vendor_order_id, vendor_id, product_title, size, color, quantity")
      .eq("order_id", order.id)
      .in("id", input.itemIds);
    if (itemsErr) throw itemsErr;
    if (!itemRows || itemRows.length !== input.itemIds.length || itemRows.some((i) => !i.vendor_order_id)) {
      return jsonResponse({ error: "Choose the piece(s) from this order." }, 400);
    }

    // Each piece's part must be delivered, less than 24 hours ago.
    const partIds = [...new Set(itemRows.map((i) => i.vendor_order_id as string))];
    const { data: parts, error: partsErr } = await supabase
      .from("vendor_orders")
      .select("id, vendor_id, status, delivered_at")
      .in("id", partIds);
    if (partsErr) throw partsErr;
    const now = Date.now();
    const closed = partIds.filter((id) => {
      const p = (parts ?? []).find((x) => x.id === id);
      if (!p || p.status !== "delivered" || !p.delivered_at) return true;
      return now - new Date(p.delivered_at).getTime() > WINDOW_HOURS * 3_600_000;
    });
    if (closed.length) {
      return jsonResponse(
        {
          error: `A problem can be reported only within ${WINDOW_HOURS} hours of delivery, and this time has passed for ${
            closed.length === partIds.length ? "this order" : "some of these pieces"
          }.`,
        },
        403,
      );
    }

    const { count: earlier, error: countErr } = await supabase
      .from("problem_reports")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id);
    if (countErr) throw countErr;
    if ((earlier ?? 0) >= MAX_REPORTS_PER_ORDER) {
      return jsonResponse(
        { error: `You've already reported ${MAX_REPORTS_PER_ORDER} problems on this order. We'll get back to you on those.` },
        429,
      );
    }

    const vendorOf = new Map((parts ?? []).map((p) => [p.id, p.vendor_id as string | null]));
    const items: ReportItem[] = itemRows.map((i) => ({
      order_item_id: i.id,
      vendor_order_id: i.vendor_order_id as string,
      vendor_id: i.vendor_id ?? vendorOf.get(i.vendor_order_id as string) ?? null,
      product_title: i.product_title,
      size: i.size,
      color: i.color,
      quantity: i.quantity,
    }));
    const vendorIds = [...new Set(items.map((i) => i.vendor_id).filter((v): v is string => !!v))];

    // 1. Saved first: from here on the report is on record even if an
    // email fails, so the customer is told it went through.
    const saved = await saveReport(supabase, {
      order_id: order.id,
      user_id: userId,
      items,
      vendor_order_ids: partIds,
      vendor_ids: vendorIds,
      reason: input.reason,
      note: input.note,
      video_url: input.videoUrl,
      photo_urls: input.photoUrls,
    });
    const ticket = saved.ticket;
    const reportedAt = formatDateTimeInWords(saved.created_at);
    const reasonLabel = REASONS[input.reason];
    const bellBody = `${reasonLabel} on order ${orderRef(order.id)} (ticket ${ticket}), with an unboxing video and photos.`;

    // 2. Bells, at once.
    await notifyAllAdmins(supabase, {
      category: "order",
      type: "problem_reported",
      title: "Problem reported after delivery",
      body: bellBody,
      link: links.adminProblemReport(saved.id),
    });
    for (const vendorId of vendorIds) {
      await notifyVendorMembers(supabase, vendorId, {
        type: "problem_reported",
        title: "Customer reported a problem",
        body: bellBody,
        link: links.vendorProblemReport(saved.id),
      });
    }

    // 3. Emails: admins (every piece, reply-to the customer)...
    const { data: account } = await supabase.auth.admin.getUserById(userId);
    const customerEmailAddress = (order.customer_email || account?.user?.email || "").trim() || null;
    const admin = staffEmail({
      ticket,
      orderId: order.id,
      reportedAt,
      reason: input.reason,
      note: input.note,
      items,
      videoUrl: input.videoUrl,
      photoUrls: input.photoUrls,
      customer: { name: order.customer_name, email: customerEmailAddress, phone: order.customer_phone },
      link: links.adminProblemReport(saved.id),
    });
    const recipients = await adminEmails(supabase);
    let adminsSent = 0;
    for (const to of recipients) {
      try {
        const r = await sendEmail(to, admin.subject, admin.html, customerEmailAddress ? { replyTo: customerEmailAddress } : {});
        if (r.skipped) break;
        adminsSent++;
      } catch (e) {
        console.error("report-order-problem: admin email failed", ticket, to, errorMessage(e));
      }
    }

    // ...each boutique (its own pieces only)...
    let boutiquesSent = 0;
    if (vendorIds.length) {
      const { data: vendors } = await supabase.from("vendors").select("id, contact_email").in("id", vendorIds);
      for (const v of vendors ?? []) {
        if (!v.contact_email) {
          console.error("report-order-problem: boutique has no contact_email", v.id);
          continue;
        }
        const mail = staffEmail({
          ticket,
          orderId: order.id,
          reportedAt,
          reason: input.reason,
          note: input.note,
          items: items.filter((i) => i.vendor_id === v.id),
          videoUrl: input.videoUrl,
          photoUrls: input.photoUrls,
          link: links.vendorProblemReport(saved.id),
        });
        try {
          const r = await sendEmail(v.contact_email, mail.subject, mail.html);
          if (!r.skipped) boutiquesSent++;
        } catch (e) {
          console.error("report-order-problem: boutique email failed", ticket, v.id, errorMessage(e));
        }
      }
    }

    // ...and the customer's ticket.
    let ackSent = false;
    if (customerEmailAddress) {
      try {
        const ack = customerEmail({ name: order.customer_name, ticket, orderId: order.id, reportedAt, reason: input.reason, items });
        ackSent = !(await sendEmail(customerEmailAddress, ack.subject, ack.html)).skipped;
      } catch (e) {
        console.error("report-order-problem: customer email failed", ticket, errorMessage(e));
      }
    }

    const sentAt = new Date().toISOString();
    const { error: markErr } = await supabase
      .from("problem_reports")
      .update({
        customer_emailed_at: ackSent ? sentAt : null,
        admins_emailed_at: adminsSent > 0 ? sentAt : null,
        boutiques_emailed_at: boutiquesSent > 0 ? sentAt : null,
      })
      .eq("id", saved.id);
    if (markErr) console.error("report-order-problem: marking emails failed", ticket, errorMessage(markErr));

    console.log("report-order-problem: saved", ticket, `admins=${adminsSent}/${recipients.length}`, `boutiques=${boutiquesSent}/${vendorIds.length}`, `ack=${ackSent}`);
    return jsonResponse({ ticket, ack_sent: ackSent });
  } catch (e) {
    console.error("report-order-problem failed", errorMessage(e));
    return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
