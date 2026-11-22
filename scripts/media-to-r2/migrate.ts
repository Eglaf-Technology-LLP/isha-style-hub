// Moves the shop's photos and videos that are already on Supabase Storage to
// Cloudflare R2, then points the database at the R2 copies.
// Step 6 of supabase/live-setup/R2_MEDIA.md - read that first.
//
//   node scripts/media-to-r2/migrate.ts            dry run: lists what would move, changes nothing
//   node scripts/media-to-r2/migrate.ts --apply    copies the files, then updates the rows
//
// Needs Node 22.6+ (runs TypeScript directly) and, for --apply, sharp:
//   npm install --no-save sharp
//
// What moves: files in the category-images bucket's products/,
// vendor-uploads/ and hero/ folders and the category images at its root -
// the same files public/media-sw.js treats as shop media. Customer files
// (<user id>/avatar, reviews, returns) stay on Supabase.
//
// Where the urls are found: every text, varchar, json, jsonb and text[]
// column of every table in the public schema - not a fixed list, so a column
// added later can't be missed.
//
// Safe to run again: files already copied (moved-files.json in the backup
// folder) are not copied twice, and rows already on R2 are left alone.
// Nothing is deleted from Supabase Storage. Undo = put back the values in
// rows-before-<time>.json.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  MEDIA_CACHE_CONTROL,
  MEDIA_EXT_OF_TYPE,
  mediaKeys,
  presignUrl,
} from "../../supabase/functions/_shared/r2.ts";
import type { MediaFolder } from "../../supabase/functions/_shared/r2.ts";

const APPLY = process.argv.includes("--apply");

function die(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function env(name: string, required: boolean): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value && required) die(`Set ${name} first (see supabase/live-setup/R2_MEDIA.md, step 6).`);
  return value;
}

const REF = env("SUPABASE_REF", false) || "whycxtnjhdbewgyugfax";
const TOKEN = env("SUPABASE_ACCESS_TOKEN", true);
const R2 = {
  accountId: env("R2_ACCOUNT_ID", APPLY),
  accessKeyId: env("R2_ACCESS_KEY_ID", APPLY),
  secretAccessKey: env("R2_SECRET_ACCESS_KEY", APPLY),
  bucket: env("R2_BUCKET", APPLY),
  publicBase: env("MEDIA_BASE_URL", APPLY).replace(/\/+$/, ""),
};

const STORAGE_PREFIX = `https://${REF}.supabase.co/storage/v1/object/public/category-images/`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const URL_RE = new RegExp(`${escapeRe(STORAGE_PREFIX)}[^\\s"'<>\\\\]+`, "g");

// File names may hold brackets ("photo (1).jpg" - live has several), so
// they are part of the url; only a trailing ")" with no "(" to match closes
// something written around the url instead.
function trimUrl(raw: string): string {
  let url = raw;
  const count = (s: string, c: string) => s.split(c).length - 1;
  while (url.endsWith(")") && count(url, ")") > count(url, "(")) url = url.slice(0, -1);
  return url;
}
// Same files as SHOP_MEDIA_PATH in public/media-sw.js.
const SHOP_PATH = /^(?:(products|vendor-uploads|hero)\/)?([^/]+)$/;

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const BACKUP_DIR =
  env("BACKUP_DIR", false) || join(homedir(), "AllBoutiqs-backups", `${stamp.slice(0, 10)}-media-to-r2`);
const MOVED_FILE = join(BACKUP_DIR, "moved-files.json");

// ---- Database (Supabase Management API: works while the project's own API is restricted) ----

