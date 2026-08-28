import { supabase } from "@/integrations/supabase/client";

export interface ExchangeVariantOption {
  id: string;
  size: string | null;
  color: string | null;
  stock: number;
}

// product_variants.options is a schema-less jsonb - every write path in
// this app uses lowercase {size, color} keys, but older rows may still
// carry capitalized Size/Color (same fallback ProductDetail.tsx's own
// size/color picker already applies).
function readOption(options: Record<string, string> | null, key: "size" | "color"): string | null {
  if (!options) return null;
  const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
  return options[key] ?? options[capitalized] ?? null;
}

// Live (not snapshotted) variants for a product, for the exchange target
// picker. Returns every variant (including zero-stock ones) rather than
// pre-filtering, so a caller can distinguish "this product has no
// size/color axis at all" (empty array) from "it has variants but
// nothing is in stock right now" (non-empty, all zero stock) - the two
// need different messaging, not the same blank picker.
export async function fetchExchangeableVariants(productId: string): Promise<ExchangeVariantOption[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, options, stock")
    .eq("product_id", productId);
  if (error) throw error;

  return (data ?? []).map((v) => ({
    id: v.id,
    size: readOption(v.options as Record<string, string> | null, "size"),
    color: readOption(v.options as Record<string, string> | null, "color"),
    stock: v.stock,
  }));
}
