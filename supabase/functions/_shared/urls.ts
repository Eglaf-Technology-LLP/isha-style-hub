// Addresses that differ between live and stage.
//
// SITE_URL: the website that email buttons and links open. Live leaves it
// unset, so links go to https://allboutiqs.com as before. Stage sets it to
// the stage website, so a stage email never sends anyone to live.
//
// SUPABASE_URL: this project's own address, set by Supabase itself. Used for
// the email logo and the vendor's "accept order" link, so on stage they point
// at stage's storage and stage's accept-vendor-order function.
export const SITE_URL = (Deno.env.get("SITE_URL")?.trim() || "https://allboutiqs.com").replace(/\/+$/, "");
export const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/+$/, "");
