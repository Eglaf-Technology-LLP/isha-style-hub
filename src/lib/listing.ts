import { colorOf, inStock, onSale, Product, sizeOf } from './catalog';

// Listing filters and sorting - the website's useListing.ts (Live-Vendor),
// same rules and the same link parameters:
// ?search= &sort= &min= &max= &cat= &boutique= &size= &color= &availability= &stock=1 &sale=1

export type SortKey =
  | 'featured'
  | 'newest'
  | 'price-asc'
  | 'price-desc'
  | 'discount';
export type Availability = 'all' | 'ready' | 'made-to-order';

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
  featured: 'Featured',
  newest: 'New arrivals',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  discount: 'Biggest discount',
};

// The website's budget buckets (src/content/storefront.ts BUDGETS).
export const BUDGETS: {
  label: string;
  note: string;
  min?: number;
  max?: number;
}[] = [
  { label: 'Under ₹1,999', note: 'Everyday finds', max: 1999 },
  {
    label: '₹2,000 – ₹4,999',
    note: 'Festive favourites',
    min: 2000,
    max: 4999,
  },
  { label: '₹5,000 – ₹9,999', note: 'Occasion wear', min: 5000, max: 9999 },
  { label: '₹10,000 & above', note: 'Luxe & bridal', min: 10000 },
];

export const budgetHref = (b: { min?: number; max?: number }) =>
  `/category/all?${[b.min ? `min=${b.min}` : '', b.max ? `max=${b.max}` : '']
    .filter(Boolean)
    .join('&')}`;

const SIZE_ORDER = [
  'XXS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  '2XL',
  '3XL',
  'XXXL',
  '4XL',
  '5XL',
  'FREE SIZE',
];
export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a.toUpperCase());
    const ib = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ia !== -1 || ib !== -1)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

const list = (v?: string) => (v ? v.split(',').filter(Boolean) : []);
const num = (v?: string) => (v && !isNaN(Number(v)) ? Number(v) : null);

export function readFilters(
  params: Record<string, string | undefined>,
): ListingFilters {
  const sort = params.sort as SortKey | undefined;
  const availability = params.availability;
  return {
    search: params.search ?? params.q ?? '',
    sort: sort && sort in SORT_LABELS ? sort : 'featured',
    min: num(params.min),
    max: num(params.max),
    categories: list(params.cat),
    boutiques: list(params.boutique),
    sizes: list(params.size),
    colors: list(params.color),
    availability:
      availability === 'ready' || availability === 'made-to-order'
        ? availability
        : 'all',
    inStock: params.stock === '1',
    sale: params.sale === '1',
  };
}

export const emptyFilters = (
  keep: Partial<ListingFilters> = {},
): ListingFilters => ({
  ...readFilters({}),
  ...keep,
});

type Facet =
  | 'categories'
  | 'boutiques'
  | 'sizes'
  | 'colors'
  | 'price'
  | 'availability'
  | 'inStock'
  | 'sale';

// Every filter except `skip` (so a facet's counts show what picking one of
// its options would give).
function applyFilters(
  products: Product[],
  f: ListingFilters,
  scopeCategoryId: string | null,
  skip?: Facet,
) {
  const q = f.search.trim().toLowerCase();
  return products.filter(p => {
    if (q) {
      const hay = `${p.name} ${p.description ?? ''} ${
        p.vendor?.name ?? ''
      }`.toLowerCase();
      if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
    }
    if (skip !== 'categories') {
      // On a category page its own category is always in; ticking others adds them.
      const allowed = new Set([
        ...(scopeCategoryId ? [scopeCategoryId] : []),
        ...f.categories,
      ]);
      if (allowed.size > 0 && !(p.category_id && allowed.has(p.category_id)))
        return false;
    }
    if (
      skip !== 'boutiques' &&
      f.boutiques.length &&
      !(p.vendor_id && f.boutiques.includes(p.vendor_id))
    )
      return false;
    if (skip !== 'price') {
      if (f.min != null && p.price < f.min) return false;
      if (f.max != null && p.price > f.max) return false;
    }
    if (
      skip !== 'sizes' &&
      f.sizes.length &&
      !p.variants.some(v => f.sizes.includes(sizeOf(v) ?? ''))
    )
      return false;
    if (
      skip !== 'colors' &&
      f.colors.length &&
      !p.variants.some(v => f.colors.includes(colorOf(v) ?? ''))
    )
      return false;
    if (skip !== 'availability') {
      if (f.availability === 'ready' && p.made_to_order) return false;
      if (f.availability === 'made-to-order' && !p.made_to_order) return false;
    }
    if (skip !== 'inStock' && f.inStock && !inStock(p)) return false;
    if (skip !== 'sale' && f.sale && !onSale(p)) return false;
    return true;
  });
}

function sortProducts(products: Product[], sort: SortKey): Product[] {
  const arr = [...products];
  const discount = (p: Product) =>
    onSale(p) ? (p.compare_at_price! - p.price) / p.compare_at_price! : 0;
  switch (sort) {
    case 'newest':
      return arr.sort(
        (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
      );
    case 'price-asc':
      return arr.sort((a, b) => a.price - b.price);
    case 'price-desc':
      return arr.sort((a, b) => b.price - a.price);
    case 'discount':
      return arr.sort((a, b) => discount(b) - discount(a));
    default:
      // Featured: available pieces with photos first, then newest.
      return arr.sort(
        (a, b) =>
          Number(inStock(b)) - Number(inStock(a)) ||
          Number(!!b.images[0]) - Number(!!a.images[0]) ||
          +new Date(b.created_at) - +new Date(a.created_at),
      );
  }
}

const countBy = <T>(products: Product[], keys: (p: Product) => T[]) => {
  const m = new Map<T, number>();
  for (const p of products)
    for (const k of new Set(keys(p))) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};

export function runListing(
  products: Product[],
  filters: ListingFilters,
  scopeCategoryId: string | null,
) {
  const results = sortProducts(
    applyFilters(products, filters, scopeCategoryId),
    filters.sort,
  );
  const without = (f: Facet) =>
    applyFilters(products, filters, scopeCategoryId, f);
  const facets = {
    categories: countBy(without('categories'), p =>
      p.category_id ? [p.category_id] : [],
    ),
    boutiques: countBy(without('boutiques'), p =>
      p.vendor_id ? [p.vendor_id] : [],
    ),
    sizes: countBy(without('sizes'), p =>
      p.variants.map(sizeOf).filter((s): s is string => !!s),
    ),
    colors: countBy(without('colors'), p =>
      p.variants.map(colorOf).filter((c): c is string => !!c),
    ),
    ready: without('availability').filter(p => !p.made_to_order).length,
    madeToOrder: without('availability').filter(p => p.made_to_order).length,
    inStock: without('inStock').filter(inStock).length,
    sale: without('sale').filter(onSale).length,
  };
  const activeCount =
    filters.categories.length +
    filters.boutiques.length +
    filters.sizes.length +
    filters.colors.length +
    (filters.min != null || filters.max != null ? 1 : 0) +
    (filters.availability !== 'all' ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.sale ? 1 : 0);
  return { results, facets, activeCount };
}
