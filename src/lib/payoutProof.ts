import { supabase } from "@/integrations/supabase/client";

// Proof of a boutique payout's bank transfer (screenshot, receipt or PDF),
// uploaded by the admin who marks it paid. Private bucket: admins and the
// boutique's own members can open it (migration 20261110110000).
export const PAYOUT_PROOF_BUCKET = "payout-proofs";
export const PAYOUT_PROOF_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";
const MAX_BYTES = 10 * 1024 * 1024;

export function payoutProofProblem(file: File | null): string | null {
  if (!file) return "Add the proof of the transfer (screenshot, receipt or PDF)";
  if (!PAYOUT_PROOF_ACCEPT.split(",").includes(file.type)) return "The proof must be a photo (JPG, PNG, WEBP, HEIC) or a PDF";
  if (file.size > MAX_BYTES) return "The proof must be 10 MB or smaller";
  return null;
}

// Stored at <vendor id>/<payout id>/<time>-<file name>; returns that path.
export async function uploadPayoutProof(vendorId: string, payoutId: string, file: File): Promise<string> {
  const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80) || "proof";
  const path = `${vendorId}/${payoutId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from(PAYOUT_PROOF_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message || "Couldn't upload the proof");
  return path;
}

// Opens the proof in a new tab through a short-lived private link. The tab
// is opened first so the browser doesn't block it as a pop-up.
export async function openPayoutProof(path: string): Promise<string | null> {
  const tab = window.open("", "_blank");
  const { data, error } = await supabase.storage.from(PAYOUT_PROOF_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    tab?.close();
    return error?.message || "Couldn't open the proof";
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
  return null;
}
