// Builds 01_schema.sql: the migrations that are on the live project, joined
// in order, as one transaction a new empty Supabase project can run once in
// the SQL Editor. No data from live is read or copied.
//
// Usage (from the repo root):
//   npx supabase migration list --remote=whycxtnjhdbewgyugfax > live-migrations.json
//   node supabase/stage-setup/build.mjs live-migrations.json
//
// Without the JSON file it takes every file in supabase/migrations.
// After rebuilding, refresh the expected fingerprint in 04_check.sql too
// (see README.md).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");
const outFile = join(here, "01_schema.sql");

const files = readdirSync(migrationsDir).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();

let onLive = null;
if (process.argv[2]) {
  const text = readFileSync(process.argv[2], "utf8");
  const list = JSON.parse(text.slice(text.indexOf("{")));
  onLive = new Set(list.migrations.filter((m) => m.remote).map((m) => m.remote));
  const missingLocally = [...onLive].filter((v) => !files.some((f) => f.startsWith(v + "_")));
  if (missingLocally.length) {
    throw new Error(`On live but not in supabase/migrations: ${missingLocally.join(", ")}`);
  }
}

const picked = files.filter((f) => !onLive || onLive.has(f.slice(0, 14)));
const skipped = files.filter((f) => !picked.includes(f));
const total = picked.length;
const pad = (n) => String(n).padStart(3, "0");
const first = picked[0].slice(0, 14);
const last = picked[total - 1].slice(0, 14);

const header = `-- =====================================================================
-- AllBoutiqs STAGE database - STEP 1: the full database structure
-- Built by supabase/stage-setup/build.mjs on ${new Date().toISOString().slice(0, 10)}
--
-- What it is: the ${total} migrations that are on the live project
-- (${first} ... ${last}), joined in order: every table, rule (RLS), function,
-- trigger, storage bucket and scheduled job, plus the built-in settings the
-- migrations add (warehouse, HSN codes, Indian states, platform settings
-- and rates). No customers, orders, boutiques, products or users.
${skipped.length ? `--\n-- Not included (in the repo but not on live yet): ${skipped.join(", ")}\n-- Push those to stage with \`npx supabase db push\` once linked.\n` : ""}--
-- How to run: Supabase dashboard of the NEW stage project -> SQL Editor
-- -> New query -> paste this whole file -> Run. Run it ONCE, on the new
-- empty database only.
--
-- Safe if it fails: it is one transaction, so on any error nothing is kept
-- and the database stays empty. Fix the problem and run it again.
--
-- It records the ${total} migrations as already applied, so afterwards
-- \`npx supabase db push\` against stage only sends newer migrations.
-- =====================================================================

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    RAISE EXCEPTION 'Stopped: this database already has the AllBoutiqs tables (public.products exists). This script is only for a new, empty database.';
  END IF;
END
$guard$;
`;

const body = picked
  .map((f, i) => `\n-- ===== [${pad(i + 1)}/${total}] ${f} =====\n${readFileSync(join(migrationsDir, f), "utf8").trim()}\n`)
  .join("");

const footer = `

-- ===== Record the migrations above as applied (same table the Supabase CLI uses) =====
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text NOT NULL PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
${picked.map((f) => `  ('${f.slice(0, 14)}', '${f.slice(15, -4).replace(/'/g, "''")}')`).join(",\n")}
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Done. Next: STEP 2 (02_admin_account.sql).
`;

writeFileSync(outFile, header + body + footer, "utf8");
console.log(`Wrote ${outFile}: ${total} migrations${skipped.length ? `, skipped ${skipped.join(", ")}` : ""}`);
