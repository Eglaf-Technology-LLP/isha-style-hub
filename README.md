# AllBoutiqs

Indian ethnic and western fashion marketplace, with AI styling and virtual try-on.

The **`Stage-allboutiqs.com-Main` branch** runs on the **stage** Supabase project **Stageallboutiqs** (`eytbtryvrerjayrrczjf`) only. Its committed `.env.development`, `.env.production` and `netlify.toml` point at stage and take priority over a local `.env`. Stage has no R2: photos and videos go to stage's own Supabase Storage. Setup, deploy and the branch rules are in [supabase/stage-setup/README.md](supabase/stage-setup/README.md).

**Never merge this branch into `allboutiqs.com-Main` (live).** Make changes on a feature branch, merge it here to test on stage, then merge the same feature branch into `allboutiqs.com-Main`.

## Stack

- Vite + React + TypeScript
- shadcn-ui + Tailwind CSS
- Supabase (Postgres, Auth, Storage, Edge Functions) — product catalogue, orders, vendors, everything
- Google Gemini (AI styling, size recommendation, virtual try-on)

## Local setup

```sh
# 1. Install dependencies
npm i

# 2. Copy the env template (on this branch it already holds the stage project's public values)
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

Edge function secrets are set in Supabase, not in `.env`. For stage they come from the git-ignored `supabase/stage-setup/.env.stage` (template: [supabase/stage-setup/stage-secrets.template](supabase/stage-setup/stage-secrets.template)).

## Supabase

Schema and edge functions live in [supabase/](supabase/).

- **First setup of an empty stage database:** run the scripts in [supabase/stage-setup/](supabase/stage-setup/), in order.
- **Later changes, to stage only.** The normal CLI login sees only live, so first set `SUPABASE_ACCESS_TOKEN` to an access token of the account that owns stage. Then:

```sh
npx supabase migration list --remote=eytbtryvrerjayrrczjf
npx supabase db push --remote=eytbtryvrerjayrrczjf --skip-vault
powershell -ExecutionPolicy Bypass -File supabase/stage-setup/deploy-stage.ps1 -SkipSecrets
```

The last line deploys all edge functions to stage. Without `-SkipSecrets` it also sets the secrets from `.env.stage`.
