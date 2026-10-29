# AllBoutiqs

Indian ethnic and western fashion marketplace, with AI styling and virtual try-on.

The **`Live-Vendor` branch** runs on the live Supabase project **allboutiqs-marketplace-live** (`whycxtnjhdbewgyugfax`) only. Its committed `.env.development` and `.env.production` take priority over a local `.env`. To set up that database, functions and dashboard, follow [supabase/live-setup/README.md](supabase/live-setup/README.md).

## Stack

- Vite + React + TypeScript
- shadcn-ui + Tailwind CSS
- Supabase (Postgres, Auth, Storage, Edge Functions) — product catalogue, orders, vendors, everything
- Google Gemini (AI styling, size recommendation, virtual try-on)

## Local setup

```sh
# 1. Install dependencies
npm i

# 2. Copy the env template (on Live-Vendor it already holds the live project's public values)
cp .env.example .env

# 3. Start the dev server
npm run dev
```

## Environment variables

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ref |

Edge function secrets are set in Supabase, not in `.env`. The full list is in [supabase/live-setup/README.md](supabase/live-setup/README.md#c-edge-function-secrets).

## Supabase

Schema and edge functions live in [supabase/](supabase/).

- **First setup of the empty live database:** run the scripts in [supabase/live-setup/](supabase/live-setup/), in order.
- **Later schema changes:** add a migration file, then run:

```sh
npx supabase link --project-ref whycxtnjhdbewgyugfax
npx supabase db push
npx supabase functions deploy --project-ref whycxtnjhdbewgyugfax
```
