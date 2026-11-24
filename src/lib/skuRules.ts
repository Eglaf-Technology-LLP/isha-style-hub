import { supabase } from "@/integrations/supabase/client";

// SKU rules for a product and its sizes/colours (user, 24 Nov 2026): every
// variant needs a SKU, and no code may repeat within a boutique - not
// between products, not between variants, not between a product and a
// variant (its own included). Case and surrounding spaces don't matter.
// The database enforces the same (20261124190000_variant_sku_required.sql);
// these checks only give the boutique a clear message before saving.

type VariantLike = { name: string; sku?: string | null; options?: Record<string, string> | null };

const norm = (sku: string | null | undefined) => (sku ?? "").trim().toLowerCase();

const variantLabel = (v: VariantLike) =>
  [v.options?.size || v.options?.Size, v.options?.color || v.options?.Color].filter(Boolean).join(" / ") || v.name;

// What's wrong inside the form itself, or null.
export function variantSkuProblem(productSku: string, variants: VariantLike[]): string | null {
  const missing = variants.filter((v) => !norm(v.sku));
  if (missing.length > 0) {
    const names = missing.slice(0, 3).map(variantLabel).join(", ");
    return `Enter the SKU for every size and colour - ${names}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""} ${
      missing.length === 1 ? "has" : "have"
    } none`;
  }
  const seen = new Map<string, VariantLike>();
  for (const v of variants) {
    const code = norm(v.sku);
    if (code === norm(productSku)) {
      return `SKU ${v.sku!.trim()} (${variantLabel(v)}) is the product's own SKU - give each size and colour its own SKU`;
    }
    const first = seen.get(code);
    if (first) {
      return `SKU ${v.sku!.trim()} is used for both ${variantLabel(first)} and ${variantLabel(v)} - every size and colour needs its own SKU`;
    }
    seen.set(code, v);
  }
  return null;
}

// The first code (the product's or a variant's) that another product of the
// boutique, or one of its sizes/colours, already uses - as a message - or null.
export async function boutiqueSkuClash(
  vendorId: string,
  productId: string | null | undefined,
  productSku: string,
  variantSkus: string[],
): Promise<string | null> {
  const codes = [productSku, ...variantSkus].map((c) => c.trim()).filter(Boolean);
  const wanted = new Set(codes.map((c) => c.toLowerCase()));
  if (wanted.size === 0) return null;

  const others = productId ?? "00000000-0000-0000-0000-000000000000";
  const [{ data: products, error: pErr }, { data: variants, error: vErr }] = await Promise.all([
    supabase.from("products").select("id, name, sku").eq("vendor_id", vendorId).neq("id", others),
    supabase
      .from("product_variants")
      .select("sku, product_id, products!inner(name, vendor_id)")
      .eq("products.vendor_id", vendorId)
      .neq("product_id", others),
  ]);
  // A failed lookup isn't a clash: the database still refuses a repeat.
  if (pErr || vErr) return null;

  for (const code of codes) {
    const key = code.toLowerCase();
    const product = (products ?? []).find((p) => norm(p.sku) === key);
    if (product) return `SKU ${code} is already used by "${product.name}" - every product, size and colour needs its own SKU`;
    const variant = (variants ?? []).find((v) => norm(v.sku) === key) as
      | { products: { name: string } | null }
      | undefined;
    if (variant)
      return `SKU ${code} is already used by a size or colour of "${variant.products?.name ?? "another product"}" - every product, size and colour needs its own SKU`;
  }
  return null;
}
