import type { AuthError, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from './supabase';

// Customer sign-in for the app - the same three ways as the website
// (src/hooks/useAuth.ts on Live-Vendor):
// - email: a 6-digit code from the auth-email-otp edge function, swapped for
//   a normal Supabase session;
// - mobile: Supabase's own SMS code;
// - email or mobile + the password the customer chose.
// Boutique (vendor) and admin accounts can't use the app: they are signed
// out with a note to use the website.

// ---------- what was typed: email or mobile ----------

export type Identifier =
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseIdentifier(raw: string): Identifier | null {
  const text = raw.trim();
  if (text.includes('@')) {
    const email = text.toLowerCase();
    return email.length <= 254 && EMAIL_RE.test(email)
      ? { kind: 'email', value: email }
      : null;
  }
  const phone = toE164(text);
  return phone ? { kind: 'phone', value: phone } : null;
}

// "+919876543210", or null. Indian numbers can be typed as 10 digits, with
// 0 or 91 in front, or as +91...; other countries need the + form.
export function toE164(raw: string): string | null {
  const text = raw.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(text)) return null;
  if (text.startsWith('+')) return /^\+[1-9]\d{7,14}$/.test(text) ? text : null;
  const indian = text.replace(/^(91|0)(?=[6-9]\d{9}$)/, '');
  return /^[6-9]\d{9}$/.test(indian) ? `+91${indian}` : null;
}

// Before the whole number is typed: does it look like a phone so far?
export const looksLikePhone = (raw: string) =>
  /^\+?[\d\s\-().]+$/.test(raw.trim()) && /\d/.test(raw);

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91'))
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return `+${digits}`;
}

export const userContact = (user: User | null | undefined) =>
  user?.email || formatPhone(user?.phone) || '';
export const PASSWORD_MIN_LENGTH = 8;

// Set when the customer chooses their own password (accounts start with
// one-time codes only). A display hint, kept in user_metadata - same as the website.
export const hasOwnPassword = (user: User | null | undefined) =>
  !!user?.user_metadata?.password_set;

// ---------- errors in plain words (same text as the website) ----------

function authError(error: AuthError | null): {
  error: string | null;
  retryAfter: number | null;
} {
  if (!error) return { error: null, retryAfter: null };
  const wait = Number(error.message.match(/after (\d+) seconds?/)?.[1]) || null;
  const text: Record<string, string> = {
    invalid_credentials:
      "That password doesn't match. No password yet? Sign in with a code instead.",
    otp_expired:
      "That code isn't right or has expired. Check it, or tap Resend code.",
    over_sms_send_rate_limit:
      'Too many codes for this number. Please try again later, or use your email.',
    over_request_rate_limit: wait
      ? `Please wait ${wait} seconds before trying again.`
      : 'Too many tries. Please wait a minute and try again.',
    sms_send_failed:
      "We couldn't text a code to this number right now. Please use your email instead.",
    phone_provider_disabled:
      "Mobile numbers can't be used yet - text messages aren't switched on. Please use your email for now.",
    user_banned:
      'This account has been blocked. Please contact AllBoutiqs support.',
    validation_failed: 'Check the email or mobile number and try again.',
  };
  const fromCode =
    (error.code && text[error.code]) ||
    (/sms provider/i.test(error.message)
      ? text.phone_provider_disabled
      : undefined);
  if (wait && !fromCode)
    return {
      error: `Please wait ${wait} seconds before asking for another code.`,
      retryAfter: wait,
    };
  return { error: fromCode ?? error.message, retryAfter: wait };
}

// The function's {error, retry_after, reason, ...} body for success and
// failure alike (supabase-js hides a non-2xx body behind error.context).
async function callEmailOtp(
  body: Record<string, string>,
): Promise<{ data: any; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('auth-email-otp', {
    body,
  });
  if (!error) return { data, error: null };
  let parsed: any = null;
  try {
    parsed = await (error as any).context?.json?.();
  } catch {
    // no JSON body (network failure)
  }
  return {
    data: parsed,
    error:
      parsed?.error ??
      "Couldn't reach AllBoutiqs. Check your connection and try again.",
  };
}

const isFresh = (user: User | null | undefined) =>
  !!user && Date.now() - Date.parse(user.created_at) < 15 * 60_000;

export async function sendCode(id: Identifier) {
  if (id.kind === 'email') {
    const { data, error } = await callEmailOtp({
      action: 'send',
      email: id.value,
    });
    return {
      error,
      retryAfter: (data?.retry_after ?? data?.resend_after ?? null) as
        | number
        | null,
    };
  }
  const { error } = await supabase.auth.signInWithOtp({
    phone: id.value,
    options: { channel: 'sms' },
  });
  return authError(error);
}

