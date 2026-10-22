import { useEffect, useRef, useState } from "react";
import { Loader2, Truck, CircleX, MapPin } from "lucide-react";
import { useSavedAddresses } from "@/hooks/useSavedAddresses";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

interface CourierOption {
  courierName: string;
  rate: number;
  etd: string | null;
}

interface DeliveryEstimateProps {
  vendorId: string;
  productId: string;
}

function dateLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function earliestEtaLabel(couriers: CourierOption[]): string | null {
  const dates = couriers
    .map((c) => (c.etd ? new Date(c.etd) : null))
    .filter((d): d is Date => !!d && !isNaN(d.getTime()));
  if (dates.length === 0) return null;
  const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
  return earliest.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Real delivery-date estimate for this specific vendor+product, using the
// same live Shiprocket serviceability check "Ship Now" uses - not a
// platform-wide guess. While orders go through the AllBoutiqs warehouse the
// server adds up the whole journey (the boutique's preparation time + courier
// to the warehouse + 1 working day there + courier to this pincode) and
// returns estimated_delivery_date.
export function DeliveryEstimate({ vendorId, productId }: DeliveryEstimateProps) {
  const { defaultAddress } = useSavedAddresses();
  const [pincode, setPincode] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ available: boolean; etaLabel: string | null } | null>(null);
  const autoChecked = useRef(false);

  const check = async (pin: string) => {
    if (!/^\d{6}$/.test(pin)) return;
    setChecking(true);
    setResult(null);
    const { data, errorMessage } = await invokeEdgeFunction<{
      available: boolean;
      couriers: CourierOption[];
      estimated_delivery_date?: string | null;
    }>("shiprocket-estimate-delivery", {
      vendor_id: vendorId,
      delivery_pincode: pin,
      items: [{ product_id: productId, quantity: 1 }],
    });
    setChecking(false);
    if (errorMessage || !data?.available || data.couriers.length === 0) {
      setResult({ available: false, etaLabel: null });
      return;
    }
    setResult({
      available: true,
      etaLabel: data.estimated_delivery_date ? dateLabel(data.estimated_delivery_date) : earliestEtaLabel(data.couriers),
    });
  };

  useEffect(() => {
    if (defaultAddress?.pincode && !autoChecked.current) {
      autoChecked.current = true;
      setPincode(defaultAddress.pincode);
      check(defaultAddress.pincode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAddress]);

  return (
    <div className="space-y-2.5">
      <form
        className="flex h-11 items-center border border-foreground/20 focus-within:border-foreground"
        onSubmit={(e) => {
          e.preventDefault();
          check(pincode);
        }}
      >
        <MapPin className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          inputMode="numeric"
          autoComplete="postal-code"
          aria-label="Delivery pincode"
          placeholder="Enter delivery pincode"
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={checking || pincode.length !== 6}
          className="h-full px-4 text-[11px] font-medium uppercase tracking-[0.2em] text-primary disabled:text-muted-foreground"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
        </button>
      </form>
      {result &&
        (result.available && result.etaLabel ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700">
            <Truck className="h-4 w-4" /> Get it by <strong className="font-medium">{result.etaLabel}</strong>
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleX className="h-4 w-4" /> Not deliverable to this pincode
          </p>
        ))}
    </div>
  );
}
