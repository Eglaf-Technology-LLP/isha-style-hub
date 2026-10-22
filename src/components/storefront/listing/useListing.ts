import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { colorOf, inStock, sizeOf, StoreProduct } from "@/hooks/useStorefront";

// Listing filters, kept in the URL so a filtered page can be shared/bookmarked:
// ?search= &sort= &min= &max= &cat= &boutique= &size= &color= &availability= &stock=1 &sale=1

export type SortKey = "featured" | "newest" | "price-asc" | "price-desc" | "discount";
export type Availability = "all" | "ready" | "made-to-order";

export interface ListingFilters {
  search: string;
  sort: SortKey;
  min: number | null;
  max: number | null;
  categories: string[];
  boutiques: string[];
  sizes: string[];
  colors: string[];
  availability: Availability;
  inStock: boolean;
  sale: boolean;
}

export const SORT_LABELS: Record<SortKey, string> = {
  featured: "Featured",
  newest: "New arrivals",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  discount: "Biggest discount",
};

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "XXXL", "4XL", "5XL", "FREE SIZE"];

export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a.toUpperCase());
    const ib = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);
const num = (v: string | null) => (v && !isNaN(Number(v)) ? Number(v) : null);

function readFilters(params: URLSearchParams): ListingFilters {
  const sort = params.get("sort") as SortKey | null;
  const availability = params.get("availability") as Availability | null;
  return {
    search: params.get("search") ?? params.get("q") ?? "",
    sort: sort && sort in SORT_LABELS ? sort : "featured",
    min: num(params.get("min")),
    max: num(params.get("max")),
    categories: list(params.get("cat")),
    boutiques: list(params.get("boutique")),
    sizes: list(params.get("size")),
    colors: list(params.get("color")),
    availability: availability === "ready" || availability === "made-to-order" ? availability : "all",
    inStock: params.get("stock") === "1",
    sale: params.get("sale") === "1",
  };
}

function writeFilters(f: ListingFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search) p.set("search", f.search);
  if (f.sort !== "featured") p.set("sort", f.sort);
  if (f.min != null) p.set("min", String(f.min));
  if (f.max != null) p.set("max", String(f.max));
  if (f.categories.length) p.set("cat", f.categories.join(","));
  if (f.boutiques.length) p.set("boutique", f.boutiques.join(","));
  if (f.sizes.length) p.set("size", f.sizes.join(","));
  if (f.colors.length) p.set("color", f.colors.join(","));
  if (f.availability !== "all") p.set("availability", f.availability);
  if (f.inStock) p.set("stock", "1");
  if (f.sale) p.set("sale", "1");
  return p;
}

type Facet = "categories" | "boutiques" | "sizes" | "colors" | "price" | "availability" | "inStock" | "sale";

const onSale = (p: StoreProduct) => !!p.compare_at_price && p.compare_at_price > p.price;

