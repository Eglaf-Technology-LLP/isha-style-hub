import { corsHeaders, errorMessage, jsonResponse, serviceClient } from "../_shared/auth.ts";

// The shop's snapshot (go-live audit, 3 Nov). What every shopper's browser
// otherwise asks the database for - the live catalogue, the menu summary,
// categories and boutiques - written every minute (cron) as two files in
// the public "storefront" storage bucket, which the CDN serves:
//   menu.json       { generated_at, menu, categories, boutiques }  every page
//   catalogue.json  { generated_at, products }                     shop pages
// 10,000 shoppers at once then cost the database one read a minute instead
// of one each. The website (src/hooks/useStorefront.ts) reads these and
// falls back to the database when a file is missing or over 10 minutes old.
//
// Only what a signed-out shopper may see anyway (the products RLS): live,
// approved products of approved boutiques, card fields only - keep
// CARD_SELECT in step with the website's. Cron only (service role).

const CARD_SELECT =
  "id, name, description, price, compare_at_price, images, category_id, vendor_id, created_at, stock_quantity, " +
  "made_to_order, video_url, video_status, video_is_primary, " +
  "product_variants(id, name, price, product_value, sku, stock, options, image_url), vendors!inner(name, slug, status)";
const PAGE = 1000;
const BUCKET = "storefront";

function isServiceRoleCall(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try {
    return JSON.parse(atob((token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
  } catch {
    return false;
  }
}

type CardRow = Record<string, unknown> & {
  category_id: string | null;
  vendor_id: string | null;
  price: number;
  compare_at_price: number | null;
  images: string[] | null;
  vendors?: { name: string; slug: string | null } | null;
};

// The same rows as storefront_menu(): one per category and boutique with
// live products, and the category's newest photo as its cover.
function menuRows(products: CardRow[]) {
  const covers = new Map<string, string>();
  const groups = new Map<string, { category_id: string | null; vendor_id: string | null; products: number; on_sale: boolean }>();
  for (const p of products) {
    if (p.category_id && p.images?.[0] && !covers.has(p.category_id)) covers.set(p.category_id, p.images[0]);
    const key = `${p.category_id}|${p.vendor_id}`;
    const g = groups.get(key) ?? { category_id: p.category_id, vendor_id: p.vendor_id, products: 0, on_sale: false };
    g.products += 1;
    g.on_sale ||= p.compare_at_price != null && Number(p.compare_at_price) > Number(p.price);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, cover: (g.category_id && covers.get(g.category_id)) || null }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!isServiceRoleCall(req)) return jsonResponse({ error: "Not allowed" }, 403);

  try {
    const supabase = serviceClient();

    // Newest first, as the website orders the catalogue.
    const products: CardRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("products")
        .select(CARD_SELECT)
        .eq("is_active", true)
        .eq("approval_status", "approved")
        .eq("vendors.status", "approved")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      products.push(...((data ?? []) as unknown as CardRow[]));
      if (!data || data.length < PAGE) break;
    }
    const cards = products.map(({ vendors, ...p }) => ({ ...p, vendor: vendors ? { name: vendors.name, slug: vendors.slug } : null }));

    const [categories, boutiques] = await Promise.all([
      supabase.from("categories").select("id, name, slug, description, image_url").order("name"),
      supabase
        .from("vendors")
        .select("id, name, slug, description, logo_url, banner_url, is_verified, is_founding, is_trusted")
        .eq("status", "approved")
        .order("name"),
    ]);
    if (categories.error) throw categories.error;
    if (boutiques.error) throw boutiques.error;

    const generated_at = new Date().toISOString();
    const put = async (path: string, body: unknown) => {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, new Blob([JSON.stringify(body)], { type: "application/json" }), {
          upsert: true,
          contentType: "application/json",
          cacheControl: "60",
        });
      if (error) throw error;
    };
    await put("catalogue.json", { generated_at, products: cards });
    await put("menu.json", { generated_at, menu: menuRows(products), categories: categories.data, boutiques: boutiques.data });

    return jsonResponse({ generated_at, products: cards.length });
  } catch (e) {
    console.error("storefront-snapshot failed", errorMessage(e));
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
