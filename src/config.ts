import { COMPANY } from '@/content/company';

// Public settings, the same values the website ships in its JS bundle (data
// access is guarded by Supabase row-level security, not by hiding these).

// Which database the app talks to. Keep 'live' in git and in every Play Store
// build; set 'stage' only on your machine to test (orders, Razorpay) there.
const APP_ENV: 'live' | 'stage' = 'live';

const SUPABASE = {
  // allboutiqs-marketplace-live (Live-Vendor / allboutiqs.com-Main netlify.toml)
  live: {
    url: 'https://whycxtnjhdbewgyugfax.supabase.co',
    key: 'sb_publishable_lXOgH0JPjvNKns9AkzuW8A_ad7UCdw6',
  },
  // Stage website's project (Stage-allboutiqs.com-Main netlify.toml, 24 Nov 2026)
  stage: {
    url: 'https://eytbtryvrerjayrrczjf.supabase.co',
    key: 'sb_publishable_RewgMacXsXjHLZwqXvio6A__fBsWqhM',
  },
} as const;

export const CONFIG = {
  appEnv: APP_ENV,
  supabaseUrl: SUPABASE[APP_ENV].url,
  supabaseKey: SUPABASE[APP_ENV].key,
  siteUrl: 'https://allboutiqs.com',
  // Customer care, as shown on the website (its src/lib/company.ts, copied
  // to src/content/company.ts by npm run legal:sync).
  whatsappUrl: COMPANY.whatsappUrl,
  supportEmail: COMPANY.supportEmail,
  supportPhone: COMPANY.supportPhone,
  whatsapp: COMPANY.whatsapp,
} as const;