// Apply every filter except `skip` (so a facet's counts show what picking
// one of its options would give).
function applyFilters(
  products: StoreProduct[],
  f: ListingFilters,
  scopeCategoryId: string | null,
  skip?: Facet,
): StoreProduct[] {
  const q = f.search.trim().toLowerCase();
  return products.filter((p) => {
    if (q) {
      const hay = `${p.name} ${p.description ?? ""} ${p.vendor?.name ?? ""}`.toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    if (skip !== "categories") {
      // On a category page the page's own category is always in; ticking
      // others adds them (never narrows to nothing).
      const allowed = new Set([...(scopeCategoryId ? [scopeCategoryId] : []), ...f.categories]);
      if (allowed.size > 0 && !(p.category_id && allowed.has(p.category_id))) return false;
    }
    if (skip !== "boutiques" && f.boutiques.length && !(p.vendor_id && f.boutiques.includes(p.vendor_id))) return false;
    if (skip !== "price") {
      if (f.min != null && p.price < f.min) return false;
      if (f.max != null && p.price > f.max) return false;
    }
    if (skip !== "sizes" && f.sizes.length && !(p.variants || []).some((v) => f.sizes.includes(sizeOf(v) ?? ""))) return false;
    if (skip !== "colors" && f.colors.length && !(p.variants || []).some((v) => f.colors.includes(colorOf(v) ?? ""))) return false;
    if (skip !== "availability") {
      if (f.availability === "ready" && p.made_to_order) return false;
      if (f.availability === "made-to-order" && !p.made_to_order) return false;
    }
    if (skip !== "inStock" && f.inStock && !inStock(p)) return false;
    if (skip !== "sale" && f.sale && !onSale(p)) return false;
    return true;
  });
}

function sortProducts(products: StoreProduct[], sort: SortKey): StoreProduct[] {
  const arr = [...products];
  const discount = (p: StoreProduct) => (onSale(p) ? (p.compare_at_price! - p.price) / p.compare_at_price! : 0);
  switch (sort) {
    case "newest":
      return arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    case "price-asc":
      return arr.sort((a, b) => a.price - b.price);
    case "price-desc":
      return arr.sort((a, b) => b.price - a.price);
    case "discount":
      return arr.sort((a, b) => discount(b) - discount(a));
    default:
      // Featured: available pieces with photos first, then newest.
      return arr.sort(
        (a, b) =>
          Number(inStock(b)) - Number(inStock(a)) ||
          Number(!!b.images?.[0]) - Number(!!a.images?.[0]) ||
          +new Date(b.created_at) - +new Date(a.created_at),
      );
  }
}

const countBy = <T,>(products: StoreProduct[], keys: (p: StoreProduct) => T[]) => {
  const m = new Map<T, number>();
  for (const p of products) for (const k of new Set(keys(p))) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};

export function useListing(products: StoreProduct[], scopeCategoryId: string | null) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);

  const setFilters = useCallback(
    (next: Partial<ListingFilters>) => setParams(writeFilters({ ...readFilters(params), ...next }), { replace: true }),
    [params, setParams],
  );
  const toggle = useCallback(
    (key: "categories" | "boutiques" | "sizes" | "colors", value: string) => {
      const cur = readFilters(params)[key];
      setFilters({ [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
    },
    [params, setFilters],
  );
  const clearAll = useCallback(
    () => setParams(writeFilters({ ...readFilters(new URLSearchParams()), search: filters.search, sort: filters.sort }), { replace: true }),
    [setParams, filters.search, filters.sort],
  );

  const results = useMemo(
    () => sortProducts(applyFilters(products, filters, scopeCategoryId), filters.sort),
    [products, filters, scopeCategoryId],
  );

  const facets = useMemo(() => {
    const without = (f: Facet) => applyFilters(products, filters, scopeCategoryId, f);
    const prices = products.map((p) => p.price);
    return {
      categories: countBy(without("categories"), (p) => (p.category_id ? [p.category_id] : [])),
      boutiques: countBy(without("boutiques"), (p) => (p.vendor_id ? [p.vendor_id] : [])),
      sizes: countBy(without("sizes"), (p) => (p.variants || []).map(sizeOf).filter((s): s is string => !!s)),
      colors: countBy(without("colors"), (p) => (p.variants || []).map(colorOf).filter((c): c is string => !!c)),
      ready: without("availability").filter((p) => !p.made_to_order).length,
      madeToOrder: without("availability").filter((p) => p.made_to_order).length,
      inStock: without("inStock").filter(inStock).length,
      sale: without("sale").filter(onSale).length,
      priceMin: prices.length ? Math.min(...prices) : 0,
      priceMax: prices.length ? Math.max(...prices) : 0,
    };
  }, [products, filters, scopeCategoryId]);

  const activeCount =
    filters.categories.length +
    filters.boutiques.length +
    filters.sizes.length +
    filters.colors.length +
    (filters.min != null || filters.max != null ? 1 : 0) +
    (filters.availability !== "all" ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.sale ? 1 : 0);

  return { filters, setFilters, toggle, clearAll, results, facets, activeCount };
}
