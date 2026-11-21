/* AllBoutiqs media cache - a service worker for shop photos and videos.
 *
 * Shop media comes from Supabase Storage, and every byte it sends is billed
 * as egress. Left to itself the browser downloads a video again on every
 * visit, for every <video> on the page that shows it, and often on every
 * loop (a big video's byte ranges don't stay in the HTTP cache): a handful
 * of testers used 7.7 GB of egress in one day (storage logs, 19 Nov 2026).
 *
 * This worker keeps each shop photo and video on the device after its first
 * download: one download per device (per browser), whoever is logged in -
 * the files are the same for everyone. All the <video>s of a file share that
 * one download, and play while it is still arriving.
 *
 * Every file it keeps has a unique name (a new upload gets a new url), so a
 * kept copy never goes stale. The oldest files go once the caps below are
 * reached, and the browser may clear them when the device runs low on space.
 *
 * Only public shop media is kept: the category-images bucket's products/,
 * vendor-uploads/ and hero/ folders and the category images at its root.
 * Customer folders in that bucket (avatars, which are overwritten in place,
 * review and return photos) and every other bucket go to the network as
 * before - several people can share a device. Shop media on Cloudflare R2
 * (its own origin, which holds nothing else) is kept the same way.
 *
 * Registered by src/lib/mediaCache.ts as
 * /media-sw.js?storage=<Supabase origin>[&media=<R2 media origin>].
 */

const VERSION = 1;
const IMAGE_CACHE = `ab-media-images-v${VERSION}`;
const VIDEO_CACHE = `ab-media-videos-v${VERSION}`;

// The most a device keeps; the oldest files are dropped first.
const IMAGE_CACHE_BYTES = 200 * 1024 * 1024;
const VIDEO_CACHE_BYTES = 600 * 1024 * 1024;
// Bigger files are not kept (uploads are capped at 50 MB).
const MAX_FILE_BYTES = 100 * 1024 * 1024;
// A player reading a little from far ahead of the download (an MP4 whose
// index is at the end of the file) gets those bytes from the network
// instead of waiting for the whole file.
const SMALL_RANGE_BYTES = 1024 * 1024;
// Bytes handed to a <video> at a time while its file is still arriving.
const STREAM_CHUNK_BYTES = 256 * 1024;

const SIZE_HEADER = "x-ab-media-bytes";
const CORS = { mode: "cors", credentials: "omit" };

function originParam(name) {
  try {
    return new URL(new URL(self.location.href).searchParams.get(name)).origin;
  } catch {
    return null;
  }
}

const STORAGE_ORIGIN = originParam("storage");
const MEDIA_ORIGIN = originParam("media");

const SHOP_MEDIA_PATH =
  /^\/storage\/v1\/(?:object|render\/image)\/public\/category-images\/(?:(?:products|vendor-uploads|hero)\/)?[^/]+$/;

function isShopMedia(url) {
  if (MEDIA_ORIGIN && url.origin === MEDIA_ORIGIN) return url.pathname.length > 1 && !url.search;
  return url.origin === STORAGE_ORIGIN && SHOP_MEDIA_PATH.test(url.pathname) && !/%2f/i.test(url.pathname);
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const current = [IMAGE_CACHE, VIDEO_CACHE];
      for (const name of await caches.keys()) {
        if (name.startsWith("ab-media-") && !current.includes(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || (!STORAGE_ORIGIN && !MEDIA_ORIGIN)) return;
  const kind = request.destination;
  if (kind !== "image" && kind !== "video") return;
  if (!isShopMedia(new URL(request.url))) return;

  const handler = kind === "video" ? videoResponse : imageResponse;
  // Anything unexpected: the network, exactly as without this worker.
  event.respondWith(handler(event).catch(() => fetch(request)));
});

// ---- Keeping files -------------------------------------------------------

// Trims run one after another per cache, so two never drop the same files.
const trimQueue = new Map();

// Whether the file could be kept.
async function keep(cacheName, key, blob, type, capBytes) {
  const headers = { "content-type": type, "content-length": String(blob.size), [SIZE_HEADER]: String(blob.size) };
  const cache = await caches.open(cacheName);
  try {
    await cache.put(key, new Response(blob, { headers }));
  } catch {
    // Device storage full: make room by dropping the older half, without this file.
    await queueTrim(cacheName, capBytes, 0.5);
    return false;
  }
  await queueTrim(cacheName, capBytes, 1);
  return true;
}

function queueTrim(cacheName, capBytes, keepShare) {
  const next = (trimQueue.get(cacheName) || Promise.resolve())
    .then(() => trim(cacheName, capBytes, keepShare))
    .catch(() => {});
  trimQueue.set(cacheName, next);
  return next;
}

// Drops the oldest files (cache keys come back in the order they were
// added) until the cache is under its cap, or under keepShare of what it
// holds now.
async function trim(cacheName, capBytes, keepShare) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const sizes = await Promise.all(
    keys.map(async (k) => Number((await cache.match(k))?.headers.get(SIZE_HEADER)) || 0),
  );
  let total = sizes.reduce((a, b) => a + b, 0);
  const limit = Math.min(capBytes, total * keepShare);
  for (let i = 0; i < keys.length && total > limit; i++) {
    await cache.delete(keys[i]);
    total -= sizes[i];
  }
}

