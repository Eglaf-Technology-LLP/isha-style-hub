import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mapDbVariant, Product, ProductSpecification, ProductVariant } from "@/hooks/useProducts";

// Storefront catalogue: what shoppers can see (live, approved products from
// approved boutiques), fetched once and shared by the homepage, listing pages
// and boutique pages through react-query's cache. The header, footer and
// product page don't need all of it: they use the menu summary
// (useStoreMenu) and small queries (useStoreProductsByIds,
// useRelatedStoreProducts).

export interface StoreCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
}

export interface StoreBoutique {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  is_verified: boolean;
  is_founding: boolean;
  is_trusted: boolean;
}

export type StoreProduct = Product & {
  vendor?: { name: string; slug?: string | null } | null;
};

const STALE = 5 * 60 * 1000;

// What product cards, rails, listing filters and the compare drawer read -
// not the whole row (specifications, customisation, AI and admin fields
// stay on the product page's own query).
const CARD_SELECT =
  "id, name, description, price, compare_at_price, images, category_id, vendor_id, created_at, stock_quantity, " +
  "made_to_order, video_url, video_status, video_is_primary, " +
  "product_variants(id, name, price, product_value, sku, stock, options, image_url), vendor:vendors(name, slug)";

// The API returns at most 1000 rows per request - the catalogue is read in
// pages so nothing past the first 1000 silently drops out of the shop.
const PAGE = 1000;

type CardRow = Record<string, unknown> & {
  images?: unknown;
  specifications?: unknown;
  product_variants?: Parameters<typeof mapDbVariant>[0][] | null;
};

function toStoreProduct(p: CardRow): StoreProduct {
  return {
    ...p,
    images: (p.images as string[]) || [],
    variants: (p.product_variants || []).map(mapDbVariant),
    specifications: (p.specifications as ProductSpecification[]) || [],
  } as unknown as StoreProduct;
}

const cardRows = (data: unknown) => (data || []) as CardRow[];

const liveProducts = () =>
  supabase.from("products").select(CARD_SELECT).eq("is_active", true).eq("approval_status", "approved");

