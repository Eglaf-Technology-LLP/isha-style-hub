# Stage database setup

Sets up a new, empty Supabase project as **stage**, with the same structure as live (`allboutiqs-marketplace-live`, `whycxtnjhdbewgyugfax`). No data comes across: no users, boutiques, products, orders or uploaded files.

What you get: all tables, RLS rules, functions, triggers, permissions, the 7 storage buckets and the 15 cron jobs (`media-cleanup` is then switched off, see [Branches](#branches-stage-and-live-stay-apart)). You also get the built-in settings that the migrations add (warehouse, HSN codes, Indian states, platform settings and rates).

**Tested 2026-11-23:** `01_schema.sql` was run on a fresh PostgreSQL database and compared with live, object by object. All 4,879 structure objects matched. It also runs without errors when the paste turns CRLF line endings into LF.

## Branches: stage and live stay apart

| Branch | Supabase project | Config in the branch | R2 |
|---|---|---|---|
| `Stage-allboutiqs.com-Main` (this one), site https://stage-allboutiqs.netlify.app | stage `eytbtryvrerjayrrczjf` | `.env.development`, `.env.production`, `.env.example`, `netlify.toml` and `supabase/config.toml` point at stage | **Not used.** Photos and videos go to stage's own Supabase Storage |
| `allboutiqs.com-Main` | live `whycxtnjhdbewgyugfax` | Live | Live's R2 bucket |

How a change moves:

1. Make it on a feature branch taken from `allboutiqs.com-Main`.
2. Merge the feature branch into `Stage-allboutiqs.com-Main`, deploy to stage, test.
3. Merge the **same feature branch** into `allboutiqs.com-Main` for live.

**Never merge `Stage-allboutiqs.com-Main` into `allboutiqs.com-Main`.** It would carry the stage config files and this folder to live, and the live site would open the stage database.

The R2 code (`media-upload-url`, `media-delete`, `media-cleanup`, `src/lib/mediaStorage.ts`) stays the same as live, so what is tested on stage is what goes live. On stage it does nothing: there is no `VITE_MEDIA_BASE_URL`, `deploy-stage.ps1` refuses `R2_*` values, and the `media-cleanup` cron job is switched off (section A, step 3).

Email links and the email logo follow the project: the logo and the vendor's "accept order" link use stage's own Supabase address, and buttons open `SITE_URL` (section C).

## Files

| Step | File | What it does | If it fails |
|---|---|---|---|
| 1 | [01_schema.sql](01_schema.sql) | The 139 migrations that are on live, in one transaction. Also records them as applied | Nothing is kept. Fix the problem and run it again |
| 2 | [02_admin_account.sql](02_admin_account.sql) | First admin (roles `admin` + `super_admin`). You type the email and password in the editor | It tells you what is wrong. Nothing is saved |
| 3 | [03_vault_secrets.sql](03_vault_secrets.sql) | Stage project URL + legacy `service_role` key for the cron jobs. Refuses live's URL or key | It tells you what is wrong. Nothing is saved |
| 4 | [04_check.sql](04_check.sql) | Read-only check against the live fingerprint. **Every row must say OK** | Send the result to the developer |
| - | [build.mjs](build.mjs) | Rebuilds `01_schema.sql` (see the last section) | - |

Type passwords and keys into the SQL Editor only, never into these files.

## A. Database

1. Create the new Supabase project (region and Postgres version the same as live: PostgreSQL 17).
2. Dashboard → **SQL Editor** → **New query** → paste the whole file → **Run**. Do steps 1 to 4 in order.
3. Switch off the R2 clean-up job (stage has no R2). `04_check.sql` says `ON` until this has run:

```sql
SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname = 'media-cleanup'), active := false);
```

If the SQL Editor refuses `01_schema.sql` because of its size (874 KB) or times out, run it with psql. Use the connection string from Dashboard → **Connect** → Session pooler:

```sh
psql "postgresql://postgres.<stage-ref>:<db-password>@<pooler-host>:5432/postgres" -v ON_ERROR_STOP=1 -f supabase/stage-setup/01_schema.sql
```

## B. Edge functions and their secrets: one script

```powershell
powershell -ExecutionPolicy Bypass -File supabase/stage-setup/deploy-stage.ps1
```

1. First run: it creates `supabase/stage-setup/.env.stage` (git-ignored) from [stage-secrets.template](stage-secrets.template) and stops. Fill in the values there.
2. Second run: it checks the values. It refuses live's Razorpay key, any R2 value, a `SITE_URL` that is the live site, `SHIPROCKET_SKIP_PICKUP` other than `true`, and an SMTP port other than 465. Then it asks for an access token of the Supabase account that owns stage (supabase.com → Account → Access Tokens). The token is typed hidden, used for this run only, and never saved. Your normal CLI login stays on live.
3. It shows what it will do. Type the stage ref to confirm. It deploys all edge functions and sets the secrets.

Every command targets the stage ref only. The live ref is refused.

[../config.toml](../config.toml) keeps `courier-tracking-webhook`, `razorpay-webhook`, `auth-email-otp`, `submit-complaint` and `accept-vendor-order` without the JWT check, the same as on live.

## C. Edge function secrets: do not use live's keys

The secret names are the same as in [../live-setup/README.md](../live-setup/README.md) section C. Choose the values for stage:

| Service | On stage |
|---|---|
| Razorpay | **Test mode** keys and a test-mode webhook |
| Shiprocket | Leave empty unless you really want to test bookings. Shiprocket has no sandbox, so every booking is a real pickup that gets billed |
| R2 (`R2_*`, `MEDIA_BASE_URL`) | **Not used on stage.** The script refuses them. Never give stage live's R2 keys: stage's `media-cleanup` would see an empty database and treat every live file as unused |
| `SITE_URL` | The stage website's address (no trailing slash). Email buttons and links open it. Empty = they open `https://allboutiqs.com`, the live site |
| SMTP / Twilio | Emails and SMS go to real people. Test only with your own addresses and numbers, or leave these empty |
| RazorpayX | Leave empty |

## D. Dashboard and frontend

- **Authentication → URL Configuration:** set the stage site URL and redirect URLs.
- **Authentication → Phone:** fill in the three `TWILIO_VERIFY_` values in `.env.stage` and run `deploy-stage.ps1` (with the access token). It turns phone sign-in on with Twilio Verify. Leave them empty to keep phone sign-in off.
- **Storage → `email-assets`:** upload [../email-assets/allboutiqs-logo-white.png](../email-assets/allboutiqs-logo-white.png).
- **Stage frontend build:** this branch's [../../netlify.toml](../../netlify.toml) already holds the stage URL and publishable key. Create a **separate** Netlify site that builds from `Stage-allboutiqs.com-Main`, and do not add `VITE_MEDIA_BASE_URL` to its environment variables. Then put that site's address in `SITE_URL` in `.env.stage` and run `deploy-stage.ps1 -SkipFunctions`.
- **Local:** `npm run dev` on this branch uses stage (from `.env.development`).

## E. Not copied from live (set in Admin if stage should match)

These are settings that Admin changed on live after the migrations ran. On stage they keep the migration defaults:

| Setting | Live | Stage after setup |
|---|---|---|
| Platform rates: payment gateway fee | 3% | 2.36% |
| Platform rates: `effective_from` | 2026-11-05 / 2026-11-10 | the day you run step 1 |
| Platform settings: boutique return SLA | 24 h | 48 h |
| Platform settings: e-way bill transporter | AllBoutiqs Private Limited, GSTIN set | AllBoutiqs, no GSTIN |
| HSN codes | 23 (adds 6211) | 22 |
| Categories, size charts | 34 categories, 4 size charts | none |

## Later database changes

`01_schema.sql` records the 139 migrations as applied, so `db push` to stage only sends newer ones. Push to stage first, test, then push to live:

```sh
npx supabase migration list --remote=<stage-ref>
npx supabase db push --remote=<stage-ref> --skip-vault
```

On 2026-11-23, `20261122100000_order_sms_off.sql` was in the repo but not yet on live. It is not in `01_schema.sql`, so it shows as pending on stage too.

## Rebuilding 01_schema.sql

Do this when stage has to be created again later and live has gained migrations:

```sh
npx supabase migration list --remote=whycxtnjhdbewgyugfax > live-migrations.json
node supabase/stage-setup/build.mjs live-migrations.json
```

Then refresh the `expected` rows in `04_check.sql`. Take the part of `04_check.sql` from `WITH` up to the end of the `actual` CTE, add `SELECT cat, n, h FROM actual ORDER BY cat;`, and run it on live with `npx supabase db query --remote=whycxtnjhdbewgyugfax --read-only --file <that file>`. Paste the rows in.
