# Live database setup — allboutiqs-marketplace-live

The `Live-Vendor` branch uses **only** this Supabase project:

| | |
|---|---|
| Project | `allboutiqs-marketplace-live` |
| Ref | `whycxtnjhdbewgyugfax` |
| URL | `https://whycxtnjhdbewgyugfax.supabase.co` |

The scripts in this folder fill the new, empty database with three things:

- **The structure:** the same tables, security rules, functions, storage buckets and scheduled jobs as the old live database (`bldkjzitutojvnbbljrf`).
- **The basic settings:** warehouse, HSN codes, Indian states, platform settings and rates, categories, size charts.
- **One admin account.**

Nothing else is copied: no customers, orders or boutiques.

The scripts were tested on a fresh PostgreSQL 17 (the version Supabase runs) and compared with the old live database: 3,713 of 3,713 objects matched.

## A. Database: run in Supabase SQL Editor

Dashboard → **SQL Editor** → **New query** → paste the whole file → **Run**. Do these in order:

| Step | File | What it does | If it fails |
|---|---|---|---|
| 1 | [01_schema.sql](01_schema.sql) | All 100 migrations in one go: structure, built-in settings, 11 cron jobs | Nothing is kept. Fix, then run again |
| 2 | [02_basic_settings.sql](02_basic_settings.sql) | 4 categories, 4 size charts, launch date | Safe to run again |
| 3 | [03_admin_account.sql](03_admin_account.sql) | Creates the admin `dpandey@eglaftechnology.com` with the password you type | It explains what is wrong. Nothing is saved |
| 4 | [04_vault_secrets.sql](04_vault_secrets.sql) | Saves the project URL and service_role key that the cron jobs use | It explains what is wrong. Nothing is saved |
| 5 | [05_check.sql](05_check.sql) | Read-only check. **Every row must say OK** | Send a screenshot to the developer |

In steps 3 and 4, type the password or key into the query in the SQL Editor, not into the file, so it never goes into git.

**Step 4 key:** go to Project Settings → API Keys → **Legacy API Keys** tab → `service_role` → Reveal. It starts with `eyJ`. The new `sb_secret_...` key does not work here.

## B. Edge functions: run in a terminal, on this branch

Log in with the Supabase account that owns `allboutiqs-marketplace-live`:

```sh
npx supabase login
npx supabase link --project-ref whycxtnjhdbewgyugfax
npx supabase functions deploy --project-ref whycxtnjhdbewgyugfax
```

This deploys all 34 functions. [../config.toml](../config.toml) keeps `courier-tracking-webhook`, `razorpay-webhook` and `auth-email-otp` without the JWT check, the same as the old project.

**One working folder, two projects:** `supabase link` is saved in `supabase/.temp`, which is not part of git. It stays the same when you switch branches. So before you run `npx supabase db push`, check which project is linked:

- On `Live-Vendor`, run `npx supabase link --project-ref whycxtnjhdbewgyugfax`.
- On the other branches, link back to the old project: `npx supabase link --project-ref bldkjzitutojvnbbljrf`.

The website itself is safe either way. This branch's `.env.development` and `.env.production` override a local `.env`.

## C. Edge function secrets

Set these under Dashboard → Edge Functions → **Secrets**, or with `npx supabase secrets set --project-ref whycxtnjhdbewgyugfax NAME=value`.

| Secret | Value |
|---|---|
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay API keys (use the **live** keys for the live site) |
| `RAZORPAY_WEBHOOK_SECRET` | The secret you type in the Razorpay webhook (section E) |
| `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD` | Shiprocket API user |
| `SHIPROCKET_WEBHOOK_TOKEN` | Any long random text. Use the same text in the Shiprocket webhook (section E) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` | Zoho mail. `SMTP_PORT` must be `465`, because Supabase blocks 587 |
| `OTP_HASH_SECRET` | Any long random text, e.g. the output of `openssl rand -hex 32` |

Not needed yet: `GEMINI_API_KEY` (the AI features are hidden), and `RAZORPAYX_ACCOUNT_NUMBER` and `RAZORPAYX_WEBHOOK_SECRET` (RazorpayX payouts are paused). Supabase sets the `SUPABASE_*` values by itself.

## D. Dashboard settings

- **Storage** → bucket `email-assets` → upload [../email-assets/allboutiqs-logo-white.png](../email-assets/allboutiqs-logo-white.png) with the same name. Every email shows this logo.
- **Authentication → Sign In / Providers → Phone**: turn it on. Choose SMS provider **Twilio Verify** and enter the Twilio Account SID, Auth Token and Verify Service SID (the same ones as the old project).
- **Authentication → URL Configuration**: set Site URL to the live website address, and add it to Redirect URLs.

## E. Outside services: point them to the new project

- **Razorpay** → Settings → Webhooks → add `https://whycxtnjhdbewgyugfax.supabase.co/functions/v1/razorpay-webhook`. Use the `RAZORPAY_WEBHOOK_SECRET` from section C and the same events as the old webhook.
- **Shiprocket** → Settings → API → Webhooks → URL `https://whycxtnjhdbewgyugfax.supabase.co/functions/v1/courier-tracking-webhook`. The token is `SHIPROCKET_WEBHOOK_TOKEN`.
- **Netlify**: build the live site from the `Live-Vendor` branch. [../../netlify.toml](../../netlify.toml) on this branch already holds the new URL and publishable key.

Remove the old project's webhook URLs once the old site is switched off.

## Later database changes

Step 1 records the 100 migrations as applied. So for a new change on this branch:

1. Add a file to [../migrations/](../migrations/).
2. Link to the live project (see section B).
3. Run `npx supabase db push`. Only the new file is sent.
