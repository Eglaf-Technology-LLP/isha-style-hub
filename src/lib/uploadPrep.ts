// Every file a person uploads goes through here before it is stored
// (client corrections, 16 Nov 2026):
//   photos     JPG, PNG, WEBP, HEIC   up to 5 MB
//   videos     MP4, MOV               up to 50 MB
//   documents  PDF, JPG, PNG          up to 10 MB
// A bigger file is compressed in the browser, keeping it sharp and readable.
// Product videos are also re-encoded visually lossless whenever that makes
// them smaller (20 Nov 2026, see SHRINK_QUANTIZER). The person only sees an error for a format we don't take, or a file that
// still can't be brought under the limit. The heavy converters (HEIC
// decoder, video encoder, PDF renderer) load only when a file needs them.

const MB = 1024 * 1024;
export const PHOTO_MAX_BYTES = 5 * MB;
export const VIDEO_MAX_BYTES = 50 * MB;
export const DOCUMENT_MAX_BYTES = 10 * MB;

// For <input accept>. Extensions too: Windows gives .heic files no type.
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";
export const VIDEO_ACCEPT = "video/mp4,video/quicktime,.mp4,.mov";
export const DOCUMENT_ACCEPT = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

export const PHOTO_FORMATS = "JPG, PNG, WEBP or HEIC";
export const VIDEO_FORMATS = "MP4 or MOV";
export const DOCUMENT_FORMATS = "PDF, JPG or PNG";

// Why a file can't be used, written for the person who picked it.
export class UploadProblem extends Error {
  name = "UploadProblem";
}

// The message to show for anything prepare*() threw.
export function uploadProblemMessage(e: unknown, fileName?: string): string {
  if (e instanceof UploadProblem) return e.message;
  console.error("upload preparation failed", e);
  return fileName ? `Couldn't prepare ${quoted(fileName)} - please try again` : "Couldn't prepare the file - please try again";
}

type Kind = "jpeg" | "png" | "webp" | "heic" | "mp4" | "mov" | "pdf";

const MIME_OF: Record<Kind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  pdf: "application/pdf",
};

const KIND_OF_MIME: Record<string, Kind> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heic",
  "image/heic-sequence": "heic",
  "image/heif-sequence": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
};

const KIND_OF_EXT: Record<string, Kind> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  jfif: "jpeg",
  png: "png",
  webp: "webp",
  heic: "heic",
  heif: "heic",
  mp4: "mp4",
  m4v: "mp4",
  mov: "mov",
  qt: "mov",
  pdf: "pdf",
};

const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");
const quoted = (name: string) => `"${name.length > 60 ? `${name.slice(0, 40)}…${name.slice(-15)}` : name}"`;

function renamed(name: string, ext: string) {
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  return `${base || "file"}.${ext}`;
}

// From the name and the type the browser reports: instant, for sorting
// dropped files into photos and videos. prepare*() also checks the content.
export function fileKind(file: File): Kind | null {
  return KIND_OF_MIME[file.type.toLowerCase()] ?? KIND_OF_EXT[extensionOf(file.name)] ?? null;
}

export function looksLikeVideo(file: File): boolean {
  const kind = fileKind(file);
  return kind === "mp4" || kind === "mov" || file.type.startsWith("video/");
}

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);
const QUICKTIME_ATOMS = new Set(["moov", "mdat", "wide", "free", "skip", "pnot"]);

// The real format, from the first bytes (a renamed file can't fool it).
async function sniffKind(file: File): Promise<Kind | null> {
  const b = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const text = (from: number, to: number) => String.fromCharCode(...b.subarray(from, Math.min(to, b.length)));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && text(1, 4) === "PNG") return "png";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "webp";
  if (text(4, 8) === "ftyp") {
    const size = Math.min(b.length, (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]);
    const brands = [text(8, 12)];
    for (let i = 16; i + 4 <= size; i += 4) brands.push(text(i, i + 4));
    if (brands[0] === "qt  ") return "mov";
    if (brands.some((x) => HEIC_BRANDS.has(x))) return "heic";
    // AVIF, 3GP and other image/phone formats we don't take.
    if (brands.some((x) => x === "avif" || x === "avis" || x === "mif1" || x === "msf1" || x.startsWith("3g"))) return null;
    return "mp4";
  }
  if (QUICKTIME_ATOMS.has(text(4, 8))) return "mov";
  if (text(0, 1024).includes("%PDF-")) return "pdf";
  return null;
}

