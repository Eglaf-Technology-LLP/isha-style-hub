import { COMPANY } from '@/content/company';

// Public settings, the same values the website ships in its JS bundle (data
// access is guarded by Supabase row-level security, not by hiding these).
// Point at staging by swapping the two Supabase values.
export const CONFIG = {
  supabaseUrl: 'https://whycxtnjhdbewgyugfax.supabase.co', // live: allboutiqs-marketplace-live
  supabaseKey: 'sb_publishable_lXOgH0JPjvNKns9AkzuW8A_ad7UCdw6',
  siteUrl: 'https://allboutiqs.com',
  // Customer care, as shown on the website (its src/lib/company.ts, copied
  // to src/content/company.ts by npm run legal:sync).
  whatsappUrl: COMPANY.whatsappUrl,
  supportEmail: COMPANY.supportEmail,
  supportPhone: COMPANY.supportPhone,
  whatsapp: COMPANY.whatsapp,
} as const;
