import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, serviceClient, errorMessage } from "../_shared/auth.ts";
import { emailTemplate, sendEmail } from "../_shared/email.ts";

// Passwordless sign-in and sign-up for everyone (customers, boutiques,
// admins): {action:"send", email} emails a 6-digit code over our SMTP;
// {action:"verify", email, code} checks it and returns a one-time token
// the browser exchanges for a normal Supabase session
// (supabase.auth.verifyOtp({token_hash, type:"magiclink"})). New emails get
// an account with a random password nobody knows. Public endpoint
// (verify_jwt = false) - the caller isn't signed in yet.

const CODE_TTL_MINUTES = 10;
const RESEND_AFTER_SECONDS = 60;
const MAX_CODES_PER_EMAIL_PER_HOUR = 5;
const MAX_CODES_PER_IP_PER_HOUR = 20;
const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: unknown): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

function clientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || null;
}

// Rejection sampling keeps all 1,000,000 codes equally likely.
function randomCode(): string {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

// Only an HMAC of the code is stored, keyed with a server-only secret
// (OTP_HASH_SECRET function secret).
async function hashCode(email: string, code: string): Promise<string> {
  const secret = Deno.env.get("OTP_HASH_SECRET");
  if (!secret) throw new Error("OTP_HASH_SECRET is not set");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${email}:${code}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomPassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

async function existingUserId(supabase: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("auth_user_id_by_email", { _email: email });
  if (error) throw error;
  return data ?? null;
}

function codeEmail(code: string, isNew: boolean) {
  const subject = `${code} is your AllBoutiqs ${isNew ? "sign-up" : "sign-in"} code`;
  const html = emailTemplate({
    preheader: `Your code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
    heading: isNew ? "Welcome to AllBoutiqs" : "Your sign-in code",
    bodyHtml: `
<p style="margin:0 0 20px;">${isNew ? "Use this code to create your AllBoutiqs account:" : "Use this code to sign in to AllBoutiqs:"}</p>
<p style="margin:0 0 20px; font-family:'Courier New',Courier,monospace; font-size:34px; font-weight:700; letter-spacing:8px; color:#7a2e22;">${code}</p>
<p style="margin:0 0 12px;">It expires in ${CODE_TTL_MINUTES} minutes and works once. If you asked for more than one code, use the newest.</p>
<p style="margin:0; font-size:13px; color:#6a6a6a;">Didn't ask for this? You can ignore this email - nobody can sign in without the code. AllBoutiqs will never ask you to share it.</p>`,
  });
  return { subject, html };
}

async function sendCode(supabase: SupabaseClient, email: string, ip: string | null): Promise<Response> {
  const now = Date.now();
  const hourAgo = new Date(now - 3600_000).toISOString();

  const { data: recent, error: recentErr } = await supabase
    .from("auth_email_otps")
    .select("created_at")
    .eq("email", email)
    .gte("created_at", hourAgo)
    .order("created_at", { ascending: false });
  if (recentErr) throw recentErr;
  if (recent?.length) {
    const wait = RESEND_AFTER_SECONDS - Math.floor((now - new Date(recent[0].created_at).getTime()) / 1000);
    if (wait > 0) {
      return jsonResponse({ error: `Please wait ${wait} seconds before asking for another code.`, retry_after: wait }, 429);
    }
    if (recent.length >= MAX_CODES_PER_EMAIL_PER_HOUR) {
      const oldest = new Date(recent[recent.length - 1].created_at).getTime();
      const wait = Math.ceil((oldest + 3600_000 - now) / 1000);
      return jsonResponse(
        { error: `Too many codes for this email. Try again in ${Math.ceil(wait / 60)} minutes.`, retry_after: wait },
        429,
      );
    }
  }
  if (ip) {
    const { count } = await supabase
      .from("auth_email_otps")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", hourAgo);
    if ((count ?? 0) >= MAX_CODES_PER_IP_PER_HOUR) {
      return jsonResponse({ error: "Too many sign-in attempts from this network. Please try again later." }, 429);
    }
  }

  const code = randomCode();
  const isNew = !(await existingUserId(supabase, email));
  const { data: row, error: insertErr } = await supabase
    .from("auth_email_otps")
    .insert({
      email,
      code_hash: await hashCode(email, code),
      ip,
      expires_at: new Date(now + CODE_TTL_MINUTES * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  try {
    const { subject, html } = codeEmail(code, isNew);
    const result = await sendEmail(email, subject, html);
    if (result.skipped) throw new Error("SMTP is not configured");
  } catch (e) {
    console.error("auth-email-otp: sending the code failed", errorMessage(e));
    await supabase.from("auth_email_otps").delete().eq("id", row.id);
    return jsonResponse({ error: "We couldn't send the code right now. Please try again in a minute." }, 503);
  }

  // Only the newest code works.
  await supabase
    .from("auth_email_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("email", email)
    .is("consumed_at", null)
    .neq("id", row.id);

  return jsonResponse({ sent: true, resend_after: RESEND_AFTER_SECONDS, expires_in: CODE_TTL_MINUTES * 60 });
}

async function verifyCode(supabase: SupabaseClient, email: string, code: string): Promise<Response> {
  if (!/^\d{6}$/.test(code)) return jsonResponse({ error: "Enter the 6-digit code from the email." }, 400);

  const { data: otp, error: otpErr } = await supabase
    .from("auth_email_otps")
    .select("id, code_hash, expires_at")
    .eq("email", email)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (otpErr) throw otpErr;
  if (!otp || new Date(otp.expires_at).getTime() <= Date.now()) {
    return jsonResponse({ error: "This code has expired. Tap Resend code to get a new one.", reason: "expired" }, 400);
  }

  const { data: attempt, error: attemptErr } = await supabase.rpc("claim_email_otp_attempt", {
    _id: otp.id,
    _max_attempts: MAX_ATTEMPTS,
  });
  if (attemptErr) throw attemptErr;
  if (attempt == null) {
    return jsonResponse({ error: "Too many incorrect tries. Tap Resend code to get a new one.", reason: "locked" }, 400);
  }
  if (!sameHash(await hashCode(email, code), otp.code_hash)) {
    const left = MAX_ATTEMPTS - attempt;
    return jsonResponse(
      left > 0
        ? { error: `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`, reason: "wrong", attempts_left: left }
        : { error: "Too many incorrect tries. Tap Resend code to get a new one.", reason: "locked", attempts_left: 0 },
      400,
    );
  }

  const { data: used } = await supabase
    .from("auth_email_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", otp.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!used) {
    return jsonResponse({ error: "This code was already used. Tap Resend code to get a new one.", reason: "expired" }, 400);
  }

  let isNew = false;
  const userId = await existingUserId(supabase, email);
  if (!userId) {
    const { error } = await supabase.auth.admin.createUser({ email, password: randomPassword(), email_confirm: true });
    if (error && !/already|exists/i.test(error.message)) throw error;
    isNew = !error;
  } else {
    // Older accounts that never clicked Supabase's confirmation link: the
    // code just proved they own the address.
    const { data } = await supabase.auth.admin.getUserById(userId);
    if (data?.user && !data.user.email_confirmed_at) {
      await supabase.auth.admin.updateUserById(userId, { email_confirm: true });
    }
  }

  const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr) throw linkErr;
  return jsonResponse({ token_hash: link.properties.hashed_token, is_new_user: isNew });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!email) return jsonResponse({ error: "Enter a valid email address." }, 400);

    const supabase = serviceClient();
    if (body.action === "send") return await sendCode(supabase, email, clientIp(req));
    if (body.action === "verify") return await verifyCode(supabase, email, String(body.code ?? "").trim());
    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("auth-email-otp failed", errorMessage(e));
    return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
