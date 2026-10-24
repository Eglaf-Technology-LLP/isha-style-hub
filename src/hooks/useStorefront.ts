import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mapDbVariant, Product, ProductSpecification, ProductVariant } from "@/hooks/useProducts";

// Storefront catalogue: what shoppers can see (live, approved products from
// approved boutiques), fetched once and shared by the homepage, listing pages
// and product pages through react-query's cache.

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

export function useStoreProducts() {
  return useQuery({
    queryKey: ["storefront", "products"],
    staleTime: STALE,
    queryFn: async (): Promise<StoreProduct[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_variants(*), vendor:vendors(name, slug)")
        .eq("is_active", true)
        .eq("approval_status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((p: any) => ({
        ...p,
        images: (p.images as string[]) || [],
        variants: (p.product_variants || []).map(mapDbVariant),
        specifications: (p.specifications as unknown as ProductSpecification[]) || [],
      }));
    },
  });
}

export function useStoreCategories() {
  return useQuery({
    queryKey: ["storefront", "categories"],
    staleTime: STALE,
    queryFn: async (): Promise<StoreCategory[]> => {
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
  const products = useStoreProducts();
  const ready = categories.isSuccess && products.isSuccess;
  const live = new Set((products.data ?? []).map((p) => p.category_id).filter(Boolean));
  return { data: ready ? (categories.data ?? []).filter((c) => live.has(c.id)) : [], ready };
}

export function useStoreBoutiques() {
  return useQuery({
    queryKey: ["storefront", "boutiques"],
    staleTime: STALE,
    queryFn: async (): Promise<StoreBoutique[]> => {
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
