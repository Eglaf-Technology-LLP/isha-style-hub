// Public settings, the same values the website ships in its JS bundle (data
// access is guarded by Supabase row-level security, not by hiding these).
// Point at staging by swapping the two Supabase values.
export const CONFIG = {
  supabaseUrl: 'https://whycxtnjhdbewgyugfax.supabase.co', // live: allboutiqs-marketplace-live
  supabaseKey: 'sb_publishable_lXOgH0JPjvNKns9AkzuW8A_ad7UCdw6',
  siteUrl: 'https://allboutiqs.com',
  whatsappUrl: 'https://wa.me/917801940567',
} as const;
