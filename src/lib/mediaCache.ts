import { MEDIA_BASE_URL } from "@/lib/mediaStorage";

// Shop photos and videos are kept on the device after their first download
// (public/media-sw.js), so Supabase Storage egress is paid once per device
// instead of on every visit, page and <video> (client, 19 Nov 2026). Media
// on Cloudflare R2 is kept too: free to download, but faster from the device.
//
// Kill switch: build with VITE_MEDIA_CACHE="off" and every browser that has
// the worker drops it, and the files it kept, on its next visit.
const WORKER_PATH = "/media-sw.js";
const CACHE_PREFIX = "ab-media-";

export function registerMediaCache(): void {
  if (!("serviceWorker" in navigator)) return;
  const run = () => (import.meta.env.VITE_MEDIA_CACHE === "off" ? removeMediaCache() : addMediaCache());
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
}

function addMediaCache() {
  let storage: string;
  try {
    storage = new URL(import.meta.env.VITE_SUPABASE_URL).origin;
  } catch {
    return;
  }
  // Cloudflare R2, once shop media is moved there (lib/mediaStorage).
  let media = "";
  try {
    if (MEDIA_BASE_URL) media = new URL(MEDIA_BASE_URL).origin;
  } catch {
    // a bad VITE_MEDIA_BASE_URL - only Supabase media is kept
  }
  const query = `storage=${encodeURIComponent(storage)}${media ? `&media=${encodeURIComponent(media)}` : ""}`;
  navigator.serviceWorker.register(`${WORKER_PATH}?${query}`).catch((e) => console.warn("Media cache unavailable", e));
}

async function removeMediaCache() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((r) => (r.active ?? r.waiting ?? r.installing)?.scriptURL.includes(WORKER_PATH))
        .map((r) => r.unregister()),
    );
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX)).map((n) => caches.delete(n)));
    }
  } catch (e) {
    console.warn("Couldn't remove the media cache", e);
  }
}
