const STORAGE_OBJECT_PATH = "/storage/v1/object/public/";
const STORAGE_RENDER_PATH = "/storage/v1/render/image/public/";

// A product-grid thumbnail has no business downloading a multi-megapixel
// original just to display at ~300px - Supabase Storage's on-the-fly
// image transformation (confirmed available on this project: a real 4.8MB
// upload came back at 195KB with width=400&quality=70) resizes it instead.
// Falls back to the url untouched for anything that isn't a Supabase
// Storage object url - an admin/vendor-entered external image link can't
// be transformed this way, and must not be broken by this rewrite.
export function getOptimizedImageUrl(
  url: string | null | undefined,
  opts: { width: number; quality?: number } = { width: 600 },
): string | null {
  if (!url) return null;
  const idx = url.indexOf(STORAGE_OBJECT_PATH);
  if (idx === -1) return url;

  const quality = opts.quality ?? 75;
  const rewritten = url.slice(0, idx) + STORAGE_RENDER_PATH + url.slice(idx + STORAGE_OBJECT_PATH.length);
  const separator = rewritten.includes("?") ? "&" : "?";
  return `${rewritten}${separator}width=${opts.width}&quality=${quality}`;
}
