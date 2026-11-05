const STORAGE_OBJECT_PATH = "/storage/v1/object/public/";
const STORAGE_RENDER_PATH = "/storage/v1/render/image/public/";

// Supabase Storage's on-the-fly image transformation is a paid (Pro plan)
// feature, switched on per project. The live project allboutiqs-marketplace-live
// answers 403 "FeatureNotEnabled" (checked 2026-11-05), so every resized
// thumbnail broke while the full-size original loaded fine. Resizing is now
// opt-in: set VITE_SUPABASE_IMAGE_TRANSFORM="true" only once the project has
// it enabled. Off, the original url is used as is.
const TRANSFORM_ENABLED = import.meta.env.VITE_SUPABASE_IMAGE_TRANSFORM === "true";

// A product-grid thumbnail has no business downloading a multi-megapixel
// original just to display at ~300px - when transformation is enabled,
// Supabase Storage resizes it instead.
// Falls back to the url untouched for anything that isn't a Supabase
// Storage object url - an admin/vendor-entered external image link can't
// be transformed this way, and must not be broken by this rewrite.
export function getOptimizedImageUrl(
  url: string | null | undefined,
  opts: { width: number; quality?: number } = { width: 600 },
): string | null {
  if (!url) return null;
  if (!TRANSFORM_ENABLED) return url;
  const idx = url.indexOf(STORAGE_OBJECT_PATH);
  if (idx === -1) return url;

  const quality = opts.quality ?? 75;
  const rewritten = url.slice(0, idx) + STORAGE_RENDER_PATH + url.slice(idx + STORAGE_OBJECT_PATH.length);
  const separator = rewritten.includes("?") ? "&" : "?";
  return `${rewritten}${separator}width=${opts.width}&quality=${quality}`;
}
