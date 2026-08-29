import { supabase } from "@/integrations/supabase/client";

// order_items.variant_id can be a synthetic sentinel (see Checkout.tsx's own
// guard before its adjust_stock call) rather than a real product_variants.id
// for a no-variant line item - same check used throughout this codebase.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReorderSourceItem {
  id: string;
  product_id: string;
  variant_id: string;
  product_title: string;
  variant_title: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  price: number;
  vendor_id: string | null;
  image: string | null;
}

export type ReorderAvailability = "available" | "out_of_stock" | "unavailable";

export interface ReorderCheckResult {
  sourceItem: ReorderSourceItem;
  // "unavailable" - the product (or that specific variant) no longer
  // resolves at all, whether hard-deleted or delisted; RLS makes those two
  // cases indistinguishable to a plain customer query, so both read the same.
  // "out_of_stock" - it still exists, but has zero stock right now.
  // "available" - at least 1 can be added.
  availability: ReorderAvailability;
  currentPrice: number | null;
  priceChanged: boolean;
  requestedQuantity: number;
  // Capped to current stock; 0 unless availability is "available".
  availableQuantity: number;
}

// Given a past order's items, re-checks every product/variant's CURRENT
// price and stock in one batched pass (mirrors resolveOrderItemImages'
// shape) so a "Reorder" action never silently adds something at a stale
// price or a quantity that's no longer in stock.
export async function checkReorderAvailability(
  items: ReorderSourceItem[],
): Promise<ReorderCheckResult[]> {
  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
  const variantIds = [...new Set(items.map((i) => i.variant_id).filter((id) => id && UUID_RE.test(id)))];

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length
      ? supabase.from("products").select("id, price, stock_quantity").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; price: number; stock_quantity: number }[] }),
    variantIds.length
      ? supabase.from("product_variants").select("id, price, stock").in("id", variantIds)
      : Promise.resolve({ data: [] as { id: string; price: number | null; stock: number }[] }),
  ]);

  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));

  return items.map((sourceItem) => {
    const product = productById.get(sourceItem.product_id);
    const hadRealVariant = UUID_RE.test(sourceItem.variant_id);
    const variant = hadRealVariant ? variantById.get(sourceItem.variant_id) : undefined;

    if (!product || (hadRealVariant && !variant)) {
      return {
        sourceItem,
        availability: "unavailable",
        currentPrice: null,
        priceChanged: false,
        requestedQuantity: sourceItem.quantity,
        availableQuantity: 0,
      };
    }

    // Same fallback ProductDetail.tsx uses: a variant price of 0 is treated
    // as "no override," not a real free price.
    const currentPrice = Number(variant?.price || product.price);
    const currentStock = variant ? variant.stock : product.stock_quantity;
    const priceChanged = currentPrice !== Number(sourceItem.price);

    if (currentStock <= 0) {
      return {
        sourceItem,
        availability: "out_of_stock",
        currentPrice,
        priceChanged,
        requestedQuantity: sourceItem.quantity,
        availableQuantity: 0,
      };
    }

    return {
      sourceItem,
      availability: "available",
      currentPrice,
      priceChanged,
      requestedQuantity: sourceItem.quantity,
      availableQuantity: Math.min(sourceItem.quantity, currentStock),
    };
  });
}
