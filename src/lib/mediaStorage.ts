import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { photoCopies } from "@/lib/uploadPrep";

// Shop photos and videos (products, variants, boutique logos/banners, home
// banners, categories) go to Cloudflare R2 once VITE_MEDIA_BASE_URL is set
// to the bucket's public address (client, 22 Nov 2026). Downloads from R2
// are free; from Supabase Storage every byte counts against the plan, and
// on the Free plan the whole project stops at 5 GB a month - which is what
// happened in November. Until it is set, uploads go to Supabase as before.
// Setup: supabase/live-setup/R2_MEDIA.md.
export const MEDIA_BASE_URL = String(import.meta.env.VITE_MEDIA_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

export type MediaFolder = "products" | "vendor-uploads" | "hero" | "categories";

// A photo's smaller copies are found from its name alone - kept in step
// with supabase/functions/_shared/r2.ts, which names the files:
//   <folder>/<id>.sw.jpg  ->  <folder>/<id>.w720.webp, <folder>/<id>.w1600.webp
//   <folder>/<id>.sj.jpg  ->  <folder>/<id>.w720.jpg,  <folder>/<id>.w1600.jpg
const MEDIA_WIDTHS = [720, 1600] as const;
const COPY_EXT: Record<string, string> = { sw: "webp", sj: "jpg" };
const COPIES_NAME = /^(.+)\.(sw|sj)\.[a-z0-9]+$/;

const isMediaUrl = (url: string) => MEDIA_BASE_URL !== "" && url.startsWith(`${MEDIA_BASE_URL}/`);

// The smallest copy at least `width` px wide, or null when there's none
// (a video, a photo kept without copies, or wider than every copy).
export function mediaCopyUrl(url: string, width: number): string | null {
  if (!isMediaUrl(url)) return null;
  const m = COPIES_NAME.exec(url);
  const copyWidth = MEDIA_WIDTHS.find((w) => width <= w);
  if (!m || !copyWidth) return null;
  return `${m[1]}.w${copyWidth}.${COPY_EXT[m[2]]}`;
}

interface UploadLinks {
  url: string;
  uploads: { uploadUrl: string; headers: Record<string, string> }[];
}

async function uploadToR2(file: File, folder: MediaFolder): Promise<string> {
  const copies = file.type.startsWith("image/") ? await photoCopies(file, MEDIA_WIDTHS).catch(() => null) : null;
  const { data, errorMessage } = await invokeEdgeFunction<UploadLinks>("media-upload-url", {
    folder,
    contentType: file.type,
    sizes: copies?.format ?? null,
  });
  if (!data) throw new Error(errorMessage ?? "Couldn't start the upload");
  const bodies: Blob[] = [file, ...(copies?.blobs ?? [])];
  if (data.uploads.length !== bodies.length) throw new Error("The upload links don't match the files");
  // The url is handed out only once the photo and all its copies are there,
  // so a card never points at a copy that is missing.
  await Promise.all(
    data.uploads.map(async (u, i) => {
      const res = await fetch(u.uploadUrl, { method: "PUT", headers: u.headers, body: bodies[i] });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    }),
  );
  return data.url;
}

async function uploadToSupabase(file: File, folder: MediaFolder): Promise<string> {
  // Category images have always sat at the bucket's root.
  const fileName = `${Date.now()}-${file.name}`;
  const path = folder === "categories" ? fileName : `${folder}/${fileName}`;
  const { error } = await supabase.storage.from("category-images").upload(path, file);
  if (error) throw error;
  return supabase.storage.from("category-images").getPublicUrl(path).data.publicUrl;
}

// One shop photo or video; its public url, or null if the upload failed.
// folder: "products", "hero" and "categories" are admin-only;
// "vendor-uploads" is for anything a boutique (or an admin for a boutique)
// uploads.
export async function uploadShopMedia(file: File, folder: MediaFolder): Promise<string | null> {
  try {
    return MEDIA_BASE_URL ? await uploadToR2(file, folder) : await uploadToSupabase(file, folder);
  } catch (e) {
    console.error("Media upload error:", e);
    return null;
  }
}
