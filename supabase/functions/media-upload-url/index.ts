// Signed upload links for shop photos and videos on Cloudflare R2
// (see _shared/r2.ts for why R2). The browser asks for one link per file -
// the photo or video itself plus, for a photo, its smaller copies - and PUTs
// each file straight to R2. The links name the file and its type, last 30
// minutes, and can't be reused for any other file.
//
// Who may upload where is the same as the Supabase bucket it replaces
// (category-images): admins anywhere, boutique members only under
// vendor-uploads/.
//
// Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// and MEDIA_BASE_URL (the bucket's public address, e.g.
// https://media.example.com). Until they are set this answers 503 and the
// site keeps uploading to Supabase Storage (VITE_MEDIA_BASE_URL unset).

import { corsHeaders, errorMessage, getCallerUserId, isAdmin, jsonResponse, serviceClient } from "../_shared/auth.ts";
import {
  MEDIA_CACHE_CONTROL,
  MEDIA_EXT_OF_TYPE,
  MEDIA_FOLDERS,
  mediaKeys,
  presignUrl,
  type MediaFolder,
  type SizesFormat,
} from "../_shared/r2.ts";
import { r2Config } from "../_shared/r2Client.ts";

const UPLOAD_LINK_SECONDS = 30 * 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const config = r2Config();
    if (!config) return jsonResponse({ error: "Photo and video storage isn't set up yet" }, 503);

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Please sign in again" }, 401);

    const body = await req.json().catch(() => null);
    const folder = body?.folder as MediaFolder;
    const contentType = String(body?.contentType ?? "");
    const sizes = (body?.sizes ?? null) as SizesFormat | null;
    if (!MEDIA_FOLDERS.includes(folder)) return jsonResponse({ error: "Unknown upload folder" }, 400);
    const ext = MEDIA_EXT_OF_TYPE[contentType];
    if (!ext) return jsonResponse({ error: "This file type can't be uploaded" }, 400);
    if (sizes !== null && (!contentType.startsWith("image/") || (sizes !== "webp" && sizes !== "jpeg"))) {
      return jsonResponse({ error: "Smaller copies are only made for photos" }, 400);
    }

    const supabase = serviceClient();
    if (!(await isAdmin(supabase, userId))) {
      if (folder !== "vendor-uploads") return jsonResponse({ error: "Not allowed to upload here" }, 403);
      const { data, error } = await supabase.from("vendor_members").select("user_id").eq("user_id", userId).limit(1);
      if (error) throw error;
      if (!data?.length) return jsonResponse({ error: "Only boutique members can upload product media" }, 403);
    }

    const keys = mediaKeys(folder, crypto.randomUUID(), ext, sizes);
    const files = [{ key: keys.main, contentType }, ...keys.sizes.map((s) => ({ key: s.key, contentType: s.contentType }))];
    const uploads = await Promise.all(
      files.map(async (f) => {
        const headers = { "Content-Type": f.contentType, "Cache-Control": MEDIA_CACHE_CONTROL };
        const uploadUrl = await presignUrl({
          method: "PUT",
          endpoint: config.endpoint,
          path: `/${config.bucket}/${f.key}`,
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
          expiresSeconds: UPLOAD_LINK_SECONDS,
          headers,
        });
        return { uploadUrl, headers };
      }),
    );

    // uploads[0] is the file itself, then its smaller copies in the order
    // the browser listed them (MEDIA_WIDTHS).
    return jsonResponse({ url: `${config.publicBase}/${keys.main}`, uploads });
  } catch (e) {
    console.error("media-upload-url failed", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