export async function verifyCode(
  id: Identifier,
  code: string,
): Promise<{ error: string | null; isNewUser: boolean }> {
  if (id.kind === 'email') {
    const { data, error } = await callEmailOtp({
      action: 'verify',
      email: id.value,
      code,
    });
    if (error) return { error, isNewUser: false };
    const { error: e } = await supabase.auth.verifyOtp({
      token_hash: data.token_hash,
      type: 'magiclink',
    });
    return { error: e?.message ?? null, isNewUser: !!data.is_new_user };
  }
  const { data, error } = await supabase.auth.verifyOtp({
    phone: id.value,
    token: code,
    type: 'sms',
  });
  return {
    error: authError(error).error,
    isNewUser: !error && isFresh(data.user),
  };
}

export async function signInWithPassword(id: Identifier, password: string) {
  const { error } = await supabase.auth.signInWithPassword(
    id.kind === 'email'
      ? { email: id.value, password }
      : { phone: id.value, password },
  );
  return { error: authError(error).error };
}

export async function setOwnPassword(password: string) {
  const { error } = await supabase.auth.updateUser({
    password,
    data: { password_set: true },
  });
  return { error: authError(error).error };
}

// ---------- consent (Privacy Policy + customer Terms) ----------

// The version a customer accepts - LEGAL_UPDATED in the website's
// src/lib/legal.ts. Change both together.
export const LEGAL_UPDATED = '2026-10-25';

export const acceptTerms = (marketing: boolean | null) =>
  supabase.rpc('accept_terms', {
    _kind: 'customer',
    _version: LEGAL_UPDATED,
    _marketing: marketing,
  });

// ---------- the session, shared by every screen ----------

type Status = 'loading' | 'signed-out' | 'signed-in';

interface SessionState {
  status: Status;
  user: User | null;
  // Customer hasn't accepted the current Terms yet (asked once after sign-in).
  needsConsent: boolean;
  // Set when a vendor/admin account was signed out; shown on the sign-in screen.
  notice: string | null;
  // Consent ticked on "Create account", saved as soon as the account exists.
  pendingConsent: { marketing: boolean } | null;
  setPendingConsent: (p: { marketing: boolean } | null) => void;
  clearNotice: () => void;
  markConsented: () => void;
}

export const useSession = create<SessionState>(set => ({
  status: 'loading',
  user: null,
  needsConsent: false,
  notice: null,
  pendingConsent: null,
  setPendingConsent: pendingConsent => set({ pendingConsent }),
  clearNotice: () => set({ notice: null }),
  markConsented: () => set({ needsConsent: false }),
}));

const STAFF_NOTICE =
  'This is a boutique or admin account. The AllBoutiqs app is for shopping - please use the website for the seller and admin areas, or sign in with a customer account.';

// Admin (has_role) or boutique member (vendor_members) - not allowed in the app.
async function isStaff(userId: string): Promise<boolean> {
  const [admin, member] = await Promise.all([
    supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
    supabase
      .from('vendor_members')
      .select('vendor_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
  ]);
  return admin.data === true || !!member.data;
}

async function onUser(user: User | null) {
  if (!user) {
    useSession.setState({
      status: 'signed-out',
      user: null,
      needsConsent: false,
    });
    return;
  }
  if (await isStaff(user.id)) {
    await supabase.auth.signOut();
    useSession.setState({
      status: 'signed-out',
      user: null,
      needsConsent: false,
      notice: STAFF_NOTICE,
    });
    return;
  }
  const { data } = await supabase
    .from('profiles')
    .select('terms_accepted_at')
    .eq('user_id', user.id)
    .maybeSingle();
  let needsConsent = !data?.terms_accepted_at;
  const pending = useSession.getState().pendingConsent;
  if (needsConsent && pending) {
    const { error } = await acceptTerms(pending.marketing);
    if (!error) needsConsent = false;
  }
  useSession.setState({
    status: 'signed-in',
    user,
    needsConsent,
    pendingConsent: null,
  });
}

let started = false;
// Called once from App: restore the saved session and follow sign-in/out.
export function startSession() {
  if (started) return;
  started = true;
  supabase.auth
    .getSession()
    .then(({ data }) => onUser(data.session?.user ?? null));
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    if (
      event === 'SIGNED_IN' ||
      event === 'SIGNED_OUT' ||
      event === 'USER_UPDATED'
    ) {
      // Outside the auth callback, as Supabase recommends for further queries.
      setTimeout(() => onUser(session?.user ?? null), 0);
    }
  });
}

export const signOut = () => supabase.auth.signOut();