// Photos and PDFs are always recognised by their content, so a file merely
// named .jpg is refused; an old MOV may start in ways not sniffed above,
// so videos fall back to the name.
async function detectKind(file: File): Promise<Kind | null> {
  const sniffed = await sniffKind(file).catch(() => null);
  if (sniffed) return sniffed;
  const named = fileKind(file);
  return named === "mp4" || named === "mov" ? named : null;
}

function withType(file: File, kind: Kind): File {
  const type = MIME_OF[kind];
  return file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}

const unreadable = (name: string) => new UploadProblem(`${quoted(name)} couldn't be opened. It may be damaged - please choose another file.`);

// ---------- photos ----------

// Long edge and pixel count a photo is kept within when it is re-encoded:
// plenty for zooming in on a product, and inside phone browsers' canvas limits.
const MAX_EDGE = 4096;
const MAX_PIXELS = 16_000_000;
const PHOTO_MIN_EDGE = 1600;
const QUALITIES = [0.92, 0.86, 0.8, 0.72];

const decodeImage = (blob: Blob) => createImageBitmap(blob, { imageOrientation: "from-image" });

async function decodeHeic(file: File): Promise<ImageBitmap> {
  // Safari opens HEIC itself; other browsers need the decoder.
  try {
    return await decodeImage(file);
  } catch {
    const { heicTo } = await import("heic-to");
    return heicTo({ blob: file, type: "bitmap" });
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

let webpSupport: Promise<boolean> | null = null;
function canEncodeWebp(): Promise<boolean> {
  webpSupport ??= (async () => {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    return (await canvasToBlob(c, "image/webp", 0.9))?.type === "image/webp";
  })();
  return webpSupport;
}

// Re-encodes the image at the best quality that fits under maxBytes: first
// lower JPEG/WEBP quality, then smaller dimensions, never below minEdge.
async function encodeUnder(
  image: ImageBitmap,
  maxBytes: number,
  type: "image/jpeg" | "image/webp",
  { maxEdge = MAX_EDGE, minEdge = PHOTO_MIN_EDGE, qualities = QUALITIES } = {},
): Promise<{ blob: Blob; width: number; height: number } | null> {
  const { width: w, height: h } = image;
  let scale = Math.min(1, maxEdge / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
  const canvas = document.createElement("canvas");
  try {
    for (;;) {
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      if (type === "image/jpeg") {
        // JPEG has no transparency: transparent areas go white, not black.
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const q of qualities) {
        const blob = await canvasToBlob(canvas, type, q);
        if (blob && blob.size <= maxBytes) return { blob, width: canvas.width, height: canvas.height };
      }
      if (Math.max(canvas.width, canvas.height) * 0.8 < minEdge) return null;
      scale *= 0.8;
    }
  } finally {
    // Frees the canvas memory straight away (phones run out quickly).
    canvas.width = canvas.height = 0;
  }
}

// A JPG, PNG or WEBP of at most maxBytes, ready to upload. HEIC photos are
// turned into JPG so every browser can show them; a photo already within
// the limit is uploaded untouched.
export async function preparePhoto(file: File, maxBytes = PHOTO_MAX_BYTES): Promise<File> {
  const kind = await detectKind(file);
  if (kind !== "jpeg" && kind !== "png" && kind !== "webp" && kind !== "heic") {
    throw new UploadProblem(`${quoted(file.name)} isn't a photo format we take. Please use ${PHOTO_FORMATS}.`);
  }
  if (kind !== "heic" && file.size <= maxBytes) return withType(file, kind);

  let image: ImageBitmap;
  try {
    image = kind === "heic" ? await decodeHeic(file) : await decodeImage(file);
  } catch {
    throw unreadable(file.name);
  }
  try {
    // PNG and WEBP may be transparent, which WEBP keeps (JPEG can't).
    const type = kind === "png" || kind === "webp" ? ((await canEncodeWebp()) ? "image/webp" : "image/jpeg") : "image/jpeg";
    const result = await encodeUnder(image, maxBytes, type);
    if (!result) {
      throw new UploadProblem(`${quoted(file.name)} is still over ${maxBytes / MB} MB after compressing. Please choose a smaller photo.`);
    }
    return new File([result.blob], renamed(file.name, type === "image/webp" ? "webp" : "jpg"), {
      type,
      lastModified: file.lastModified,
    });
  } finally {
    image.close();
  }
}

// ---------- videos ----------

// Video bitrate never goes below this (it would look blocky); a clip that
// needs less to fit is too long and must be trimmed.
const MIN_VIDEO_BPS = 600_000;
const MAX_VIDEO_BPS = 8_000_000;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

// Product videos are re-encoded "visually lossless" (client, 20 Nov 2026:
// the quality and the timing must not change). Same picture size, frame
// rate, frames and timing, the sound copied byte for byte - only a phone
// camera's bitrate (~16 Mbps at 1080p) comes down. Quantizer 20 works like
// ffmpeg's CRF 20: on the live product videos every sampled frame kept SSIM
// ~0.99 and PSNR 42+ dB at 36-47% less size. A browser whose encoder can't
// do quantizer mode uses SHRINK_BITS_PER_PIXEL as the bitrate instead
// (0.16 let single frames dip to PSNR 39 on those videos; 0.20 doesn't).
const SHRINK_QUANTIZER = 20;
const SHRINK_BITS_PER_PIXEL = 0.2;
// A video already leaner than this (bits per pixel per frame) can't get
// smaller at that quality, so it isn't tried.
const SHRINK_LEAN_BITS_PER_PIXEL = 0.12;
// The result is used only if it saves at least this much...
const SHRINK_MIN_SAVING = 0.15;
// ...and each of these frames, spread over the video, matches the original's
// frame at the same moment at least this closely (luma SSIM and PSNR). So an
// encoder on some phone that does worse can never lower the quality: the
// original is uploaded instead.
const SHRINK_CHECK_FRAMES = 10;
const SHRINK_MIN_SSIM = 0.978;
const SHRINK_MIN_PSNR = 40;

// An MP4 or MOV of at most 50 MB. With { shrink: true } (product videos) it
// is first re-encoded visually lossless, as above. A video still over 50 MB
// is re-encoded to H.264 MP4 (plays everywhere) at the highest resolution and
// bitrate that fit: 1080p for most phone clips, less only for long ones.
// Sound is kept as it is.
export async function prepareVideo(
  file: File,
  onProgress?: (fraction: number) => void,
  { shrink = false }: { shrink?: boolean } = {},
): Promise<File> {
  const kind = await detectKind(file);
  if (kind !== "mp4" && kind !== "mov") {
    throw new UploadProblem(`${quoted(file.name)} isn't a video format we take. Please use ${VIDEO_FORMATS}.`);
  }
  if (shrink) {
    const smaller = await shrinkVideo(file, onProgress);
    if (smaller && smaller.size <= VIDEO_MAX_BYTES) return smaller;
  }
  if (file.size <= VIDEO_MAX_BYTES) return withType(file, kind);

  const mb = await import("mediabunny");
  const cantCompress = new UploadProblem(
    `This browser can't compress ${quoted(file.name)}. Please trim it to under 50 MB, or try again in the latest Chrome or Safari.`,
  );
  if (typeof VideoEncoder === "undefined") throw cantCompress;

  const probe = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  let duration: number;
  let displayWidth: number;
  let displayHeight: number;
  let frameRate: number;
  let audioBps = 0;
  let reencodeAudio = false;
  try {
    const video = await probe.getPrimaryVideoTrack();
    if (!video) throw unreadable(file.name);
    if (!(await video.canDecode())) throw cantCompress;
    duration = await probe.computeDuration();
    displayWidth = video.displayWidth;
    displayHeight = video.displayHeight;
    frameRate = (await video.computePacketStats(120)).averagePacketRate;
    const audio = await probe.getPrimaryAudioTrack();
    if (audio) {
      audioBps = (await audio.computePacketStats(500)).averageBitrate;
      // Uncompressed or very high-bitrate sound is re-encoded at 128 kbps.
      if (audioBps > 192_000) {
        reencodeAudio = true;
        audioBps = 128_000;
      }
    }
  } catch (e) {
    if (e instanceof UploadProblem) throw e;
    throw unreadable(file.name);
  } finally {
    probe.dispose();
  }
  if (!(duration > 0) || !displayWidth || !displayHeight) throw unreadable(file.name);

  // 10% headroom for the MP4 container and encoder overshoot.
  const budgetBits = VIDEO_MAX_BYTES * 8 * 0.9;
  let videoBps = Math.min(MAX_VIDEO_BPS, budgetBits / duration - audioBps);
  if (videoBps < MIN_VIDEO_BPS) {
    const minutes = Math.max(1, Math.floor(budgetBits / (MIN_VIDEO_BPS + audioBps) / 60));
    throw new UploadProblem(
      `${quoted(file.name)} is too long to fit in 50 MB. Please trim it to ${minutes} minute${minutes === 1 ? "" : "s"} or less and try again.`,
    );
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    // The short side the bitrate can keep sharp.
    const shortSide = videoBps >= 3_500_000 ? 1080 : videoBps >= 1_800_000 ? 720 : videoBps >= 1_000_000 ? 540 : 480;
    const scale = Math.min(1, shortSide / Math.min(displayWidth, displayHeight));
    const width = even(displayWidth * scale);
    const height = even(displayHeight * scale);
    const quality = new mb.Quality({ bitrate: Math.round(videoBps) });
    if (!(await mb.canEncodeVideo("avc", { width, height, quality }))) throw cantCompress;

    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    let buffer: ArrayBuffer | null;
    try {
      const conversion = await mb.Conversion.init({
        input,
        output,
        video: {
          codec: "avc",
          width,
          height,
          fit: "fill",
          quality,
          // 60 fps phone clips go to 30: half the data, same look for a product.
          frameRate: frameRate > 31 ? 30 : undefined,
          forceTranscode: true,
        },
        // No codec named: the browser's best MP4 one (AAC, else Opus).
        audio: reencodeAudio ? { quality: new mb.Quality({ bitrate: 128_000 }) } : undefined,
        showWarnings: false,
      });
      if (!conversion.isValid || conversion.discardedTracks.some((t) => t.track.type === "video")) throw cantCompress;
      conversion.onProgress = (p) => onProgress?.(p);
      await conversion.execute();
      buffer = output.target.buffer;
    } catch (e) {
      if (e instanceof UploadProblem) throw e;
      console.error("video compression failed", e);
      throw cantCompress;
    } finally {
      input.dispose();
    }
    if (!buffer) throw cantCompress;
    if (buffer.byteLength <= VIDEO_MAX_BYTES) {
      return new File([buffer], renamed(file.name, "mp4"), { type: "video/mp4", lastModified: file.lastModified });
    }
    // The encoder overshot: once more, scaled down by how far over it went.
    videoBps = (videoBps * (VIDEO_MAX_BYTES * 0.85)) / buffer.byteLength;
    if (videoBps < MIN_VIDEO_BPS) break;
  }
  throw new UploadProblem(`${quoted(file.name)} is still over 50 MB after compressing. Please trim it and try again.`);
}

type Mediabunny = typeof import("mediabunny");

interface VideoFacts {
  width: number;
  height: number;
  frameRate: number;
  videoBps: number;
  duration: number;
  // Frames shown while it plays. An edited MOV can hold a few frames before
  // 0 s that the editor cut and no player shows; a re-encode leaves them out.
  shownFrames: number;
  audio: string | null;
}

// The visually lossless re-encode described at SHRINK_QUANTIZER, or null
// when the browser can't do it, it wouldn't save enough, or the result isn't
// the same video in every way checked - the original is used then.
async function shrinkVideo(file: File, onProgress?: (fraction: number) => void): Promise<File | null> {
  if (typeof VideoEncoder === "undefined") return null;
  try {
    const mb = await import("mediabunny");
    const before = await videoFacts(mb, file);
    if (!before) return null;
    const { width, height } = before;
    const pixelsPerSecond = width * height * before.frameRate;
    if (before.videoBps < SHRINK_LEAN_BITS_PER_PIXEL * pixelsPerSecond) return null;
    const quality = new mb.Quality({
      quantizer: SHRINK_QUANTIZER,
      bitrate: Math.round(SHRINK_BITS_PER_PIXEL * pixelsPerSecond),
      bitrateMode: "variable",
    });
    if (!(await mb.canEncodeVideo("avc", { width, height, quality }))) return null;

    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    let buffer: ArrayBuffer | null;
    try {
      const conversion = await mb.Conversion.init({
        input,
        output,
        // No size or frame rate given: both stay as they are. The sound
        // isn't named either, so it is copied as it is.
        video: { codec: "avc", quality, forceTranscode: true, keyFrameInterval: 2 },
        showWarnings: false,
      });
      if (!conversion.isValid || conversion.discardedTracks.length > 0) return null;
      conversion.onProgress = (p) => onProgress?.(p * 0.9);
      await conversion.execute();
      buffer = output.target.buffer;
    } finally {
      input.dispose();
    }
    if (!buffer || buffer.byteLength > file.size * (1 - SHRINK_MIN_SAVING)) return null;

    const result = new File([buffer], renamed(file.name, "mp4"), { type: "video/mp4", lastModified: file.lastModified });
    const after = await videoFacts(mb, result);
    const sameTiming =
      !!after &&
      after.width === width &&
      after.height === height &&
      after.shownFrames === before.shownFrames &&
      Math.abs(after.duration - before.duration) <= 1 / before.frameRate &&
      after.audio === before.audio;
    if (!sameTiming || !(await looksTheSame(mb, file, result, before.duration))) return null;
    onProgress?.(1);
    return result;
  } catch (e) {
    console.warn("Video kept as uploaded: re-encoding it failed", e);
    return null;
  }
}

async function videoFacts(mb: Mediabunny, file: File): Promise<VideoFacts | null> {
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video || !(await video.canDecode())) return null;
    const stats = await video.computePacketStats();
    let shownFrames = 0;
    for await (const packet of new mb.EncodedPacketSink(video).packets(undefined, undefined, { metadataOnly: true })) {
      if (packet.timestamp + packet.duration > 1e-6) shownFrames++;
    }
    const audio = await input.getPrimaryAudioTrack();
    return {
      width: video.displayWidth,
      height: video.displayHeight,
      frameRate: stats.averagePacketRate,
      videoBps: stats.averageBitrate,
      duration: await input.computeDuration(),
      shownFrames,
      audio: audio ? `${audio.codec}/${audio.numberOfChannels}ch/${audio.sampleRate}Hz` : null,
    };
  } finally {
    input.dispose();
  }
}

// SHRINK_CHECK_FRAMES moments spread over the video: the re-encoded frame
// shown at each must be the original's frame (same timestamp) and match it
// to SHRINK_MIN_SSIM / SHRINK_MIN_PSNR.
async function looksTheSame(mb: Mediabunny, original: File, encoded: File, duration: number): Promise<boolean> {
  const a = new mb.Input({ source: new mb.BlobSource(original), formats: mb.ALL_FORMATS });
  const b = new mb.Input({ source: new mb.BlobSource(encoded), formats: mb.ALL_FORMATS });
  try {
    const [trackA, trackB] = [await a.getPrimaryVideoTrack(), await b.getPrimaryVideoTrack()];
    if (!trackA || !trackB) return false;
    const sinkA = new mb.CanvasSink(trackA, { poolSize: 1 });
    const sinkB = new mb.CanvasSink(trackB, { poolSize: 1 });
    for (let i = 0; i < SHRINK_CHECK_FRAMES; i++) {
      const t = ((i + 0.5) * duration) / SHRINK_CHECK_FRAMES;
      const frameA = await sinkA.getCanvas(t);
      const lumaA = frameA && lumaOf(frameA.canvas);
      const frameB = await sinkB.getCanvas(t);
      const lumaB = frameB && lumaOf(frameB.canvas);
      if (!lumaA || !lumaB || Math.abs(frameA.timestamp - frameB.timestamp) > 0.001) return false;
      const { ssim, psnr } = compareLuma(lumaA, lumaB);
      if (ssim < SHRINK_MIN_SSIM || psnr < SHRINK_MIN_PSNR) return false;
    }
    return true;
  } finally {
    a.dispose();
    b.dispose();
  }
}

interface Luma {
  y: Float32Array;
  width: number;
  height: number;
}

function lumaOf(canvas: HTMLCanvasElement | OffscreenCanvas): Luma | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return null;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const y = new Float32Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) y[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return { y, width, height };
}