const usable = (res) =>
  res.status === 200 && res.type !== "opaque" && !(Number(res.headers.get("content-length")) > MAX_FILE_BYTES);

// ---- Photos --------------------------------------------------------------

// Photos being downloaded right now, so the same photo shown twice on a page
// is downloaded once.
const photoDownloads = new Map();

async function imageResponse(event) {
  const request = event.request;
  const key = request.url;
  const cache = await caches.open(IMAGE_CACHE);
  const kept = await cache.match(key);
  if (kept) return kept;

  const pending = photoDownloads.get(key);
  if (pending) {
    await pending;
    return (await cache.match(key)) || fetch(request);
  }

  let finished;
  photoDownloads.set(key, new Promise((resolve) => (finished = resolve)));
  const finish = () => {
    photoDownloads.delete(key);
    finished();
  };

  let res;
  try {
    res = await fetch(key, CORS);
  } catch (e) {
    finish();
    throw e;
  }
  if (!usable(res)) {
    finish();
    return res;
  }
  const type = res.headers.get("content-type") || "application/octet-stream";
  event.waitUntil(
    res
      .clone()
      .blob()
      .then((blob) => keep(IMAGE_CACHE, key, blob, type, IMAGE_CACHE_BYTES))
      .catch(() => {})
      .finally(finish),
  );
  return res;
}

// ---- Videos --------------------------------------------------------------

// Videos being downloaded right now. Every request for one is answered from
// its single download, as the bytes arrive.
const videoDownloads = new Map();
// Files that can't be kept (too big, or the download couldn't start): the
// network, without trying again until the worker restarts.
const notKept = new Set();
// The last few kept videos, so the many range reads during playback don't
// each read the file out of the cache again.
const recentVideos = new Map();

async function videoResponse(event) {
  const request = event.request;
  const key = request.url;
  const range = request.headers.get("range");

  const recent = recentVideos.get(key);
  if (recent) return fromBlob(recent.blob, recent.type, range);
  const kept = await (await caches.open(VIDEO_CACHE)).match(key);
  if (kept) {
    const blob = await kept.blob();
    const type = kept.headers.get("content-type") || blob.type || "video/mp4";
    recentVideos.set(key, { blob, type });
    if (recentVideos.size > 4) recentVideos.delete(recentVideos.keys().next().value);
    return fromBlob(blob, type, range);
  }
  if (notKept.has(key)) return fetch(request);

  let download = videoDownloads.get(key);
  if (!download) {
    download = startVideoDownload(key);
    videoDownloads.set(key, download);
  }
  event.waitUntil(download.done);
  if (!(await download.started)) return fetch(request);

  const wanted = parseRange(range, download.size);
  if (!wanted) return unsatisfiable(download.size);
  const { start, end } = wanted;
  if (!download.complete && start > download.received + SMALL_RANGE_BYTES && end - start < SMALL_RANGE_BYTES) {
    const ahead = await rangeFromNetwork(key, download.type, start, end, download.size).catch(() => null);
    if (ahead) return ahead;
  }
  return new Response(streamFrom(download, start, end), {
    status: wanted.partial ? 206 : 200,
    headers: mediaHeaders(download.type, start, end, download.size, wanted.partial),
  });
}

