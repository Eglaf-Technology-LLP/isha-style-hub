import { supabase } from "@/integrations/supabase/client";

// A no-variant cart item's order_items.variant_id is a synthetic sentinel
// (e.g. "<productId>-default", see Checkout.tsx's own UUID_RE guard before
// its adjust_stock call) rather than a real product_variants.id - must be
// filtered out before joining, or the query just returns nothing useful.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrderItemForImage {
  id: string;
  product_id: string;
  variant_id: string;
}

// Resolves one thumbnail per order item: the specific variant's own photo
// first, falling back to the product's main image. Batches both lookups
// across every item passed in (one query each, not one per item).
export async function resolveOrderItemImages(
  items: OrderItemForImage[],
): Promise<Map<string, string | null>> {
  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
  const variantIds = [...new Set(items.map((i) => i.variant_id).filter((id) => id && UUID_RE.test(id)))];

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length
      ? supabase.from("products").select("id, images").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; images: string[] | null }[] }),
    variantIds.length
      ? supabase.from("product_variants").select("id, image_url").in("id", variantIds)
      : Promise.resolve({ data: [] as { id: string; image_url: string | null }[] }),
  ]);

  const productImageById = new Map((products ?? []).map((p) => [p.id, p.images?.[0] ?? null]));
  const variantImageById = new Map((variants ?? []).map((v) => [v.id, v.image_url]));

  const result = new Map<string, string | null>();
  for (const item of items) {
    const variantImage = UUID_RE.test(item.variant_id) ? variantImageById.get(item.variant_id) : null;
    result.set(item.id, variantImage || productImageById.get(item.product_id) || null);
  }
  return result;
}
