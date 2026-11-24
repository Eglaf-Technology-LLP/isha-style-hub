// Every night (cron, media_cleanup_schedule migration): clears shop photos
// and videos that no row mentions any more out of R2 - removed with the
// cross and saved, replaced, left in a form that was closed, or belonging
// to a deleted product, banner or boutique. See _shared/r2.ts, "Clearing
// out files nothing links to".
//
//   1. Files no row mentions, uploaded over CLEANUP_RULES.keepNewHours ago,
//      move to trash/<their key>.
//   2. Files in trash/ that a row mentions again move back.
//   3. Files in trash/ for CLEANUP_RULES.trashDays are deleted for good.
//
// A run that would clear out an unusual share of the files stops and tells
// the admins instead (cleanupLooksWrong).
//
// Called by cron with the service role key, or by an admin:
//   {"dryRun": true}     only reports what it would do (with the file names)
//   {"allowLarge": true} goes ahead even past the stop above

import { corsHeaders, errorMessage, getCallerUserId, isAdmin, jsonResponse, serviceClient } from "../_shared/auth.ts";
import { notifyAllAdmins } from "../_shared/notify.ts";
import { cleanupLooksWrong, MEDIA_TRASH, planCleanup, type StoredFile } from "../_shared/r2.ts";
import { deleteFile, eachInPool, listFiles, moveFile, r2Config, type R2Config } from "../_shared/r2Client.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const WORKERS = 8;
const LISTED_FILES = 500;

function isServiceRoleCall(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try {
    return JSON.parse(atob((token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
  } catch {
    return false;
  }
}

const mb = (files: StoredFile[]) => Math.round(files.reduce((n, f) => n + f.size, 0) / 1e4) / 100;

async function cleanUp(config: R2Config, opts: { dryRun: boolean; allowLarge: boolean }) {
  const supabase = serviceClient();
  const [files, ids] = await Promise.all([
    listFiles(config),
    supabase.rpc("media_file_ids_in_use").then(({ data, error }) => {
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("media_file_ids_in_use gave no list");
      return new Set(data as string[]);
    }),
  ]);
  const plan = planCleanup(files, ids, new Date());
  const summary = {
    filesInBucket: files.length,
    shopFiles: plan.shopFiles,
    inUse: plan.inUse,
    keptAsNew: plan.tooNew,
    otherFiles: plan.other,
    toTrash: plan.toTrash.length,
    toTrashMB: mb(plan.toTrash),
    toRestore: plan.toRestore.length,
    toPurge: plan.toPurge.length,
    toPurgeMB: mb(plan.toPurge),
  };

  if (opts.dryRun) {
    const names = (list: StoredFile[]) => list.slice(0, LISTED_FILES).map((f) => `${f.key} (${f.lastModified.toISOString().slice(0, 10)})`);
    return {
      dryRun: true,
      ...summary,
      wouldStop: cleanupLooksWrong(plan, ids),
      trash: names(plan.toTrash),
      restore: names(plan.toRestore),
      purge: names(plan.toPurge),
    };
  }

  const wrong = opts.allowLarge ? null : cleanupLooksWrong(plan, ids);
  if (wrong) {
    console.error("media-cleanup stopped:", wrong, summary);
    await notifyAllAdmins(supabase, {
      type: "media_cleanup_stopped",
      title: "Photo clean-up stopped",
      body: `The nightly clean-up of unused photos and videos stopped without changing anything, because ${wrong}. Nothing is lost; please ask for it to be checked.`,
      link: "/admin",
    });
    return { stopped: wrong, ...summary };
  }

  const failures = [
    ...(await eachInPool(plan.toTrash, WORKERS, (f) => moveFile(config, f.key, MEDIA_TRASH + f.key))),
    ...(await eachInPool(plan.toRestore, WORKERS, (f) => moveFile(config, f.key, f.key.slice(MEDIA_TRASH.length)))),
    ...(await eachInPool(plan.toPurge, WORKERS, (f) => deleteFile(config, f.key))),
  ];
  const result = { ...summary, failed: failures.length, firstFailures: failures.slice(0, 5) };
  console.log("media-cleanup done", JSON.stringify(result));
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const config = r2Config();
    if (!config) return jsonResponse({ error: "Photo and video storage isn't set up yet" }, 503);

    const byCron = isServiceRoleCall(req);
    if (!byCron) {
      const userId = await getCallerUserId(req);
      if (!userId) return jsonResponse({ error: "Please sign in again" }, 401);
      if (!(await isAdmin(serviceClient(), userId))) return jsonResponse({ error: "Admins only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const opts = { dryRun: body?.dryRun === true, allowLarge: body?.allowLarge === true };

    // Cron's request gives up after 30 s (invoke_edge_function); the run
    // carries on after the answer.
    if (byCron && !opts.dryRun && typeof EdgeRuntime !== "undefined") {
      EdgeRuntime.waitUntil(cleanUp(config, opts).catch((e) => console.error("media-cleanup failed", e)));
      return jsonResponse({ started: true }, 202);
    }
    return jsonResponse(await cleanUp(config, opts));
  } catch (e) {
    console.error("media-cleanup failed", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
