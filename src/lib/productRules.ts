import type { ProductVariant } from "@/hooks/useProducts";

// Net Quantity on the product page is a legal declaration (Part 8, 27):
// only a number followed by N, Set or Pair - "1 N", "2 Set", "1 Pair".
const NET_QTY_RE = /^\s*(\d+)\s*(n|nos?|pcs?|pieces?|sets?|pairs?)\s*\.?\s*$/i;

export function parseNetQuantity(raw: string): { value: string; count: number } | null {
  const m = raw.match(NET_QTY_RE);
  if (!m) return null;
  const count = Number(m[1]);
  if (count < 1) return null;
  const unit = /^s/i.test(m[2]) ? "Set" : /^pa/i.test(m[2]) ? "Pair" : "N";
  return { value: `${count} ${unit}`, count };
}

export const NET_QTY_WARN_ABOVE = 10;

// Before saving a product (Part 8, 1/26): Ready to Ship needs every
// variant's stock typed in and at least one piece; Made to order may be 0.
// Returns the variants with any untyped stock set to 0, or the problem.
export function checkStock(
  variants: ProductVariant[],
  productStock: string,
  madeToOrder: boolean,
): { variants: ProductVariant[]; stock: number } | { error: string } {
  if (variants.length > 0) {
    const untyped = variants.filter((v) => Number.isNaN(v.stock));
    if (untyped.length && !madeToOrder) {
      return {
        error:
          untyped.length === 1
            ? `Enter the stock for ${untyped[0].name}`
            : `Enter the stock for all ${untyped.length} variants without one`,
      };
    }
    const filled = variants.map((v) => (Number.isNaN(v.stock) ? { ...v, stock: 0 } : v));
    if (!madeToOrder && !filled.some((v) => v.stock > 0)) {
      return { error: "Ready to Ship needs at least 1 piece in stock - or switch on Made to order" };
    }
    return { variants: filled, stock: filled.reduce((sum, v) => sum + v.stock, 0) };
  }
  if (productStock.trim() === "") {
    if (!madeToOrder) return { error: "Enter how many pieces you have ready (Stock)" };
    return { variants, stock: 0 };
  }
  const stock = Math.floor(Number(productStock));
  if (!Number.isFinite(stock) || stock < 0) return { error: "Stock must be 0 or more" };
  if (!madeToOrder && stock < 1) {
    return { error: "Ready to Ship needs at least 1 piece in stock - or switch on Made to order" };
  }
  return { variants, stock };
}
