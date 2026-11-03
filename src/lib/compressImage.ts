// Photos are made smaller in the browser before upload: at most 1600px on
// the long side, WebP (JPEG where the browser can't write WebP). A phone
// photo of 4-10 MB becomes a few hundred KB, so shop pages stay quick and
// storage bandwidth stays low even where Supabase's image resizing isn't
// available. Anything that can't be handled (GIF, SVG, video, a format the
// browser can't read) is uploaded as it is, as is a file already small (or
// a WebP already within the size - one this made earlier).
const MAX_SIDE = 1600;
const QUALITY = 0.82;
const KEEP_BELOW_BYTES = 300 * 1024;

const toBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

export async function compressImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && (file.size <= KEEP_BELOW_BYTES || file.type === "image/webp")) {
    bitmap.close();
    return file;
  }

  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let blob = await toBlob(canvas, "image/webp");
  if (!blob || blob.type !== "image/webp") {
    // JPEG has no transparency - a see-through PNG stays as it is.
    if (file.type !== "image/jpeg" && hasTransparency(ctx, w, h)) return file;
    blob = await toBlob(canvas, "image/jpeg");
  }
  if (!blob || blob.size >= file.size) return file;

  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const name = `${file.name.replace(/\.[^.]*$/, "") || "photo"}.${ext}`;
  return new File([blob], name, { type: blob.type, lastModified: Date.now() });
}
