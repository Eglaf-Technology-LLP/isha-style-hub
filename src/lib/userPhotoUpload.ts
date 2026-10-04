import { supabase } from "@/integrations/supabase/client";

const BUCKET = "category-images";

// Customers may only write under their own top-level folder in this bucket
// (storage policy: foldername[1] = auth.uid()).
export async function uploadUserPhoto(file: File, subfolder: string): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${session.user.id}/${subfolder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) {
    console.error("uploadUserPhoto failed", error);
    return null;
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

export async function deletePublicPhoto(url: string): Promise<void> {
  const path = storagePathFromPublicUrl(url);
  if (path) await supabase.storage.from(BUCKET).remove([path]);
}
