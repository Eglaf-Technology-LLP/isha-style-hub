import { supabase } from "@/integrations/supabase/client";
import { PHOTO_ACCEPT, PHOTO_FORMATS, fileKind, prepareDocument, preparePhoto } from "@/lib/uploadPrep";

// Proof of a boutique payout's bank transfer (screenshot, receipt or PDF),
// uploaded by the admin who marks it paid. Private bucket: admins and the
// boutique's own members can open it (migration 20261110110000).
export const PAYOUT_PROOF_BUCKET = "payout-proofs";
export const PAYOUT_PROOF_ACCEPT = `${PHOTO_ACCEPT},application/pdf,.pdf`;

const isProofKind = (file: File) => {
  const kind = fileKind(file);
  return kind !== null && kind !== "mp4" && kind !== "mov";
};

export function payoutProofProblem(file: File | null): string | null {
  if (!file) return "Add the proof of the transfer (screenshot, receipt or PDF)";
  if (!isProofKind(file)) return `The proof must be a photo (${PHOTO_FORMATS}) or a PDF`;
  return null;
}

// Stored at <vendor id>/<payout id>/<time>-<file name>; returns that path.
// A photo is made JPG if HEIC and kept under 5 MB, a PDF under 10 MB
// (lib/uploadPrep); throws with the reason when it can't be.
export async function uploadPayoutProof(vendorId: string, payoutId: string, picked: File): Promise<string> {
  const file = fileKind(picked) === "pdf" ? await prepareDocument(picked) : await preparePhoto(picked);
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
