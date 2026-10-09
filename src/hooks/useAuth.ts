import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";

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

  // Passwordless for everyone (customers, boutiques, admins): a 6-digit
  // code emailed over our SMTP by supabase/functions/auth-email-otp signs
  // in an existing account or creates a new one. The function returns a
  // one-time token that becomes a normal Supabase session here.
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
    signOut,
    isAuthenticated: !!user,
  };
}
