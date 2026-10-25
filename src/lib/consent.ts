import { supabase } from "@/integrations/supabase/client";
import { LEGAL_PATHS, LEGAL_UPDATED } from "@/lib/legal";

// Privacy Policy + Terms (required) and promotional emails (optional),
// asked when an account is created - customers accept the Terms &
// Conditions, sellers the Seller Terms & Conditions. Saved on the profile by
// accept_terms() (the server stamps the time).
export type ConsentKind = "customer" | "seller";

export const TERMS_FOR: Record<ConsentKind, { label: string; path: string }> = {
  customer: { label: "Terms & Conditions", path: LEGAL_PATHS.terms },
  seller: { label: "Seller Terms & Conditions", path: LEGAL_PATHS.sellerTerms },
};

export const acceptTerms = (kind: ConsentKind, marketing: boolean | null) =>
  supabase.rpc("accept_terms", { _kind: kind, _version: LEGAL_UPDATED, _marketing: marketing });

// "Create account" ticks the boxes before the code is sent; the account
// only exists once the code is verified, so the choice waits here (this
// tab only) and ConsentGate saves it as soon as the person is signed in.
const PENDING_KEY = "allboutiqs-pending-consent";

export function savePendingConsent(kind: ConsentKind, marketing: boolean) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ kind, marketing, at: Date.now() }));
  } catch {
    // Storage blocked: they'll be asked once after signing in instead.
  }
}

export function takePendingConsent(kind: ConsentKind): { marketing: boolean } | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
    if (!p || p.kind !== kind || Date.now() - p.at > 30 * 60_000) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return { marketing: !!p.marketing };
  } catch {
    return null;
  }
}
