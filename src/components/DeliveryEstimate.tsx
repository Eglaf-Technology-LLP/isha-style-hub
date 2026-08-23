import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Truck, CircleX } from "lucide-react";
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
// platform-wide guess. No pincode-checker convention existed anywhere in
// this codebase before, so this is new UI, kept intentionally small.
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
    const { data, errorMessage } = await invokeEdgeFunction<{ available: boolean; couriers: CourierOption[] }>(
      "shiprocket-estimate-delivery",
      { vendor_id: vendorId, delivery_pincode: pin, items: [{ product_id: productId, quantity: 1 }] },
    );
    setChecking(false);
    if (errorMessage || !data?.available || data.couriers.length === 0) {
      setResult({ available: false, etaLabel: null });
      return;
    }
    setResult({ available: true, etaLabel: earliestEtaLabel(data.couriers) });
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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Enter pincode"
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="w-32 h-9"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => check(pincode)}
          disabled={checking || pincode.length !== 6}
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
        </Button>
      </div>
      {result &&
        (result.available && result.etaLabel ? (
          <p className="text-sm text-green-700 flex items-center gap-1.5">
            <Truck className="h-4 w-4" /> Get it by {result.etaLabel}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <CircleX className="h-4 w-4" /> Not deliverable to this pincode
          </p>
        ))}
    </div>
  );
}
