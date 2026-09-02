# AllBoutiqs

Indian ethnic and western fashion marketplace, with AI styling and virtual try-on.

## Stack

- Vite + React + TypeScript
- shadcn-ui + Tailwind CSS
- Supabase (Postgres, Auth, Storage, Edge Functions) — product catalogue, orders, vendors, everything
- Google Gemini (AI styling, size recommendation, virtual try-on)

## Local setup

```sh
# 1. Install dependencies
npm i

# 2. Copy the env template and fill in real values (see below)
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

Edge function secrets (set via `supabase secrets set`, not `.env`):

| Secret | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key, used by `complete-the-look`, `ai-size-recommender`, `virtual-try-on` |
| `RESEND_API_KEY` | Transactional email (order/return confirmations) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Set automatically by Supabase for edge functions |

## Supabase

Schema and edge functions live in [supabase/](supabase/). To apply migrations to a project:

```sh
supabase link --project-ref <your-project-ref>
supabase db push
supabase functions deploy
supabase secrets set GEMINI_API_KEY=<key> RESEND_API_KEY=<key>
```
