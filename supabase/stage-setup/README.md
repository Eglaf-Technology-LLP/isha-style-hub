# Stage database setup

Sets up a new, empty Supabase project as **stage**, with the same structure as live (`allboutiqs-marketplace-live`, `whycxtnjhdbewgyugfax`). No data comes across: no users, boutiques, products, orders or uploaded files.

What you get: all tables, RLS rules, functions, triggers, permissions, the 7 storage buckets and the 15 cron jobs. You also get the built-in settings that the migrations add (warehouse, HSN codes, Indian states, platform settings and rates).

**Tested 2026-11-23:** `01_schema.sql` was run on a fresh PostgreSQL database and compared with live, object by object. All 4,879 structure objects matched. It also runs without errors when the paste turns CRLF line endings into LF.

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

If the SQL Editor refuses `01_schema.sql` because of its size (874 KB) or times out, run it with psql. Use the connection string from Dashboard → **Connect** → Session pooler:

```sh
psql "postgresql://postgres.<stage-ref>:<db-password>@<pooler-host>:5432/postgres" -v ON_ERROR_STOP=1 -f supabase/stage-setup/01_schema.sql
```

## B. Edge functions and their secrets: one script

```powershell
powershell -ExecutionPolicy Bypass -File supabase/stage-setup/deploy-stage.ps1
```

1. First run: it creates `supabase/stage-setup/.env.stage` (git-ignored) from [stage-secrets.template](stage-secrets.template) and stops. Fill in the values there.
2. Second run: it checks the values. It refuses live's Razorpay key, live's R2 bucket, `SHIPROCKET_SKIP_PICKUP` other than `true`, and an SMTP port other than 465. Then it asks for an access token of the Supabase account that owns stage (supabase.com → Account → Access Tokens). The token is typed hidden, used for this run only, and never saved. Your normal CLI login stays on live.
3. It shows what it will do. Type the stage ref to confirm. It deploys all edge functions and sets the secrets.

Every command targets the stage ref only. The live ref is refused.

[../config.toml](../config.toml) keeps `courier-tracking-webhook`, `razorpay-webhook`, `auth-email-otp`, `submit-complaint` and `accept-vendor-order` without the JWT check, the same as on live.

## C. Edge function secrets: do not use live's keys

The secret names are the same as in [../live-setup/README.md](../live-setup/README.md) section C. Choose the values for stage:

| Service | On stage |
|---|---|
| Razorpay | **Test mode** keys and a test-mode webhook |
| Shiprocket | Leave empty unless you really want to test bookings. Shiprocket has no sandbox, so every booking is a real pickup that gets billed |
| R2 (`R2_*`) | A **separate bucket** (e.g. `allboutiqs-media-stage`). If stage shares live's bucket, stage uploads mix with live files, and the nightly `media-cleanup` job works against an empty database. Its safety stop should catch this, but don't depend on it |
| SMTP / Twilio | Emails and SMS go to real people. Test only with your own addresses and numbers, or leave these empty |
| RazorpayX | Leave empty |

## D. Dashboard and frontend

- **Authentication → URL Configuration:** set the stage site URL and redirect URLs.
- **Authentication → Phone:** fill in the three `TWILIO_VERIFY_` values in `.env.stage` and run `deploy-stage.ps1` (with the access token). It turns phone sign-in on with Twilio Verify. Leave them empty to keep phone sign-in off.
- **Storage → `email-assets`:** upload [../email-assets/allboutiqs-logo-white.png](../email-assets/allboutiqs-logo-white.png).
- **Stage frontend build:** set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PROJECT_ID` to the stage project, and `VITE_MEDIA_BASE_URL` to the stage R2 bucket's public URL.

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
