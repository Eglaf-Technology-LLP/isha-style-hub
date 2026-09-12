import { ProductVariant } from "@/hooks/useProducts";

interface SearchableProduct {
  name: string;
  sku?: string | null;
  variants?: ProductVariant[];
}

// Product search previously only matched the parent product's own name/SKU,
// so searching a variant-level SKU (or a size/color that only exists on a
// variant, not the product name) found nothing - even though vendors and
// admins print and scan variant SKUs, not product-level ones, when
// fulfilling orders.
export function productMatchesQuery(product: SearchableProduct, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (product.name.toLowerCase().includes(q)) return true;
  if ((product.sku || "").toLowerCase().includes(q)) return true;
  return (product.variants || []).some((v) => {
    if ((v.sku || "").toLowerCase().includes(q)) return true;
    return Object.values(v.options || {}).some((value) => value.toLowerCase().includes(q));
  });
}
