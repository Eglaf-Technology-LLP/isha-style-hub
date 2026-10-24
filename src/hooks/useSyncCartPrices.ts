import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cartLineKey, useCartStore } from "@/stores/cartStore";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A bag keeps the price each piece had when it was added. Prices can change
// since then - e.g. on 24-10-2026 every customer price gained GST (Product
// Value, Developer Corrections Part 7, 5.1) - so the bag and checkout pull
// today's price for each line and say so when one moved. A customised line
// keeps its customisation charge on top of the new base price.
export function useSyncCartPrices(enabled = true) {
  const items = useCartStore((s) => s.items);
  const setPrices = useCartStore((s) => s.setPrices);
  const lineKeys = items.map(cartLineKey).join(",");

  useEffect(() => {
    if (!enabled || items.length === 0) return;
    let alive = true;
    (async () => {
      const productIds = [...new Set(items.map((i) => i.productId))];
      const variantIds = [...new Set(items.map((i) => i.variantId).filter((id) => UUID_RE.test(id)))];
      const [{ data: products }, { data: variants }] = await Promise.all([
        supabase.from("products").select("id, price").in("id", productIds),
        variantIds.length
          ? supabase.from("product_variants").select("id, price").in("id", variantIds)
          : Promise.resolve({ data: [] as { id: string; price: number | null }[] }),
      ]);
      if (!alive) return;
      const productPrice = new Map((products ?? []).map((p) => [p.id, Number(p.price)]));
      const variantPrice = new Map((variants ?? []).map((v) => [v.id, v.price == null ? null : Number(v.price)]));

      const updates: Record<string, { amount: string; basePrice?: string }> = {};
      for (const item of items) {
        const base = variantPrice.get(item.variantId) ?? productPrice.get(item.productId);
        if (base == null || !Number.isFinite(base)) continue;
        const oldAmount = Number(item.price.amount);
        const oldBase = item.basePrice != null ? Number(item.basePrice) : oldAmount;
        const extra = oldAmount - oldBase;
        const amount = Math.round((base + extra) * 100) / 100;
        if (Math.abs(amount - oldAmount) >= 0.01) {
          updates[cartLineKey(item)] = { amount: String(amount), ...(item.basePrice != null ? { basePrice: String(base) } : {}) };
        }
      }
      if (Object.keys(updates).length === 0) return;
      setPrices(updates);
      toast.info("Prices in your bag were updated", { description: "Your bag now shows today's prices, GST included." });
    })();
    return () => {
      alive = false;
    };
    // Re-check when the set of lines changes, not on every quantity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lineKeys]);
}
