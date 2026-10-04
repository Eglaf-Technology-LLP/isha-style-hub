import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const PRODUCT_ORIGINALS_BUCKET = "product-originals";

// Folder = owning vendor id ("platform" for admin-owned products) - the
// bucket's storage policy grants access by matching it to vendor_members.
export async function uploadProductOriginal(file: File, ownerFolder: string): Promise<string | null> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${ownerFolder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(PRODUCT_ORIGINALS_BUCKET).upload(path, file);
  if (error) {
    console.error("uploadProductOriginal failed", error);
    return null;
  }
  return path;
}

// Private bucket: images are only viewable through short-lived signed URLs,
// which storage only issues to the owning boutique's members and admins.
export function useSignedOriginalUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join("|");

  useEffect(() => {
    const missing = paths.filter((p) => !urls[p]);
    if (missing.length === 0) return;
    let cancelled = false;
    supabase.storage
      .from(PRODUCT_ORIGINALS_BUCKET)
      .createSignedUrls(missing, 60 * 60)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setUrls((prev) => {
          const next = { ...prev };
          data.forEach((d) => {
            if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
          });
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}
