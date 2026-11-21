// Cloudflare R2 holds the shop's photos and videos (client, 22 Nov 2026):
// visitors' downloads from R2 are free, where Supabase Storage bills every
// byte as egress and the Free plan stops the whole project at 5 GB.
//
// R2 speaks the S3 API. The browser never sees the R2 keys: the
// media-upload-url function signs a short-lived upload link (AWS Signature
// V4, query-string form) and the browser PUTs the file straight to R2.
// Only Web Crypto is used, so the same file runs in Deno (the edge
// function) and in Node (scripts/media-to-r2).

const encoder = new TextEncoder();

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(data)));
}

// RFC 3986: everything but A-Z a-z 0-9 - _ . ~ is percent-encoded.
const encodeRfc3986 = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface PresignOptions {
  method: "GET" | "PUT";
  // https://<account id>.r2.cloudflarestorage.com
  endpoint: string;
  // "/<bucket>/<key>", not yet encoded.
  path: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSeconds: number;
  // Headers the request must send with exactly these values (besides host).
  headers?: Record<string, string>;
  region?: string;
  service?: string;
  now?: Date;
}

export async function presignUrl(o: PresignOptions): Promise<string> {
  const region = o.region ?? "auto";
  const service = o.service ?? "s3";
  const endpoint = new URL(o.endpoint);
  const amzDate = (o.now ?? new Date()).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${region}/${service}/aws4_request`;

  const headers: Record<string, string> = { host: endpoint.host };
  for (const [name, value] of Object.entries(o.headers ?? {})) headers[name.toLowerCase()] = value;
  const headerNames = Object.keys(headers).sort();
  const signedHeaders = headerNames.join(";");
  const canonicalHeaders = headerNames.map((n) => `${n}:${headers[n].trim().replace(/\s+/g, " ")}\n`).join("");

  const canonicalPath = o.path.split("/").map(encodeRfc3986).join("/");
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${o.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(o.expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(query[k])}`)
    .join("&");

  const canonicalRequest = [o.method, canonicalPath, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join(
    "\n",
  );
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");

  const kDate = await hmac(encoder.encode(`AWS4${o.secretAccessKey}`), day);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));

  return `${endpoint.origin}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// ---- Shop media naming ------------------------------------------------------
// Kept in step with src/lib/mediaStorage.ts, which turns a photo's url into
// its smaller copies' urls from the name alone.
//
//   products/<uuid>.mp4             a video (no copies)
//   products/<uuid>.png             a photo without smaller copies
//   products/<uuid>.sw.jpg          a photo with WEBP copies:
//   products/<uuid>.w720.webp         720 px wide (cards, grids)
//   products/<uuid>.w1600.webp        1600 px wide (product page)
//   products/<uuid>.sj.jpg          the same with JPEG copies (.w720.jpg ...),
//                                   from browsers that can't write WEBP

export const MEDIA_WIDTHS = [720, 1600] as const;
export type SizesFormat = "webp" | "jpeg";
const SIZES_MARK: Record<SizesFormat, string> = { webp: "sw", jpeg: "sj" };
const SIZES_EXT: Record<SizesFormat, string> = { webp: "webp", jpeg: "jpg" };
export const SIZES_TYPE: Record<SizesFormat, string> = { webp: "image/webp", jpeg: "image/jpeg" };

// Admin-only folders first; vendors may write only to vendor-uploads.
export const MEDIA_FOLDERS = ["products", "hero", "categories", "vendor-uploads"] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

export const MEDIA_EXT_OF_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

// Every file has a unique name, so it can be cached for good.
export const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

export interface MediaKeys {
  main: string;
  sizes: { key: string; width: number; contentType: string }[];
}

export function mediaKeys(folder: MediaFolder, id: string, ext: string, sizes: SizesFormat | null): MediaKeys {
  if (!sizes) return { main: `${folder}/${id}.${ext}`, sizes: [] };
  return {
    main: `${folder}/${id}.${SIZES_MARK[sizes]}.${ext}`,
    sizes: MEDIA_WIDTHS.map((width) => ({
      key: `${folder}/${id}.w${width}.${SIZES_EXT[sizes]}`,
      width,
      contentType: SIZES_TYPE[sizes],
    })),
  };
}