// SSIM averaged over 8x8 blocks, and PSNR, both on brightness.
function compareLuma(a: Luma, b: Luma): { ssim: number; psnr: number } {
  const { width: w, height: h } = a;
  if (w !== b.width || h !== b.height) return { ssim: 0, psnr: 0 };
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let squaredError = 0;
  for (let i = 0; i < a.y.length; i++) {
    const d = a.y[i] - b.y[i];
    squaredError += d * d;
  }
  let ssimSum = 0;
  let blocks = 0;
  for (let by = 0; by + 8 <= h; by += 8) {
    for (let bx = 0; bx + 8 <= w; bx += 8) {
      let meanA = 0;
      let meanB = 0;
      for (let y = by; y < by + 8; y++) {
        for (let x = bx; x < bx + 8; x++) {
          meanA += a.y[y * w + x];
          meanB += b.y[y * w + x];
        }
      }
      meanA /= 64;
      meanB /= 64;
      let varA = 0;
      let varB = 0;
      let cov = 0;
      for (let y = by; y < by + 8; y++) {
        for (let x = bx; x < bx + 8; x++) {
          const da = a.y[y * w + x] - meanA;
          const db = b.y[y * w + x] - meanB;
          varA += da * da;
          varB += db * db;
          cov += da * db;
        }
      }
      varA /= 63;
      varB /= 63;
      cov /= 63;
      ssimSum += ((2 * meanA * meanB + C1) * (2 * cov + C2)) / ((meanA * meanA + meanB * meanB + C1) * (varA + varB + C2));
      blocks++;
    }
  }
  const mse = squaredError / a.y.length;
  return { ssim: blocks ? ssimSum / blocks : 0, psnr: mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse) };
}

