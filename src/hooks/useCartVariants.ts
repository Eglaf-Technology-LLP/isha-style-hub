import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mapDbVariant, type ProductVariant } from "@/hooks/useProducts";
import { sortSizes } from "@/components/storefront/listing/useListing";
import type { CartItem, VariantChange } from "@/stores/cartStore";
import { customisationPrice, rechargeAt } from "@/lib/customisation";
import { NO_SOLD_OUT_SETUP, readSoldOutSetup, soldOutTermsFor, takesSoldOutOrders, type SoldOutSetup } from "@/lib/soldOutMadeToOrder";

// Every variant of the products in the cart, by product id - for changing a
// line's size in the cart (client corrections, 15 Nov 2026, 2.8.2 b).
export function useCartVariants(productIds: string[], enabled: boolean) {
  const key = [...new Set(productIds)].sort().join(",");
  return useQuery({
    queryKey: ["cart-variants", key],
    enabled: enabled && key.length > 0,
    // Stock moves; re-read each time the cart opens after half a minute.
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, ProductVariant[]>> => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, product_id, name, price, product_value, sku, stock, options, image_url, images")
        .in("product_id", key.split(","));
      if (error) throw error;
      const byProduct = new Map<string, ProductVariant[]>();
      for (const row of data ?? []) {
        const list = byProduct.get(row.product_id) ?? [];
        list.push(mapDbVariant(row));
        byProduct.set(row.product_id, list);
      }
      return byProduct;
    },
  });
}

// Each cart product's "When a size sells out" set-up, by product id - a
// sold-out size of a product made to order can still be picked in the cart.
export function useCartSoldOutSetups(productIds: string[], enabled: boolean) {
  const key = [...new Set(productIds)].sort().join(",");
  return useQuery({
    queryKey: ["cart-sold-out-setups", key],
    enabled: enabled && key.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, SoldOutSetup>> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, made_to_order, sold_out_action, sold_out_extra_amount, sold_out_extra_pct, sold_out_extra_days")
        .in("id", key.split(","));
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.id, readSoldOutSetup(p)]));
    },
  });
}

const sizeOf = (v: ProductVariant) => v.options?.size || v.options?.Size || null;
const colourOf = (v: ProductVariant) => v.options?.color || v.options?.Color || null;
const isSizeOption = (name: string) => name.toLowerCase() === "size";
const isColourOption = (name: string) => ["color", "colour"].includes(name.toLowerCase());

export const lineSize = (item: CartItem) => item.selectedOptions.find((o) => isSizeOption(o.name))?.value ?? null;
const lineColour = (item: CartItem) => item.selectedOptions.find((o) => isColourOption(o.name))?.value ?? null;

export interface SizeChoice {
  size: string;
  variant: ProductVariant;
  // No stock in this size.
  soldOut: boolean;
  // ...but the boutique makes it to order (extra charge and days).
  madeToOrder: boolean;
}

// The sizes a cart line can switch to: every size of the same piece in the
// same colour, in size order. null when there's nothing to choose (one size,
// or a piece without real variants).
export function sizeChoices(
  item: CartItem,
  variants: ProductVariant[] | undefined,
  setup: SoldOutSetup = NO_SOLD_OUT_SETUP,
): SizeChoice[] | null {
  if (!variants?.length || !lineSize(item)) return null;
  const colour = lineColour(item);
  const bySize = new Map<string, ProductVariant>();
  for (const v of variants) {
    const size = sizeOf(v);
    if (size && (colourOf(v) ?? null) === colour && !bySize.has(size)) bySize.set(size, v);
  }
  if (bySize.size < 2) return null;
  return sortSizes([...bySize.keys()]).map((size) => {
    const variant = bySize.get(size)!;
    const soldOut = (variant.stock ?? 0) <= 0;
    return { size, variant, soldOut, madeToOrder: soldOut && takesSoldOutOrders(setup) };
  });
}

// The line as the chosen size: that variant's id and price (a customised
// line keeps its customisation charge on top, a sold-out size made to order
// takes its extra charge), its own photo when it has one, and the size in
// the line's options and title.
export function lineAsSize(item: CartItem, choice: SizeChoice, setup: SoldOutSetup = NO_SOLD_OUT_SETUP): VariantChange {
  const oldAmount = Number(item.price.amount);
  const oldBase = item.basePrice != null ? Number(item.basePrice) : oldAmount;
  const extra = oldAmount - oldBase - (item.soldOutTerms?.extra ?? 0);
  // A variant without its own price costs what the product does - the
  // line's current base price (useSyncCartPrices corrects it if not).
  const base = choice.variant.price || oldBase;
  // A % customisation charge is worked out again on the new size's price.
  const customisation = item.customisation ? rechargeAt(item.customisation, base) : null;
  const charge = customisation?.pct ? customisationPrice(customisation) : extra;
  const soldOutTerms = choice.madeToOrder ? soldOutTermsFor(setup, base) : null;
  const selectedOptions = item.selectedOptions.map((o) => (isSizeOption(o.name) ? { ...o, value: choice.size } : o));
  return {
    variantId: choice.variant.id,
    variantTitle: [choice.size, lineColour(item)].filter(Boolean).join(" / "),
    selectedOptions,
    price: { ...item.price, amount: String(Math.round((base + charge + (soldOutTerms?.extra ?? 0)) * 100) / 100) },
    productImage: choice.variant.images?.[0] ?? item.productImage,
    ...(item.basePrice != null || soldOutTerms ? { basePrice: String(base) } : {}),
    ...(customisation ? { customisation } : {}),
    soldOutTerms,
  };
}