function startVideoDownload(key) {
  const download = { size: 0, type: "", buffer: null, received: 0, complete: false, failed: false, waiting: new Set() };
  const wake = () => {
    for (const resolve of download.waiting) resolve();
    download.waiting.clear();
  };
  download.nextChunk = () => new Promise((resolve) => download.waiting.add(resolve));

  let reader = null;
  download.started = (async () => {
    const res = await fetch(key, CORS);
    const size = Number(res.headers.get("content-length"));
    if (!usable(res) || !res.body || !(size > 0)) {
      res.body?.cancel().catch(() => {});
      return false;
    }
    download.size = size;
    download.type = res.headers.get("content-type") || "video/mp4";
    download.buffer = new Uint8Array(size);
    reader = res.body.getReader();
    return true;
  })().catch(() => false);

  download.done = download.started
    .then(async (started) => {
      if (!started) {
        notKept.add(key);
        return;
      }
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (download.received + value.byteLength > download.size) throw new Error("longer than its content-length");
          download.buffer.set(value, download.received);
          download.received += value.byteLength;
          wake();
        }
        if (download.received !== download.size) throw new Error("download cut short");
        download.complete = true;
        wake();
      } catch {
        download.failed = true;
        wake();
        reader.cancel().catch(() => {});
        return;
      }
      const blob = new Blob([download.buffer], { type: download.type });
      // Not kept (no room): later requests use the network rather than
      // downloading it again here each time.
      if (!(await keep(VIDEO_CACHE, key, blob, download.type, VIDEO_CACHE_BYTES))) notKept.add(key);
    })
    .catch(() => {})
    .finally(() => videoDownloads.delete(key));
  return download;
}

// A few bytes from far ahead of the download, straight from storage. Fetched
// with CORS and answered like every other part of the file: a video player
// refuses a file whose parts come back as a mix of readable and opaque
// (plain no-cors) responses.
async function rangeFromNetwork(key, type, start, end, size) {
  const res = await fetch(key, { ...CORS, headers: { range: `bytes=${start}-${end}` } });
  if (res.status !== 206 || !res.body) {
    res.body?.cancel().catch(() => {});
    return null;
  }
  return new Response(res.body, { status: 206, headers: mediaHeaders(type, start, end, size, true) });
}

// Bytes start..end (inclusive) of a video that is still downloading, handed
// over as they arrive.
function streamFrom(download, start, end) {
  let position = start;
  return new ReadableStream(
    {
      async pull(controller) {
        while (download.received <= position && !download.failed) await download.nextChunk();
        if (download.received <= position) {
          controller.error(new Error("video download failed"));
          return;
        }
        const upTo = Math.min(download.received, end + 1, position + STREAM_CHUNK_BYTES);
        controller.enqueue(download.buffer.slice(position, upTo));
        position = upTo;
        if (position > end) controller.close();
      },
    },
    { highWaterMark: 0 },
  );
}

function fromBlob(blob, type, range) {
  const wanted = parseRange(range, blob.size);
  if (!wanted) return unsatisfiable(blob.size);
  const { start, end, partial } = wanted;
  const body = partial ? blob.slice(start, end + 1) : blob;
  return new Response(body, { status: partial ? 206 : 200, headers: mediaHeaders(type, start, end, blob.size, partial) });
}

// The byte range a request asks for: { start, end (inclusive), partial },
// the whole file when it doesn't ask for one, or null when the range lies
// outside the file.
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return { start: 0, end: size - 1, partial: false };
  let start;
  let end;
  if (m[1] === "") {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return null;
  return { start, end, partial: true };
}

function mediaHeaders(type, start, end, size, partial) {
  const headers = { "content-type": type, "content-length": String(end - start + 1), "accept-ranges": "bytes" };
  if (partial) headers["content-range"] = `bytes ${start}-${end}/${size}`;
  return headers;
}

function unsatisfiable(size) {
  return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
}
