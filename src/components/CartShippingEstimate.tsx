import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSavedAddresses } from "@/hooks/useSavedAddresses";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { CartItem } from "@/stores/cartStore";

interface VendorShippingGroup {
  vendorId: string;
  vendorName: string;
  subtotal: number;
  flatRate: number;
  freeThreshold: number | null;
  estimatedRate: number | null; // null until checked (or checked and unavailable)
  checked: boolean;
}

// Whole-cart delivery date (YYYY-MM-DD), or null when it can't be
// estimated. Shared with Checkout.
export async function fetchCartDeliveryDate(
  pin: string,
  vendorItemsMap: Map<string, { productId: string; quantity: number }[]>,
): Promise<string | null> {
  const groups = [...vendorItemsMap.entries()].map(([vendorId, items]) => ({
    vendor_id: vendorId,
    items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
  }));
  if (groups.length === 0) return null;
  const { data } = await invokeEdgeFunction<{ available: boolean; estimated_delivery_date?: string | null }>(
    "shiprocket-estimate-delivery",
    { delivery_pincode: pin, groups },
  );
  if (!data?.available || !data.estimated_delivery_date) return null;
  return data.estimated_delivery_date;
}

export function deliveryDateLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

// Cart never grouped items by vendor before (a single order/cart can span
// several vendors, same as everywhere else in this schema) and only ever
// showed a placeholder "calculated at checkout" line - this replaces it
// with a real, live cheapest-courier estimate per vendor, using the same
// Shiprocket serviceability check "Ship Now" uses. Deliberately an
// ESTIMATE only: the actual charge still comes from Checkout.tsx's
// existing flat-rate calculation, unchanged - the two can differ slightly,
// which the "Estimated" label is there to signal.
export function CartShippingEstimate({ items }: { items: CartItem[] }) {
  const { defaultAddress } = useSavedAddresses();
  const [pincode, setPincode] = useState("");
  const [groups, setGroups] = useState<VendorShippingGroup[]>([]);
  const [checking, setChecking] = useState(false);
  // One date for the whole cart: everything arrives together in one parcel
  // from the AllBoutiqs warehouse.
  const [cartEta, setCartEta] = useState<string | null | undefined>(undefined);
  const autoChecked = useRef(false);

  const vendorItemsMap = useMemo(() => {
    const map = new Map<string, CartItem[]>();
    items.forEach((item) => {
      if (!item.vendorId) return;
      if (!map.has(item.vendorId)) map.set(item.vendorId, []);
      map.get(item.vendorId)!.push(item);
    });
    return map;
  }, [items]);

  const vendorIdsKey = [...vendorItemsMap.keys()].sort().join(",");

  useEffect(() => {
    const vendorIds = vendorIdsKey ? vendorIdsKey.split(",") : [];
    if (vendorIds.length === 0) {
      setGroups([]);
      return;
    }
    supabase
      .from("vendors")
      .select("id, name, shipping_flat_rate, free_shipping_threshold")
      .in("id", vendorIds)
      .then(({ data }) => {
        setGroups(
          (data ?? []).map((v) => {
            const vendorItems = vendorItemsMap.get(v.id) ?? [];
            const subtotal = vendorItems.reduce(
              (sum, i) => sum + parseFloat(i.price.amount) * i.quantity,
              0,
            );
            return {
              vendorId: v.id,
              vendorName: v.name,
              subtotal,
              flatRate: v.shipping_flat_rate,
              freeThreshold: v.free_shipping_threshold,
              estimatedRate: null,
              checked: false,
            };
          }),
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorIdsKey]);

  const checkShipping = async (pin: string) => {
    if (!/^\d{6}$/.test(pin) || groups.length === 0) return;
    setChecking(true);
    setCartEta(undefined);
    const etaRequest = fetchCartDeliveryDate(pin, vendorItemsMap).then(setCartEta);
    await Promise.all(
      groups.map(async (group) => {
        // Already free regardless of courier rate - no need to call out.
        if (group.freeThreshold != null && group.subtotal >= group.freeThreshold) {
          setGroups((prev) =>
            prev.map((g) => (g.vendorId === group.vendorId ? { ...g, checked: true } : g)),
          );
          return;
        }
        const vendorItems = vendorItemsMap.get(group.vendorId) ?? [];
        const { data } = await invokeEdgeFunction<{ available: boolean; couriers: { rate: number }[] }>(
          "shiprocket-estimate-delivery",
          {
            vendor_id: group.vendorId,
            delivery_pincode: pin,
            items: vendorItems.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
          },
        );
        const cheapest = data?.available && data.couriers.length > 0 ? data.couriers[0].rate : null;
        setGroups((prev) =>
          prev.map((g) => (g.vendorId === group.vendorId ? { ...g, estimatedRate: cheapest, checked: true } : g)),
        );
      }),
    );
    await etaRequest;
    setChecking(false);
  };

  useEffect(() => {
    if (defaultAddress?.pincode && !autoChecked.current && groups.length > 0) {
      autoChecked.current = true;
      setPincode(defaultAddress.pincode);
      checkShipping(defaultAddress.pincode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAddress, groups.length]);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">Shipping &amp; taxes calculated at checkout</p>;
  }

  const anyChecked = groups.some((g) => g.checked);
  const totalEstimated = groups.reduce((sum, g) => {
    if (g.freeThreshold != null && g.subtotal >= g.freeThreshold) return sum;
    return sum + (g.estimatedRate ?? g.flatRate);
  }, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Enter pincode for shipping estimate"
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="h-9 text-sm flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => checkShipping(pincode)}
          disabled={checking || pincode.length !== 6}
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
        </Button>
      </div>

      {anyChecked && (
        <div className="space-y-1 text-sm">
          {groups.map((g) => {
            const isFree = g.freeThreshold != null && g.subtotal >= g.freeThreshold;
            const rate = isFree ? 0 : g.estimatedRate ?? g.flatRate;
            return (
              <div key={g.vendorId} className="flex justify-between text-muted-foreground">
                <span>Estimated shipping - {g.vendorName}</span>
                <span>{rate > 0 ? `₹${rate.toFixed(0)}` : "Free"}</span>
              </div>
            );
          })}
          <div className="flex justify-between font-medium pt-1 border-t border-border/60">
            <span>Estimated shipping total</span>
            <span>{totalEstimated > 0 ? `₹${totalEstimated.toFixed(0)}` : "Free"}</span>
          </div>
          {cartEta && (
            <div className="flex justify-between text-green-700 font-medium">
              <span>Estimated delivery</span>
              <span>by {deliveryDateLabel(cartEta)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