// ---------- documents ----------

// A4 in PDF points (1/72 inch).
const A4_LONG_PT = 841.89;
// A photo of a document is kept at up to A4 at 300 dpi, and not below
// A4 at 150 dpi, so small print stays readable.
const DOC_MAX_EDGE = 3508;
const DOC_MIN_EDGE = 1240;
// Each rendered PDF page: dpi and JPEG quality, from best down.
const PDF_RENDER_STEPS: [number, number][] = [
  [150, 0.85],
  [130, 0.78],
  [110, 0.7],
  [96, 0.62],
];
const PDF_PAGE_MAX_PIXELS = 8_000_000;

// A PDF of at most 10 MB, ready to upload. JPG and PNG become a one-page
// PDF (documents are stored and reviewed as PDFs). A PDF already within the
// limit is uploaded untouched; a bigger one is rebuilt from page images at
// print-readable resolution.
export async function prepareDocument(file: File): Promise<File> {
  const kind = await detectKind(file);
  if (kind === "pdf") return file.size <= DOCUMENT_MAX_BYTES ? withType(file, "pdf") : shrinkPdf(file);
  if (kind === "jpeg" || kind === "png") return imageToPdf(file);
  throw new UploadProblem(`${quoted(file.name)} isn't a document format we take. Please use ${DOCUMENT_FORMATS}.`);
}