// The shop's snapshot (supabase/functions/storefront-snapshot): the
// catalogue, menu, categories and boutiques written every minute as files
// the CDN serves, so busy days don't land on the database. Read first; the
// database is asked only when a file is missing or over 10 minutes old.
const SNAPSHOT_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/storefront`;
const SNAPSHOT_MAX_AGE = 10 * 60 * 1000;

async function readSnapshot<T>(file: string): Promise<T | null> {
  try {
    const res = await fetch(`${SNAPSHOT_URL}/${file}`);
    if (!res.ok) return null;
    const body = await res.json();
    const at = Date.parse(body?.generated_at ?? "");
    return Date.now() - at <= SNAPSHOT_MAX_AGE ? (body as T) : null;
  } catch {
    return null;
  }
}

interface MenuSnapshot {
  menu: StoreMenuRow[];
  categories: StoreCategory[];
  boutiques: StoreBoutique[];
}

// menu.json feeds three hooks - read once a minute at most.
let menuFile: { at: number; file: Promise<MenuSnapshot | null> } | null = null;
function menuSnapshot() {
  if (!menuFile || Date.now() - menuFile.at > 60_000) {
    menuFile = { at: Date.now(), file: readSnapshot<MenuSnapshot>("menu.json") };
  }
  return menuFile.file;
}

export function useStoreProducts() {
  return useQuery({
    queryKey: ["storefront", "products"],
    staleTime: STALE,
    queryFn: async (): Promise<StoreProduct[]> => {
      const snapshot = await readSnapshot<{ products: CardRow[] }>("catalogue.json");
      if (snapshot) return cardRows(snapshot.products).map(toStoreProduct);
      const rows: CardRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await liveProducts()
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...cardRows(data));
        if (!data || data.length < PAGE) break;
      }
      return rows.map(toStoreProduct);
    },
  });
}

// Live products by id, in the order asked (recently viewed, wishlist).
export function useStoreProductsByIds(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["storefront", "products-by-id", key],
    staleTime: STALE,
    enabled: key.length > 0,
    queryFn: async (): Promise<StoreProduct[]> => {
      const { data, error } = await liveProducts().in("id", key);
      if (error) throw error;
      const byId = new Map(cardRows(data).map((p) => [p.id as string, toStoreProduct(p)]));
      return ids.map((id) => byId.get(id)).filter((p): p is StoreProduct => !!p);
    },
  });
}

// The shop's newest pieces (a rail on an empty wishlist).
export function useLatestStoreProducts(enabled = true, limit = 12) {
  return useQuery({
    queryKey: ["storefront", "latest", limit],
    staleTime: STALE,
    enabled,
    queryFn: async (): Promise<StoreProduct[]> => {
      const { data, error } = await liveProducts().order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return cardRows(data).map(toStoreProduct);
    },
  });
}

// Product page rows: the boutique's newest pieces, the category's, and the
// shop's newest to top up - three small queries instead of the catalogue.
export function useRelatedStoreProducts(categoryId: string | null, vendorId: string | null) {
  return useQuery({
    queryKey: ["storefront", "related", categoryId, vendorId],
    staleTime: STALE,
    queryFn: async () => {
      const newest = (q: ReturnType<typeof liveProducts>) =>
        q.order("created_at", { ascending: false }).limit(13);
      const [boutique, category, latest] = await Promise.all([
        vendorId ? newest(liveProducts().eq("vendor_id", vendorId)) : null,
        categoryId ? newest(liveProducts().eq("category_id", categoryId)) : null,
        newest(liveProducts()),
      ]);
      for (const r of [boutique, category, latest]) if (r?.error) throw r.error;
      return {
        fromBoutique: cardRows(boutique?.data).map(toStoreProduct),
        sameCategory: cardRows(category?.data).map(toStoreProduct),
        latest: cardRows(latest.data).map(toStoreProduct),
      };
    },
  });
}

// The menu summary (storefront_menu): one row per category and boutique with
// live products, plus the category's cover photo.
export interface StoreMenuRow {
  category_id: string | null;
  vendor_id: string | null;
  products: number;
  on_sale: boolean;
  cover: string | null;
}

export function useStoreMenu() {
  return useQuery({
    queryKey: ["storefront", "menu"],
    staleTime: STALE,
    queryFn: async (): Promise<StoreMenuRow[]> => {
      const snapshot = await menuSnapshot();
      if (snapshot) return snapshot.menu;
      const { data, error } = await supabase.rpc("storefront_menu");
      if (error) throw error;
      return (data || []) as StoreMenuRow[];
    },
  });
}

export function useStoreCategories() {
  return useQuery({
    queryKey: ["storefront", "categories"],
    staleTime: STALE,
    queryFn: async (): Promise<StoreCategory[]> => {
      const snapshot = await menuSnapshot();
      if (snapshot) return snapshot.categories;
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, description, image_url")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });
}

// Categories for the top menu and footer (Developer Corrections Part 8, 11):
// only ones with at least one live product - an empty category makes the
// shop look closed - and nothing until both lists have loaded.
export function useMenuCategories() {
  const categories = useStoreCategories();
  const menu = useStoreMenu();
  const ready = categories.isSuccess && menu.isSuccess;
  const live = new Set((menu.data ?? []).map((r) => r.category_id).filter(Boolean));
  return { data: ready ? (categories.data ?? []).filter((c) => live.has(c.id)) : [], ready };
}

export function useStoreBoutiques() {
  return useQuery({
    queryKey: ["storefront", "boutiques"],
    staleTime: STALE,
    queryFn: async (): Promise<StoreBoutique[]> => {
      const snapshot = await menuSnapshot();
      if (snapshot) return snapshot.boutiques;
      const { data, error } = await supabase
        .from("vendors")
        .select("id, name, slug, description, logo_url, banner_url, is_verified, is_founding, is_trusted")
        .eq("status", "approved")
        .order("name");
      if (error) throw error;
      return (data || []) as StoreBoutique[];
    },
  });
}

// ---------- product helpers shared by cards, filters and pages ----------

export const sizeOf = (v: ProductVariant) => v.options?.size || v.options?.Size || null;
export const colorOf = (v: ProductVariant) => v.options?.color || v.options?.Color || null;

export function productSizes(p: Product): string[] {
  return [...new Set((p.variants || []).map(sizeOf).filter((s): s is string => !!s))];
}

export function productColors(p: Product): string[] {
  return [...new Set((p.variants || []).map(colorOf).filter((c): c is string => !!c))];
}

// Days since it went live - "New" badge for the last 30 days.
export function isNewArrival(p: Product, days = 30): boolean {
  return Date.now() - new Date(p.created_at).getTime() < days * 86_400_000;
}

export function inStock(p: Product): boolean {
  if (p.variants?.length) return p.variants.some((v) => (v.stock ?? 0) > 0);
  return (p.stock_quantity ?? 0) > 0;
}

// The first photo of any product in a category - a stand-in for a category
// tile until an admin uploads the category's own image.
export function categoryCover(categoryId: string, products: Product[]): string | null {
  return products.find((p) => p.category_id === categoryId && p.images?.[0])?.images[0] ?? null;
}
