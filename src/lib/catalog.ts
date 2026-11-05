import { useQuery } from '@tanstack/react-query';
import { CONFIG } from '@/config';
import { supabase } from './supabase';

// The shopper catalogue - the same queries and rules as the website's
// src/hooks/useStorefront.ts: live, approved products from approved
// boutiques; the CDN snapshot first, the database when it's missing/stale.

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  stock: number;
  options: Record<string, string>;
  image_url: string | null;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  images: string[];
  category_id: string | null;
  vendor_id: string | null;
  created_at: string;
  stock_quantity: number;
  made_to_order?: boolean | null;
  variants: ProductVariant[];
  vendor?: { name: string; slug?: string | null } | null;
  specifications?: { label: string; value: string }[];
  is_returnable?: boolean | null;
  cod_available?: boolean | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
}

export interface Boutique {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  is_verified: boolean;
}

const STALE = 5 * 60 * 1000;
const CARD_SELECT =
  'id, name, description, price, compare_at_price, images, category_id, vendor_id, created_at, stock_quantity, made_to_order, ' +
  'product_variants(id, name, price, stock, options, image_url), vendor:vendors(name, slug)';
const PAGE = 1000;

type Row = Record<string, unknown> & {
  product_variants?: Record<string, unknown>[] | null;
};

function toProduct(r: Row): Product {
  return {
    ...(r as unknown as Product),
    price: Number(r.price) || 0,
    compare_at_price:
      r.compare_at_price == null ? null : Number(r.compare_at_price),
    images: (r.images as string[]) || [],
    specifications: (r.specifications as Product['specifications']) || [],
    variants: (r.product_variants || []).map(v => ({
      id: v.id as string,
      name: v.name as string,
      price: Number(v.price) || 0,
      stock: Number(v.stock) || 0,
      options: (v.options as Record<string, string>) || {},
      image_url: (v.image_url as string | null) ?? null,
    })),
  };
}

const liveProducts = (select = CARD_SELECT) =>
  supabase
    .from('products')
    .select(select)
    .eq('is_active', true)
    .eq('approval_status', 'approved');

const SNAPSHOT_URL = `${CONFIG.supabaseUrl}/storage/v1/object/public/storefront`;
async function readSnapshot<T>(file: string): Promise<T | null> {
  try {
    const res = await fetch(`${SNAPSHOT_URL}/${file}`);
    if (!res.ok) return null;
    const body = await res.json();
    const at = Date.parse(body?.generated_at ?? '');
    return Date.now() - at <= 10 * 60 * 1000 ? (body as T) : null;
  } catch {
    return null;
  }
}

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    staleTime: STALE,
    queryFn: async () => {
      const snap = await readSnapshot<{ products: Row[] }>('catalogue.json');
      if (snap) return snap.products.map(toProduct);
      const rows: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await liveProducts()
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...((data || []) as unknown as Row[]));
        if (!data || data.length < PAGE) break;
      }
      return rows.map(toProduct);
    },
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['product', id],
    staleTime: STALE,
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await liveProducts(
        '*, product_variants(id, name, price, stock, options, image_url), vendor:vendors(name, slug)',
      )
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data ? toProduct(data as unknown as Row) : null;
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    staleTime: STALE,
    queryFn: async (): Promise<Category[]> => {
      const snap = await readSnapshot<{ categories: Category[] }>('menu.json');
      if (snap) return snap.categories;
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, description, image_url')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useBoutiques() {
  return useQuery({
    queryKey: ['boutiques'],
    staleTime: STALE,
    queryFn: async (): Promise<Boutique[]> => {
      const snap = await readSnapshot<{ boutiques: Boutique[] }>('menu.json');
      if (snap) return snap.boutiques;
      const { data, error } = await supabase
        .from('vendors')
        .select(
          'id, name, slug, description, logo_url, banner_url, is_verified',
        )
        .eq('status', 'approved')
        .order('name');
      if (error) throw error;
      return (data || []) as Boutique[];
    },
  });
}

// ---------- helpers (same rules as the website) ----------

export const sizeOf = (v: ProductVariant) =>
  v.options?.size || v.options?.Size || null;
export const colorOf = (v: ProductVariant) =>
  v.options?.color || v.options?.Color || null;
export const productSizes = (p: Product) => [
  ...new Set(p.variants.map(sizeOf).filter((s): s is string => !!s)),
];
export const productColors = (p: Product) => [
  ...new Set(p.variants.map(colorOf).filter((c): c is string => !!c)),
];
export const isNewArrival = (p: Product, days = 30) =>
  Date.now() - new Date(p.created_at).getTime() < days * 86_400_000;
export const inStock = (p: Product) =>
  p.variants.length
    ? p.variants.some(v => v.stock > 0)
    : (p.stock_quantity ?? 0) > 0;
export const onSale = (p: Product) =>
  !!p.compare_at_price && p.compare_at_price > p.price;
export const categoryCover = (categoryId: string, products: Product[]) =>
  products.find(p => p.category_id === categoryId && p.images[0])?.images[0] ??
  null;

export type SortKey = 'featured' | 'newest' | 'price-asc' | 'price-desc';

export interface ListingFilter {
  categoryId?: string | null;
  vendorId?: string | null;
  sale?: boolean;
  max?: number | null;
  availability?: 'ready' | 'made-to-order' | null;
  query?: string;
}

export function filterProducts(
  products: Product[],
  f: ListingFilter,
  sort: SortKey = 'featured',
): Product[] {
  const q = f.query?.trim().toLowerCase();
  const out = products.filter(
    p =>
      (!f.categoryId || p.category_id === f.categoryId) &&
      (!f.vendorId || p.vendor_id === f.vendorId) &&
      (!f.sale || onSale(p)) &&
      (!f.max || p.price <= f.max) &&
      (f.availability !== 'ready' || (!p.made_to_order && inStock(p))) &&
      (f.availability !== 'made-to-order' || !!p.made_to_order) &&
      (!q ||
        `${p.name} ${p.vendor?.name ?? ''} ${p.description ?? ''}`
          .toLowerCase()
          .includes(q)),
  );
  if (sort === 'newest')
    out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (sort === 'price-asc') out.sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') out.sort((a, b) => b.price - a.price);
  return out;
}
