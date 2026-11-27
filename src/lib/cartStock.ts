import { cartLineKey, type CartItem } from "@/stores/cartStore";
import { readSoldOutSetup, takesSoldOutOrders, type ProductSoldOutFields } from "@/lib/soldOutMadeToOrder";

// Sold-out pieces in a cart or a checkout (client, 28 Nov 2026): a Ready to
// Ship line without enough stock, whose boutique doesn't make the size to
// order, can't be bought - the order is refused when checkout takes the
// stock (adjust_stock; order_item_sold_out_made_to_order lets only a
// made-to-order product through). So the cart's Checkout and checkout's Pay
// stay off until the line is removed or lowered.

// Today's stock, as read for the lines: each product's own and each real
// variant's (only on its own product, as the server looks it up).
export interface StockSnapshot {
  products: Record<string, { stock: number; madeToOrder: boolean; takesSoldOutOrders: boolean }>;
  variants: Record<string, number>;
}

export function stockSnapshot(
  products: (ProductSoldOutFields & { id: string; stock_quantity?: number | null })[],
  variants: { id: string; product_id: string; stock: number | null }[],
): StockSnapshot {
  const ids = new Set(products.map((p) => p.id));
  return {
    products: Object.fromEntries(
      products.map((p) => [
        p.id,
        {
          stock: Number(p.stock_quantity ?? 0),
          madeToOrder: !!p.made_to_order,
          takesSoldOutOrders: takesSoldOutOrders(readSoldOutSetup(p)),
        },
      ]),
    ),
    variants: Object.fromEntries(variants.filter((v) => ids.has(v.product_id)).map((v) => [v.id, Number(v.stock ?? 0)])),
  };
}

// The lines that can't be bought, by cart line key, with the pieces left.
// Lines of the same size share its stock, taken in cart order.
export function shortStockLines(items: CartItem[], stock: StockSnapshot | null): Record<string, number> {
  const short: Record<string, number> = {};
  if (!stock) return short;
  const left: Record<string, number> = {};
  for (const item of items) {
    const product = stock.products[item.productId];
    if (!product || product.madeToOrder || product.takesSoldOutOrders) continue;
    const fromVariant = item.variantId in stock.variants;
    const key = fromVariant ? `v:${item.variantId}` : `p:${item.productId}`;
    const have = left[key] ?? (fromVariant ? stock.variants[item.variantId] : product.stock);
    if (have < item.quantity) {
      short[cartLineKey(item)] = Math.max(0, have);
      left[key] = have;
    } else {
      left[key] = have - item.quantity;
    }
  }
  return short;
}

// Said beside a Checkout / Pay button kept off; null when nothing is short.
// `goal` ends it ("check out", "place your order"); `canRemove` is false on
// Buy Now, where the one piece can only be lowered.
export function shortStockNote(
  items: CartItem[],
  short: Record<string, number>,
  { goal, canRemove = true }: { goal: string; canRemove?: boolean },
): string | null {
  const lines = items.filter((i) => cartLineKey(i) in short);
  if (lines.length === 0) return null;
  if (lines.length > 1) {
    return `${lines.length} pieces in your cart are sold out or short of stock - remove them or lower the quantity to ${goal}.`;
  }
  const name = lines[0].productName;
  const left = short[cartLineKey(lines[0])];
  if (left > 0) return `Only ${left} of "${name}" left - lower the quantity to ${goal}.`;
  return canRemove ? `"${name}" is sold out - remove it to ${goal}.` : `"${name}" is sold out, so it can't be ordered now.`;
}
