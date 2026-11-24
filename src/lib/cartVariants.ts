import { useQuery } from '@tanstack/react-query';
import { customisationPrice, rechargeAt } from './customisation';
import { sortSizes } from './listing';
import {
  NO_SOLD_OUT_SETUP,
  readSoldOutSetup,
  SoldOutSetup,
  soldOutTermsFor,
  takesSoldOutOrders,
} from './soldOutMadeToOrder';
import { CartItem, VariantChange } from './stores';
import { supabase } from './supabase';

// Changing a bag line's size (client corrections, 15 Nov 2026, 2.8.2 b) -
// the website's src/hooks/useCartVariants.ts. Also each piece's SKU, for the
// bag line, and its "When a size sells out" set-up (the website's
// useCartSoldOutSetups): a sold-out size of a product made to order can
// still be picked in the bag.

export interface CartVariant {
  id: string;
  price: number;
  stock: number;
  options: Record<string, string>;
  images: string[];
}

const variantImages = (v: {
  image_url?: string | null;
  images?: string[] | null;
}) => (v.images?.length ? v.images : v.image_url ? [v.image_url] : []);

// Every variant of the pieces in the bag (by product id), each piece's SKU
// and its sold-out set-up. Stock moves, so it is read again after half a
// minute.
export function useCartVariants(productIds: string[]) {
  const key = [...new Set(productIds)].sort().join(',');
  return useQuery({
    queryKey: ['cart-variants', key],
    enabled: key.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const ids = key.split(',');
      const variantsQuery = (columns: string) =>
        supabase.from('product_variants').select(columns).in('product_id', ids);
      const [first, products] = await Promise.all([
        variantsQuery(
          'id, product_id, price, stock, options, image_url, images',
        ),
        supabase
          .from('products')
          .select(
            'id, sku, made_to_order, sold_out_action, sold_out_extra_amount, sold_out_extra_pct, sold_out_extra_days',
          )
          .in('id', ids),
      ]);
      // The images column is newer; without it, the one photo.
      const rows = first.error
        ? await variantsQuery(
            'id, product_id, price, stock, options, image_url',
          )
        : first;
      const byProduct = new Map<string, CartVariant[]>();
      for (const r of (rows.data ?? []) as any[]) {
        const list = byProduct.get(r.product_id) ?? [];
        list.push({
          id: r.id,
          price: Number(r.price) || 0,
          stock: Number(r.stock) || 0,
          options: (r.options as Record<string, string>) || {},
          images: variantImages(r),
        });
        byProduct.set(r.product_id, list);
      }
      const productRows = (products.data ?? []) as {
        id: string;
        sku: string | null;
        made_to_order: boolean | null;
        sold_out_action: string | null;
        sold_out_extra_amount: number | null;
        sold_out_extra_pct: number | null;
        sold_out_extra_days: number | null;
      }[];
      const skus = new Map<string, string>(
        productRows.filter(p => !!p.sku).map(p => [p.id, p.sku as string]),
      );
      const soldOutSetups = new Map<string, SoldOutSetup>(
        productRows.map(p => [p.id, readSoldOutSetup(p)]),
      );
      return { variants: byProduct, skus, soldOutSetups };
    },
  });
}

const sizeOf = (v: CartVariant) => v.options?.size || v.options?.Size || null;
const colourOf = (v: CartVariant) =>
  v.options?.color || v.options?.Color || null;
const isSizeOption = (name: string) => name.toLowerCase() === 'size';
const isColourOption = (name: string) =>
  ['color', 'colour'].includes(name.toLowerCase());

export const lineSize = (item: CartItem) =>
  item.selectedOptions.find(o => isSizeOption(o.name))?.value ?? null;
const lineColour = (item: CartItem) =>
  item.selectedOptions.find(o => isColourOption(o.name))?.value ?? null;

export interface SizeChoice {
  size: string;
  variant: CartVariant;
  // No stock in this size.
  soldOut: boolean;
  // ...but the boutique makes it to order (extra charge and days).
  madeToOrder: boolean;
}

// The sizes a bag line can switch to: every size of the same piece in the
// same colour, in size order. null when there's nothing to choose (one
// size, or a piece without real variants).
export function sizeChoices(
  item: CartItem,
  variants: CartVariant[] | undefined,
  setup: SoldOutSetup = NO_SOLD_OUT_SETUP,
): SizeChoice[] | null {
  if (!variants?.length || !lineSize(item)) return null;
  const colour = lineColour(item);
  const bySize = new Map<string, CartVariant>();
  for (const v of variants) {
    const size = sizeOf(v);
    if (size && (colourOf(v) ?? null) === colour && !bySize.has(size))
      bySize.set(size, v);
  }
  if (bySize.size < 2) return null;
  return sortSizes([...bySize.keys()]).map(size => {
    const variant = bySize.get(size)!;
    const soldOut = variant.stock <= 0;
    return {
      size,
      variant,
      soldOut,
      madeToOrder: soldOut && takesSoldOutOrders(setup),
    };
  });
}

// The line as the chosen size: that variant's id and price (a variant
// without its own price costs what the line does now; a customised line
// keeps its customisation on top, a % charge worked out again on the new
// price; a sold-out size made to order takes its extra charge), its own
// photo when it has one, and the size in the line's options and title.
export function lineAsSize(
  item: CartItem,
  choice: SizeChoice,
  setup: SoldOutSetup = NO_SOLD_OUT_SETUP,
): VariantChange {
  const oldAmount = Number(item.price.amount);
  const oldBase = item.basePrice != null ? Number(item.basePrice) : oldAmount;
  const extra = oldAmount - oldBase - (item.soldOutTerms?.extra ?? 0);
  const base = choice.variant.price || oldBase;
  const customisation = item.customisation
    ? rechargeAt(item.customisation, base)
    : null;
  const charge = customisation?.pct ? customisationPrice(customisation) : extra;
  const soldOutTerms = choice.madeToOrder ? soldOutTermsFor(setup, base) : null;
  return {
    variantId: choice.variant.id,
    variantTitle: [choice.size, lineColour(item)].filter(Boolean).join(' / '),
    selectedOptions: item.selectedOptions.map(o =>
      isSizeOption(o.name) ? { ...o, value: choice.size } : o,
    ),
    price: {
      ...item.price,
      amount: String(
        Math.round((base + charge + (soldOutTerms?.extra ?? 0)) * 100) / 100,
      ),
    },
    productImage: choice.variant.images[0] ?? item.productImage,
    ...(item.basePrice != null || soldOutTerms
      ? { basePrice: String(base) }
      : {}),
    ...(customisation ? { customisation } : {}),
    soldOutTerms,
  };
}
