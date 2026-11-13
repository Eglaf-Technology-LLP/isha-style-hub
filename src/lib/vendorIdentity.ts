import { supabase } from "@/integrations/supabase/client";
import { COMPANY } from "@/lib/company";

// GST number, primary mobile, official business email, bank account number,
// Instagram profile and website (when one is given) belong to one boutique
// only (client, 13 Nov 2026). PAN may be shared: one PAN can have several
// GST numbers, each its own boutique (migration 20261113150000). Before
// saving, a form asks the server (vendor_identity_taken) which of them
// another boutique already has - compared however they were typed - and
// shows "already registered" under each of those fields at once. Triggers
// refuse a duplicate that comes in any other way.

export type IdentityField =
  | "gstin"
  | "primary_mobile"
  | "business_email"
  | "bank_account"
  | "instagram_url"
  | "website_url";

const LABEL: Record<IdentityField, string> = {
  gstin: "GST number",
  primary_mobile: "mobile number",
  business_email: "email address",
  bank_account: "bank account number",
  instagram_url: "Instagram profile",
  website_url: "website",
};

// The boutique's own forms (client wording, 13 Nov 2026).
export const takenMessage = (field: IdentityField) =>
  `This ${LABEL[field]} is already registered with AllBoutiqs. Please contact ${COMPANY.supportEmail}.`;

// Registration: a GST number that's already here means the same seller again.
export const ALREADY_REGISTERED_MESSAGE = `You are already registered with AllBoutiqs. Please contact ${COMPANY.supportEmail}.`;

// Admin > Vendors > Details: the admin is the one to sort it out.
export const takenByAnotherMessage = (field: IdentityField) =>
  `This ${LABEL[field]} is already used by another boutique - enter a different one`;

export type IdentityValues = Partial<Record<IdentityField, string | null | undefined>>;

// Only what the form changed - a boutique that already shares a value with
// another (old test data) can still save its other details.
export function changedIdentity(current: IdentityValues, saved: IdentityValues): IdentityValues {
  const same = (a?: string | null, b?: string | null) =>
    (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
  return Object.fromEntries(
    (Object.keys(current) as IdentityField[])
      .filter((k) => !same(current[k], saved[k]))
      .map((k) => [k, current[k]]),
  );
}

// The fields of `values` another boutique already uses. vendorId: the
// boutique being edited, whose own values don't count.
export async function findTakenIdentity(
  values: IdentityValues,
  vendorId?: string,
): Promise<{ taken: IdentityField[]; error: string | null }> {
  const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => v && v.trim()));
  if (Object.keys(filled).length === 0) return { taken: [], error: null };
  const { data, error } = await supabase.rpc("vendor_identity_taken", {
    _values: filled,
    _vendor_id: vendorId ?? null,
  });
  if (error) return { taken: [], error: error.message };
  return { taken: (data ?? []) as IdentityField[], error: null };
}

// The highest of these elements on the page, to scroll to the first problem.
export function firstOnPage(ids: string[]): HTMLElement | null {
  const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
  return (
    els.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0] ?? null
  );
}
