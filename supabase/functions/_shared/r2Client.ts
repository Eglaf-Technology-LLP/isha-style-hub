// The few R2 (S3 API) calls the media functions make, signed with the R2
// keys in the Supabase secrets. See _shared/r2.ts for why R2.

import { presignUrl, type StoredFile } from "./r2.ts";

export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  // The bucket's public address, e.g. https://media.example.com
  publicBase: string;
}

// Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// and MEDIA_BASE_URL. null until they are all set.
export function r2Config(): R2Config | null {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET");
  const publicBase = Deno.env.get("MEDIA_BASE_URL")?.replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) return null;
  return { endpoint: `https://${accountId}.r2.cloudflarestorage.com`, accessKeyId, secretAccessKey, bucket, publicBase };
}

const SIGNED_FOR_SECONDS = 5 * 60;

function signed(
  config: R2Config,
  method: "GET" | "PUT" | "DELETE",
  key: string | null,
  extra: { query?: Record<string, string>; headers?: Record<string, string> } = {},
): Promise<string> {
  return presignUrl({
    method,
    endpoint: config.endpoint,
    path: key === null ? `/${config.bucket}` : `/${config.bucket}/${key}`,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expiresSeconds: SIGNED_FOR_SECONDS,
    ...extra,
  });
}

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const xmlField = (xml: string, tag: string) => {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? unescapeXml(m[1]) : null;
};

// Every file in the bucket (or under prefix), 1000 per request.
export async function listFiles(config: R2Config, prefix = ""): Promise<StoredFile[]> {
  const files: StoredFile[] = [];
  let token: string | null = null;
  do {
    const query: Record<string, string> = { "list-type": "2", "max-keys": "1000" };
    if (prefix) query.prefix = prefix;
    if (token) query["continuation-token"] = token;
    const res = await fetch(await signed(config, "GET", null, { query }));
    const xml = await res.text();
    if (!res.ok) throw new Error(`Listing the media bucket failed (${res.status}): ${xml.slice(0, 300)}`);
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = xmlField(m[1], "Key");
      const lastModified = new Date(xmlField(m[1], "LastModified") ?? "");
      if (!key || Number.isNaN(lastModified.getTime())) throw new Error(`Unreadable file in the bucket listing: ${m[1].slice(0, 200)}`);
      files.push({ key, lastModified, size: Number(xmlField(m[1], "Size") ?? 0) });
    }
    token = xmlField(xml, "IsTruncated") === "true" ? xmlField(xml, "NextContinuationToken") : null;
  } while (token);
  return files;
}

// Server-side copy: the file's type and Cache-Control come along.
export async function copyFile(config: R2Config, from: string, to: string): Promise<void> {
  const source = `/${config.bucket}/${from.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(await signed(config, "PUT", to, { headers: { "x-amz-copy-source": source } }), {
    method: "PUT",
    headers: { "x-amz-copy-source": source },
  });
  const text = await res.text();
  // A copy can fail after a 200, with the error in the body.
  if (!res.ok || text.includes("<Error>")) throw new Error(`Copying ${from} failed (${res.status}): ${text.slice(0, 300)}`);
}

export async function deleteFile(config: R2Config, key: string): Promise<void> {
  const res = await fetch(await signed(config, "DELETE", key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Deleting ${key} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
}

export async function moveFile(config: R2Config, from: string, to: string): Promise<void> {
  await copyFile(config, from, to);
  await deleteFile(config, from);
}

// Runs fn over items, a few at a time; every item is tried, and the
// failures are returned rather than thrown.
export async function eachInPool<T>(items: T[], workers: number, fn: (item: T) => Promise<void>): Promise<string[]> {
  const failures: string[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        try {
          await fn(item);
        } catch (e) {
          failures.push(e instanceof Error ? e.message : String(e));
        }
      }
    }),
  );
  return failures;
}
