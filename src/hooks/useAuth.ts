import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session, type AuthError } from "@supabase/supabase-js";
import type { Identifier } from "@/lib/authIdentifier";

// The function's {error, retry_after, reason, ...} body, for success and
// failure alike (supabase-js hides a non-2xx body behind error.context).
async function callEmailOtp(body: Record<string, string>): Promise<{ data: any; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("auth-email-otp", { body });
  if (!error) return { data, error: null };
  let parsed: any = null;
  try {
    parsed = await (error as any).context?.json?.();
  } catch {
    // no JSON body (network failure) - fall through to the generic message
  }
  return { data: parsed, error: parsed?.error ?? "Couldn't reach AllBoutiqs. Check your connection and try again." };
}

// Supabase Auth's errors (mobile codes, passwords) in plain words, plus the
// wait in seconds when it's a "too soon" error.
function authError(error: AuthError | null): { error: string | null; retryAfter: number | null } {
  if (!error) return { error: null, retryAfter: null };
  const wait = Number(error.message.match(/after (\d+) seconds?/)?.[1]) || null;
  const text: Record<string, string> = {
    invalid_credentials: "That password doesn't match. No password yet? Sign in with a code, or tap Forgot password.",
    otp_expired: "That code isn't right or has expired. Check it, or tap Resend code.",
    over_sms_send_rate_limit: "Too many codes for this number. Please try again later, or use your email.",
    over_request_rate_limit: wait ? `Please wait ${wait} seconds before trying again.` : "Too many tries. Please wait a minute and try again.",
    sms_send_failed: "We couldn't text a code to this number right now. Please use your email instead.",
    phone_provider_disabled: "Mobile numbers can't be used yet - text messages aren't switched on. Please use your email for now.",
    phone_exists: "This mobile number already has its own AllBoutiqs account. Sign in with it, or use another number.",
    email_exists: "This email already has its own AllBoutiqs account.",
    same_password: "That's already your password.",
    phone_not_confirmed: "This mobile number isn't verified yet. Sign in with a code first.",
    user_banned: "This account has been blocked. Please contact AllBoutiqs support.",
    validation_failed: "Check the email or mobile number and try again.",
  };
  // Supabase says "Unable to get SMS provider" (no code) when texts are off.
  const fromCode =
    (error.code && text[error.code]) || (/sms provider/i.test(error.message) ? text.phone_provider_disabled : undefined);
  if (wait && !fromCode) return { error: `Please wait ${wait} seconds before asking for another code.`, retryAfter: wait };
  // weak_password and anything unexpected: Supabase's own message is clear.
  return { error: fromCode ?? error.message, retryAfter: wait };
}

// A mobile account made in the last 15 minutes is new: the first code
// created it.
const isFresh = (user: User | null | undefined) => !!user && Date.now() - Date.parse(user.created_at) < 15 * 60_000;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Email codes, for everyone (customers, boutiques, admins): a 6-digit
  // code emailed over our SMTP by supabase/functions/auth-email-otp signs
  // in an existing account or creates a new one. The function returns a
  // one-time token that becomes a normal Supabase session here. Supabase's
  // own email sending isn't used (no SMTP set up there).
  const sendEmailCode = async (email: string) => {
    const { data, error } = await callEmailOtp({ action: "send", email });
    return { error, retryAfter: (data?.retry_after ?? data?.resend_after ?? null) as number | null };
  };

  const verifyEmailCode = async (email: string, code: string) => {
    const { data, error } = await callEmailOtp({ action: "verify", email, code });
    if (error) return { error, reason: (data?.reason ?? null) as string | null, isNewUser: false };
    const { error: sessionError } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: "magiclink" });
    return { error: sessionError?.message ?? null, reason: null, isNewUser: !!data.is_new_user };
  };

  // Mobile numbers go through Supabase Auth's own phone sign-in, which
  // texts the code with Twilio Verify. A new number becomes a new account.
  const sendPhoneCode = async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({ phone, options: { channel: "sms" } });
    return authError(error);
  };

  const verifyPhoneCode = async (phone: string, code: string) => {
    const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
    return { error: authError(error).error, isNewUser: !error && isFresh(data.user) };
  };

  // Email or mobile + the password the person chose themselves.
  const signInWithPassword = async (id: Identifier, password: string) => {
    const { error } = await supabase.auth.signInWithPassword(
      id.kind === "email" ? { email: id.value, password } : { phone: id.value, password },
    );
    return { error: authError(error).error };
  };

  // Sets (or replaces) the signed-in person's own password.
  const setPassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } });
    return { error: authError(error).error };
  };

  // Adds or changes the mobile number on the signed-in account: a code is
  // texted to the new number, and the number is saved once it's entered.
  const sendPhoneChangeCode = async (phone: string) => {
    const { error } = await supabase.auth.updateUser({ phone });
    return authError(error);
  };

  const verifyPhoneChange = async (phone: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "phone_change" });
    return { error: authError(error).error };
  };

  // Adds an email to an account that only has a mobile number (code sent
  // over our SMTP by auth-email-otp).
  const sendEmailLinkCode = async (email: string) => {
    const { data, error } = await callEmailOtp({ action: "send", purpose: "link", email });
    return { error, retryAfter: (data?.retry_after ?? data?.resend_after ?? null) as number | null };
  };

  const verifyEmailLink = async (email: string, code: string) => {
    const { error } = await callEmailOtp({ action: "link", email, code });
    if (!error) await supabase.auth.refreshSession();
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return {
    user,
    session,
    loading,
    sendEmailCode,
    verifyEmailCode,
    sendPhoneCode,
    verifyPhoneCode,
    signInWithPassword,
    setPassword,
    sendPhoneChangeCode,
    verifyPhoneChange,
    sendEmailLinkCode,
    verifyEmailLink,
    signOut,
    isAuthenticated: !!user,
  };
}
