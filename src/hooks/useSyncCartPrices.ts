import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cartLineKey, useCartStore, type CartItem, type LinePrice } from "@/stores/cartStore";
import { customisationPrice, rechargeAt } from "@/lib/customisation";
import { readSoldOutSetup, soldOutTermsFor, type SoldOutTerms } from "@/lib/soldOutMadeToOrder";
import { shortStockLines, stockSnapshot, type StockSnapshot } from "@/lib/cartStock";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sameTerms = (a: SoldOutTerms | null, b: SoldOutTerms | null) =>
  a === b || (!!a && !!b && a.extra === b.extra && a.days === b.days && (a.pct ?? null) === (b.pct ?? null));

const lineName = (i: CartItem) => {
  const size = i.selectedOptions.find((o) => o.name.toLowerCase() === "size")?.value;
  return `"${i.productName}"${size ? ` in size ${size}` : ""}`;
};

// A cart keeps the price each piece had when it was added. Prices can change
// since then - e.g. on 24-10-2026 every customer price gained GST (Product
// Value, Developer Corrections Part 7, 5.1) - so the cart and checkout pull
// today's price for each line and say so when one moved. A customised line
// keeps its customisation on top of the new base price - a % charge worked
// out again on it, an old ₹ one as it was.
//
// Stock moves too: a size that has sold out since it was added becomes made
// to order when its product takes sold-out orders (its extra charge and days
// on the line), and one back in stock goes back to a normal line - the
// customer is told either way, before checkout. The server applies the same
// rule when the order is placed (sold_out_made_to_order_trigger).
//
// A piece that is no longer for sale - deleted, switched off, not approved,
// its boutique not approved, or its size gone - leaves the cart with "1 item
// is no longer available and was removed." (client corrections Part 2,
// A23.3: a deleted product stayed in the cart with its old name, price and a
// blank photo). Shoppers can only read live products, so a line whose
// product doesn't come back is one of these.
//
// Returns the lines that can't be bought (sold out and not made to order -
// see lib/cartStock.ts), from the same stock read: the cart keeps Checkout
// off while there are any.
export function useSyncCartPrices(enabled = true): Record<string, number> {
  const items = useCartStore((s) => s.items);
  const setPrices = useCartStore((s) => s.setPrices);
  const removeItem = useCartStore((s) => s.removeItem);
  const [stockNow, setStockNow] = useState<StockSnapshot | null>(null);
  // Re-check when lines, their sizes or quantities change (a quantity above
  // the stock left makes a line made to order).
  const linesKey = items.map((i) => `${cartLineKey(i)}:${i.variantId}:${i.quantity}`).join(",");

  useEffect(() => {
    if (!enabled || items.length === 0) return;
    let alive = true;
    (async () => {
      const productIds = [...new Set(items.map((i) => i.productId))];
      const variantIds = [...new Set(items.map((i) => i.variantId).filter((id) => UUID_RE.test(id)))];
      const [{ data: products, error: productsError }, { data: variants, error: variantsError }] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id, price, stock_quantity, is_active, approval_status, made_to_order, sold_out_action, sold_out_extra_amount, sold_out_extra_pct, sold_out_extra_days",
          )
          .in("id", productIds),
        variantIds.length
          ? supabase.from("product_variants").select("id, product_id, price, stock").in("id", variantIds)
          : Promise.resolve({ data: [] as { id: string; product_id: string; price: number | null; stock: number }[], error: null }),
      ]);
      // Only a lookup that worked can say a piece is gone.
      if (!alive || !products || productsError || variantsError) return;
      setStockNow(stockSnapshot(products, variants ?? []));
      const productById = new Map(products.map((p) => [p.id, p]));
      const variantById = new Map((variants ?? []).map((v) => [v.id, v]));

      const unavailable = items.filter((item) => {
        const product = productById.get(item.productId);
        if (!product || product.is_active === false || product.approval_status !== "approved") return true;
        return UUID_RE.test(item.variantId) && !variantById.has(item.variantId);
      });
      if (unavailable.length) {
        unavailable.forEach((item) => removeItem(cartLineKey(item)));
        const n = unavailable.length;
        toast.info(`${n} ${n === 1 ? "item is" : "items are"} no longer available and ${n === 1 ? "was" : "were"} removed.`, {
          description: unavailable.map((i) => i.productName).join(", "),
          duration: 8000,
        });
        // The cart changed: this runs again for what's left.
        return;
      }

      const updates: Record<string, LinePrice> = {};
      let priceMoved = false;
      const nowMadeToOrder: CartItem[] = [];
      const backInStock: CartItem[] = [];
      for (const item of items) {
        const product = productById.get(item.productId);
        const variant = variantById.get(item.variantId);
        const variantPrice = variant?.price == null ? null : Number(variant.price);
        const base = variantPrice ?? (product ? Number(product.price) : null);
        if (base == null || !Number.isFinite(base)) continue;
        const oldAmount = Number(item.price.amount);
        const oldBase = item.basePrice != null ? Number(item.basePrice) : oldAmount;
        const customisation = item.customisation?.pct ? rechargeAt(item.customisation, base) : null;
        const customExtra = customisation
          ? customisationPrice(customisation)
          : item.customisation
            ? oldAmount - oldBase - (item.soldOutTerms?.extra ?? 0)
            : 0;
        // The stock checkout takes from: the variant's, or the product's own.
        const stock = variant ? Number(variant.stock ?? 0) : Number(product?.stock_quantity ?? 0);
        const terms = stock < item.quantity ? soldOutTermsFor(readSoldOutSetup(product), base) : null;
        const amount = Math.round((base + customExtra + (terms?.extra ?? 0)) * 100) / 100;
        const termsChanged = !sameTerms(item.soldOutTerms ?? null, terms);
        if (Math.abs(amount - oldAmount) >= 0.01 || termsChanged) {
          updates[cartLineKey(item)] = {
            amount: String(amount),
            ...(item.basePrice != null || terms ? { basePrice: String(base) } : {}),
            ...(customisation ? { customisation } : {}),
            ...(termsChanged ? { soldOutTerms: terms } : {}),
          };
          if (!termsChanged) priceMoved = true;
          else if (terms && !item.soldOutTerms) nowMadeToOrder.push(item);
          else if (!terms && item.soldOutTerms) backInStock.push(item);
          else priceMoved = true;
        }
      }
      if (Object.keys(updates).length === 0) return;
      setPrices(updates);
      if (nowMadeToOrder.length) {
        toast.info(`${nowMadeToOrder.map(lineName).join(", ")} has sold out - it's now made to order`, {
          description: "The boutique will make it for you. Check the extra charge and the longer delivery time in your cart.",
          duration: 8000,
        });
      }
      if (backInStock.length) {
        toast.info(`${backInStock.map(lineName).join(", ")} is back in stock`, {
          description: "It now ships from stock, without the made-to-order charge.",
          duration: 8000,
        });
      }
      if (priceMoved) {
        toast.info("Prices in your cart were updated", { description: "Your cart now shows today's prices, GST included." });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, linesKey]);

  // Worked out on the cart as it is now, so lowering or removing a line
  // frees Checkout at once.
  return useMemo(() => shortStockLines(items, stockNow), [items, stockNow]);
}
