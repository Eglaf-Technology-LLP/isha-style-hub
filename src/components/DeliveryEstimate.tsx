import { useEffect, useRef, useState } from "react";
import { Loader2, Truck, CircleX, MapPin, PackageCheck } from "lucide-react";
import { useSavedAddresses } from "@/hooks/useSavedAddresses";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { formatDate, formatDateWithDay } from "@/lib/dates";

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
  return formatDateWithDay(isoDate);
}

function earliestEtaLabel(couriers: CourierOption[]): string | null {
  const dates = couriers
    .map((c) => (c.etd ? new Date(c.etd) : null))
    .filter((d): d is Date => !!d && !isNaN(d.getTime()));
  if (dates.length === 0) return null;
  const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
  return formatDate(earliest);
}

// The last PIN code checked on this device, so a shopper without a saved
// address doesn't retype it on every product. A convenience only: storage
// can be missing or blocked, and then the box simply starts empty.
const LAST_PIN_KEY = "allboutiqs:delivery-pincode";
const isPin = (pin: string | null | undefined): pin is string => !!pin && /^\d{6}$/.test(pin);

function readLastPin(): string | null {
  try {
    const pin = localStorage.getItem(LAST_PIN_KEY);
    return isPin(pin) ? pin : null;
  } catch {
    return null;
  }
}

function rememberPin(pin: string) {
  try {
    localStorage.setItem(LAST_PIN_KEY, pin);
  } catch {
    // ignore - see readLastPin
  }
}

// Real "Ships by" / "Delivery by" dates for this specific vendor+product,
// using the same live Shiprocket serviceability check "Ship Now" uses - not a
// platform-wide guess. While orders go through the AllBoutiqs warehouse the
// server adds up the whole journey (the boutique's preparation time + courier
// to the warehouse + the warehouse's quality-check days + courier to this
// pincode); "Ships by" is when the parcel leaves the warehouse.
//
// The PIN code fills itself in: the signed-in customer's default saved
// address, otherwise the last one checked on this device. The customer can
// still type another.
export function DeliveryEstimate({ vendorId, productId }: DeliveryEstimateProps) {
  const { defaultAddress } = useSavedAddresses();
  const [pincode, setPincode] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{
    available: boolean;
    shipsBy: string | null;
    deliveryBy: string | null;
  } | null>(null);
  const savedPin = defaultAddress?.pincode?.trim();
  const addressPin = isPin(savedPin) ? savedPin : null;
  // A PIN the customer checked by hand on this page - kept when they move
  // to another product, and never replaced by a saved address that loads
  // later.
  const typedPin = useRef<string | null>(null);
  // "vendor|product|pin" of the last check, so the same one isn't repeated.
  const lastChecked = useRef("");
  const latestRequest = useRef(0);

  const check = async (pin: string) => {
    if (!isPin(pin)) return;
    lastChecked.current = `${vendorId}|${productId}|${pin}`;
    const request = ++latestRequest.current;
    setChecking(true);
    setResult(null);
    rememberPin(pin);
    const { data, errorMessage } = await invokeEdgeFunction<{
      available: boolean;
      couriers: CourierOption[];
      ships_by_date?: string | null;
      estimated_delivery_date?: string | null;
    }>("shiprocket-estimate-delivery", {
      vendor_id: vendorId,
      delivery_pincode: pin,
      items: [{ product_id: productId, quantity: 1 }],
    });
    // A newer check (another PIN) has started since - its answer wins.
    if (request !== latestRequest.current) return;
    setChecking(false);
    if (errorMessage || !data?.available || data.couriers.length === 0) {
      setResult({ available: false, shipsBy: null, deliveryBy: null });
      return;
    }
    setResult({
      available: true,
      shipsBy: data.ships_by_date ? dateLabel(data.ships_by_date) : null,
      deliveryBy: data.estimated_delivery_date
        ? dateLabel(data.estimated_delivery_date)
        : earliestEtaLabel(data.couriers),
    });
  };

  // Fill in and check the PIN: one the customer typed on this page, else
  // their default saved address, else the last one checked on this device.
  // Runs again when the saved addresses arrive (they load after sign-in)
  // and when the shopper moves to another product.
  useEffect(() => {
    const pin = typedPin.current ?? addressPin ?? readLastPin();
    if (!pin) return;
    setPincode(pin);
    if (lastChecked.current !== `${vendorId}|${productId}|${pin}`) check(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressPin, vendorId, productId]);

  return (
    <div className="space-y-2.5">
      <form
        className="flex h-11 items-center border border-foreground/20 focus-within:border-foreground"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isPin(pincode)) return;
          typedPin.current = pincode;
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
      {addressPin && pincode === addressPin && (
        <p className="text-xs text-muted-foreground">
          Your saved address{defaultAddress?.city ? ` · ${defaultAddress.city}` : ""}
        </p>
      )}
      {result &&
        (result.available && result.deliveryBy ? (
          <div className="space-y-1.5 text-sm">
            {result.shipsBy && (
              <p className="flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-muted-foreground" /> Ships by{" "}
                <strong className="font-medium">{result.shipsBy}</strong>
              </p>
            )}
            <p className="flex items-center gap-2 text-emerald-700">
              <Truck className="h-4 w-4" /> Delivery by <strong className="font-medium">{result.deliveryBy}</strong>
            </p>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleX className="h-4 w-4" /> Not deliverable to this pincode
          </p>
        ))}
    </div>
  );
}
