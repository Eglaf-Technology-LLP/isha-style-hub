// Deletes a shop photo or video from R2 straight away when it is removed
// (the cross, or a new one put in its place) from the form it was uploaded
// in, before that form was saved - nothing can link to it yet (see
// _shared/r2.ts, "Clearing out files nothing links to").
//
// Deleted only when all of these hold; otherwise it answers deleted: 0 and
// the nightly media-cleanup deals with the file:
//   - the caller may upload to that folder (admins anywhere, boutique
//     members only under vendor-uploads/, as in media-upload-url);
//   - no row anywhere mentions the file (public.media_file_id_in_use);
//   - it was uploaded within CLEANUP_RULES.keepNewHours. Older files go
//     through trash/ instead, so they can still be put back.

import { corsHeaders, errorMessage, getCallerUserId, isAdmin, jsonResponse, serviceClient } from "../_shared/auth.ts";
import { CLEANUP_RULES, mediaFileId, mediaKeyOfUrl } from "../_shared/r2.ts";
import { deleteFile, listFiles, r2Config } from "../_shared/r2Client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const config = r2Config();
    if (!config) return jsonResponse({ error: "Photo and video storage isn't set up yet" }, 503);

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Please sign in again" }, 401);

    const body = await req.json().catch(() => null);
    const key = mediaKeyOfUrl(String(body?.url ?? ""), config.publicBase);
    const file = key ? mediaFileId(key) : null;
    if (!file) return jsonResponse({ error: "Not a shop photo or video" }, 400);

    const supabase = serviceClient();
    if (!(await isAdmin(supabase, userId))) {
      if (file.folder !== "vendor-uploads") return jsonResponse({ error: "Not allowed to delete this file" }, 403);
      const { data, error } = await supabase.from("vendor_members").select("user_id").eq("user_id", userId).limit(1);
      if (error) throw error;
      if (!data?.length) return jsonResponse({ error: "Only boutique members can delete product media" }, 403);
    }

    const { data: inUse, error } = await supabase.rpc("media_file_id_in_use", { p_id: file.id });
    if (error) throw error;
    if (inUse !== false) return jsonResponse({ deleted: 0, reason: "in use" });

    // The photo and its smaller copies.
    const files = await listFiles(config, `${file.folder}/${file.id}.`);
    const newSince = Date.now() - CLEANUP_RULES.keepNewHours * 3600_000;
    if (files.some((f) => f.lastModified.getTime() < newSince)) return jsonResponse({ deleted: 0, reason: "not new" });

    await Promise.all(files.map((f) => deleteFile(config, f.key)));
    return jsonResponse({ deleted: files.length });
  } catch (e) {
    console.error("media-delete failed", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