async function sql<T>(query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text.slice(0, 2000)}`);
  return JSON.parse(text) as T[];
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

type Kind = "text" | "json" | "jsonb" | "text[]" | "varchar[]";
interface Column {
  table: string;
  column: string;
  kind: Kind;
}
export interface Hit extends Column {
  pk: string;
  pkColumn: string;
  value: unknown;
}

async function findColumns(): Promise<{ columns: Column[]; pkOf: Map<string, string[]> }> {
  const rows = await sql<{ table_name: string; column_name: string; data_type: string; udt_name: string }>(`
    select c.table_name, c.column_name, c.data_type, c.udt_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and (c.data_type in ('text', 'character varying', 'json', 'jsonb') or c.udt_name in ('_text', '_varchar'))
    order by 1, 2`);
  const columns = rows.map((r) => ({
    table: r.table_name,
    column: r.column_name,
    kind: (r.udt_name === "_text"
      ? "text[]"
      : r.udt_name === "_varchar"
        ? "varchar[]"
        : r.data_type === "json" || r.data_type === "jsonb"
          ? r.data_type
          : "text") as Kind,
  }));
  const pks = await sql<{ table_name: string; column_name: string }>(`
    select tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_schema = tc.constraint_schema and kcu.constraint_name = tc.constraint_name
    where tc.table_schema = 'public' and tc.constraint_type = 'PRIMARY KEY'`);
  const pkOf = new Map<string, string[]>();
  for (const p of pks) pkOf.set(p.table_name, [...(pkOf.get(p.table_name) ?? []), p.column_name]);
  return { columns, pkOf };
}

// Every row holding a Supabase shop-media url, with the column's value.
async function findHits(): Promise<{ hits: Hit[]; skipped: string[] }> {
  const { columns, pkOf } = await findColumns();
  const like = lit(`%${STORAGE_PREFIX}%`);
  const usable = columns.filter((c) => (pkOf.get(c.table) ?? []).length === 1);
  const noKey = columns.filter((c) => (pkOf.get(c.table) ?? []).length !== 1);
  const parts = usable.map(
    (c) =>
      `select ${lit(c.table)} as t, ${lit(c.column)} as c, ${ident(pkOf.get(c.table)![0])}::text as pk, to_jsonb(${ident(c.column)}) as v
       from public.${ident(c.table)} where ${ident(c.column)}::text like ${like}`,
  );
  const found = parts.length ? await sql<{ t: string; c: string; pk: string; v: unknown }>(parts.join("\nunion all\n")) : [];
  const byName = new Map(usable.map((c) => [`${c.table}.${c.column}`, c]));
  const hits = found
    .map((r) => {
      const col = byName.get(`${r.t}.${r.c}`)!;
      return { ...col, pk: r.pk, pkColumn: pkOf.get(r.t)![0], value: r.v };
    })
    .filter((h) => urlsIn(h.value).some((u) => shopFolder(u)));

  // A table without a single-column primary key can't be updated row by row
  // here; say so if it holds shop media, so it's done by hand.
  const skipped: string[] = [];
  if (noKey.length) {
    const checks = noKey.map(
      (c) =>
        `select ${lit(`${c.table}.${c.column}`)} as name, count(*)::int as n from public.${ident(c.table)} where ${ident(c.column)}::text like ${like}`,
    );
    for (const r of await sql<{ name: string; n: number }>(checks.join("\nunion all\n"))) {
      if (r.n > 0) skipped.push(`${r.name} (${r.n} rows - no single-column primary key, not changed)`);
    }
  }
  return { hits, skipped };
}

export function urlsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(...(value.match(URL_RE) ?? []).map(trimUrl));
  else if (Array.isArray(value)) value.forEach((v) => urlsIn(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => urlsIn(v, out));
  return out;
}

export function replaceUrls(value: unknown, moved: Record<string, string>): unknown {
  if (typeof value === "string") {
    return value.replace(URL_RE, (raw) => {
      const url = trimUrl(raw);
      return (moved[url] ?? url) + raw.slice(url.length);
    });
  }
  if (Array.isArray(value)) return value.map((v) => replaceUrls(v, moved));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceUrls(v, moved)]));
  }
  return value;
}

export function shopFolder(url: string): MediaFolder | null {
  const rest = url.slice(STORAGE_PREFIX.length).split(/[?#]/)[0];
  if (/%2f/i.test(rest)) return null;
  const m = SHOP_PATH.exec(rest);
  if (!m) return null;
  return (m[1] as MediaFolder | undefined) ?? "categories";
}

// ---- Files ----

interface Moved {
  [oldUrl: string]: string;
}

function loadMoved(): Moved {
  return existsSync(MOVED_FILE) ? (JSON.parse(readFileSync(MOVED_FILE, "utf8")) as Moved) : {};
}

async function putToR2(key: string, body: Uint8Array, contentType: string) {
  const headers = { "Content-Type": contentType, "Cache-Control": MEDIA_CACHE_CONTROL };
  const uploadUrl = await presignUrl({
    method: "PUT",
    endpoint: `https://${R2.accountId}.r2.cloudflarestorage.com`,
    path: `/${R2.bucket}/${key}`,
    accessKeyId: R2.accessKeyId,
    secretAccessKey: R2.secretAccessKey,
    expiresSeconds: 15 * 60,
    headers,
  });
  const res = await fetch(uploadUrl, { method: "PUT", headers, body });
  if (!res.ok) throw new Error(`R2 upload of ${key} failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
  // Read back through the public address, so a url only goes into the
  // database once shoppers can actually load it.
  const check = await fetch(`${R2.publicBase}/${key}`, { method: "HEAD" });
  const size = Number(check.headers.get("content-length"));
  if (!check.ok || size !== body.byteLength) {
    throw new Error(`${R2.publicBase}/${key} isn't readable yet (${check.status}, ${size} of ${body.byteLength} bytes)`);
  }
}