async function imageToPdf(file: File): Promise<File> {
  let image: ImageBitmap;
  try {
    image = await decodeImage(file);
  } catch {
    throw unreadable(file.name);
  }
  try {
    const result = await encodeUnder(image, DOCUMENT_MAX_BYTES - 64 * 1024, "image/jpeg", {
      maxEdge: DOC_MAX_EDGE,
      minEdge: DOC_MIN_EDGE,
      qualities: [0.9, 0.82, 0.74, 0.66],
    });
    if (!result) {
      throw new UploadProblem(`${quoted(file.name)} is still over 10 MB after compressing. Please choose a smaller image.`);
    }
    const ptPerPx = A4_LONG_PT / Math.max(result.width, result.height);
    const pdf = buildImagePdf([
      {
        jpeg: new Uint8Array(await result.blob.arrayBuffer()),
        width: result.width,
        height: result.height,
        pageWidth: result.width * ptPerPx,
        pageHeight: result.height * ptPerPx,
      },
    ]);
    return new File([pdf], renamed(file.name, "pdf"), { type: "application/pdf", lastModified: file.lastModified });
  } finally {
    image.close();
  }
}

async function shrinkPdf(file: File): Promise<File> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { default: workerSrc } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy();
    if ((e as Error)?.name === "PasswordException") {
      throw new UploadProblem(
        `${quoted(file.name)} is password-protected. Please remove the password, or upload a photo of the document instead.`,
      );
    }
    throw unreadable(file.name);
  }

  const canvas = document.createElement("canvas");
  try {
    for (const [dpi, quality] of PDF_RENDER_STEPS) {
      const pages: PdfImagePage[] = [];
      let total = 0;
      for (let n = 1; n <= doc.numPages && total <= DOCUMENT_MAX_BYTES; n++) {
        const page = await doc.getPage(n);
        const size = page.getViewport({ scale: 1 });
        const scale = Math.min(dpi / 72, Math.sqrt(PDF_PAGE_MAX_PIXELS / (size.width * size.height)));
        const viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        page.cleanup();
        const blob = await canvasToBlob(canvas, "image/jpeg", quality);
        if (!blob) throw unreadable(file.name);
        total += blob.size;
        pages.push({
          jpeg: new Uint8Array(await blob.arrayBuffer()),
          width: canvas.width,
          height: canvas.height,
          pageWidth: size.width,
          pageHeight: size.height,
        });
      }
      if (total > DOCUMENT_MAX_BYTES) continue;
      const pdf = buildImagePdf(pages);
      if (pdf.size <= DOCUMENT_MAX_BYTES) {
        return new File([pdf], file.name, { type: "application/pdf", lastModified: file.lastModified });
      }
    }
  } catch (e) {
    if (e instanceof UploadProblem) throw e;
    console.error("PDF compression failed", e);
    throw unreadable(file.name);
  } finally {
    canvas.width = canvas.height = 0;
    await task.destroy();
  }
  throw new UploadProblem(
    `${quoted(file.name)} is still over 10 MB after compressing. Please upload a copy with fewer pages or a lower scan resolution.`,
  );
}

interface PdfImagePage {
  jpeg: Uint8Array;
  // Image pixels, and the page size in points it fills.
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

// A minimal PDF 1.4: one page per JPEG, each image filling its page.
// Exported for tests.
export function buildImagePdf(pages: PdfImagePage[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === "string" ? enc.encode(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\n`);
    if (stream) {
      push("stream\n");
      push(stream);
      push("\nendstream\n");
    }
    push("endobj\n");
  };
  const num = (n: number) => (Math.round(n * 100) / 100).toString();

  // Objects: 1 catalog, 2 page tree, then page / content / image per page.
  const pageIds = pages.map((_, i) => 3 + i * 3);
  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // %PDF-1.4 + binary marker
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  pages.forEach((p, i) => {
    const [pageId, contentId, imageId] = [pageIds[i], pageIds[i] + 1, pageIds[i] + 2];
    const w = num(p.pageWidth);
    const h = num(p.pageHeight);
    const content = enc.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    object(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    object(contentId, `<< /Length ${content.length} >>`, content);
    object(
      imageId,
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>`,
      p.jpeg,
    );
  });

  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}