type Sharp = (input: Uint8Array) => {
  rotate(): ReturnType<Sharp>;
  resize(o: { width: number; withoutEnlargement: boolean }): ReturnType<Sharp>;
  webp(o: { quality: number }): ReturnType<Sharp>;
  toBuffer(): Promise<Buffer>;
};

async function loadSharp(): Promise<Sharp> {
  try {
    return ((await import("sharp")) as { default: Sharp }).default;
  } catch {
    die("sharp isn't installed. Run: npm install --no-save sharp");
  }
}

async function moveFile(oldUrl: string, sharp: Sharp): Promise<string> {
  const folder = shopFolder(oldUrl)!;
  const res = await fetch(oldUrl);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const body = new Uint8Array(await res.arrayBuffer());
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const knownExt = MEDIA_EXT_OF_TYPE[contentType];
  const nameExt = /\.([a-z0-9]{1,5})$/i.exec(oldUrl.split(/[?#]/)[0])?.[1]?.toLowerCase();
  const ext = knownExt ?? nameExt ?? "bin";
  const isPhoto = contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp";

  // Photos get the same smaller WEBP copies a new upload gets (lib/mediaStorage).
  const keys = mediaKeys(folder, randomUUID(), ext, isPhoto ? "webp" : null);
  for (const size of keys.sizes) {
    const copy = await sharp(body).rotate().resize({ width: size.width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    await putToR2(size.key, new Uint8Array(copy), size.contentType);
  }
  await putToR2(keys.main, body, contentType || "application/octet-stream");
  return `${R2.publicBase}/${keys.main}`;
}

async function inPool<T>(items: T[], workers: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

// ---- Rows ----

function sqlValue(kind: Kind, value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  switch (kind) {
    case "text":
      return lit(String(value));
    case "json":
    case "jsonb":
      return `${lit(JSON.stringify(value))}::jsonb`;
    case "text[]":
    case "varchar[]": {
      const items = (value as (string | null)[]).map((v) => (v === null ? "NULL" : lit(v)));
      return items.length ? `ARRAY[${items.join(", ")}]::${kind}` : `'{}'::${kind}`;
    }
  }
}

// One DO block = one transaction: every row is updated only if it still
// holds the value read a moment ago, or nothing is changed at all. User
// triggers are off meanwhile - otherwise set_product_video_status_trigger
// would send every approved product video back to "pending" (the url
// changed, and the Management API isn't an admin), and updated_at would
// move on rows nobody edited.
export function updateBlock(changes: { hit: Hit; next: unknown }[]): string {
  const tables = [...new Set(changes.map((c) => c.hit.table))];
  const lines = ["DO $move$", "DECLARE n int;", "BEGIN"];
  for (const t of tables) lines.push(`  ALTER TABLE public.${ident(t)} DISABLE TRIGGER USER;`);
  for (const { hit, next } of changes) {
    const col = ident(hit.column);
    const current = hit.kind === "json" ? `${col}::jsonb` : col;
    const nextValue = hit.kind === "json" ? `${sqlValue(hit.kind, next)}::json` : sqlValue(hit.kind, next);
    lines.push(
      `  UPDATE public.${ident(hit.table)} SET ${col} = ${nextValue}` +
        ` WHERE ${ident(hit.pkColumn)}::text = ${lit(hit.pk)} AND ${current} IS NOT DISTINCT FROM ${sqlValue(hit.kind, hit.value)};`,
      `  GET DIAGNOSTICS n = ROW_COUNT;`,
      `  IF n <> 1 THEN RAISE EXCEPTION 'Row ${hit.table} ${hit.pk.replace(/'/g, "''")} changed while moving media - nothing was changed, run again'; END IF;`,
    );
  }
  for (const t of tables) lines.push(`  ALTER TABLE public.${ident(t)} ENABLE TRIGGER USER;`);
  lines.push("END", "$move$;");
  return lines.join("\n");
}

// ---- Run ----

async function main() {
  console.log(`Project ${REF} - ${APPLY ? "APPLY" : "dry run (nothing is changed; add --apply to move)"}`);
  const { hits, skipped } = await findHits();
  const urls = [...new Set(hits.flatMap((h) => urlsIn(h.value)).filter((u) => shopFolder(u)))];

  const perColumn = new Map<string, number>();
  for (const h of hits) perColumn.set(`${h.table}.${h.column}`, (perColumn.get(`${h.table}.${h.column}`) ?? 0) + 1);
  console.log(`\n${urls.length} shop files referenced from ${hits.length} rows:`);
  for (const [name, n] of [...perColumn].sort()) console.log(`  ${name}: ${n} rows`);
  for (const s of skipped) console.log(`  SKIPPED ${s}`);

  if (!APPLY) {
    if (urls[0]) {
      const probe = await fetch(urls[0], { method: "HEAD" });
      console.log(
        `\nSupabase Storage answers ${probe.status} for the first file` +
          (probe.ok ? " - files can be copied." : " - files can't be copied until the project is unrestricted."),
      );
    }
    return;
  }

  const sharp = await loadSharp();
  mkdirSync(BACKUP_DIR, { recursive: true });
  const moved = loadMoved();
  const todo = urls.filter((u) => !moved[u]);
  console.log(`\nCopying ${todo.length} files to R2 (${urls.length - todo.length} already copied)...`);
  const failed: string[] = [];
  let done = 0;
  await inPool(todo, 4, async (url) => {
    try {
      moved[url] = await moveFile(url, sharp);
      writeFileSync(MOVED_FILE, JSON.stringify(moved, null, 2));
    } catch (e) {
      failed.push(`${url}\n    ${e instanceof Error ? e.message : String(e)}`);
    }
    done++;
    if (done % 10 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`);
  });
  if (failed.length) {
    die(`${failed.length} files couldn't be copied - no rows were changed. Fix and run again:\n  ${failed.join("\n  ")}`);
  }

  const changes = hits
    .map((hit) => ({ hit, next: replaceUrls(hit.value, moved) }))
    .filter((c) => JSON.stringify(c.next) !== JSON.stringify(c.hit.value));
  const backupFile = join(BACKUP_DIR, `rows-before-${stamp}.json`);
  writeFileSync(
    backupFile,
    JSON.stringify(
      changes.map(({ hit }) => ({ table: hit.table, column: hit.column, kind: hit.kind, [hit.pkColumn]: hit.pk, value: hit.value })),
      null,
      2,
    ),
  );
  console.log(`\nRows backed up to ${backupFile}`);
  console.log(`Updating ${changes.length} rows in one transaction...`);
  if (changes.length) await sql(updateBlock(changes));

  const after = await findHits();
  const left = new Set(after.hits.flatMap((h) => urlsIn(h.value)).filter((u) => shopFolder(u)));
  console.log(
    left.size === 0
      ? "\nDone: every shop photo and video in the database is on R2. The Supabase copies are still there (not deleted)."
      : `\n${left.size} Supabase shop urls are still in the database - run again to see why.`,
  );
}

// Run only when started as a script (the helpers above are also imported by
// a quick check).
if (process.argv[1]?.endsWith("migrate.ts")) {
  main().catch((e) => die(e instanceof Error ? (e.stack ?? e.message) : String(e)));
}
