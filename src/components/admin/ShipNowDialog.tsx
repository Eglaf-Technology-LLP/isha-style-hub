import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Truck, Star } from "lucide-react";
import { CourierOption, ShipDestination } from "@/hooks/useShipments";
import { formatWeightKg } from "@/lib/weight";
import { formatMoney } from "@/lib/format";

interface ShipNowDialogProps {
  vendorOrderId: string;
  actioning: boolean;
  checkServiceability: (
    vendorOrderId: string,
    returnRequestId?: string,
  ) => Promise<{ couriers: CourierOption[]; isCod: boolean; weightKg?: number; destination?: ShipDestination } | null>;
  shipNow: (vendorOrderId: string, courierId?: number, courierEtd?: string | null, returnRequestId?: string) => Promise<boolean>;
  triggerLabel?: string;
  triggerSize?: "sm" | "default";
  // Books an exchange's replacement to the warehouse instead of the order itself.
  returnRequestId?: string;
}

// The real ask: don't let Shiprocket silently auto-assign a courier - show
// the vendor the real available couriers and their fares for this route,
// let them pick one, then book with exactly that choice.
export function ShipNowDialog({
  vendorOrderId,
  actioning,
  checkServiceability,
  shipNow,
  triggerLabel = "Ship Now",
  triggerSize = "sm",
  returnRequestId,
}: ShipNowDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [couriers, setCouriers] = useState<CourierOption[] | null>(null);
  const [isCod, setIsCod] = useState(false);
  const [destination, setDestination] = useState<ShipDestination | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null);
  const [booking, setBooking] = useState(false);

  const openDialog = async () => {
    setOpen(true);
    setLoading(true);
    setCouriers(null);
    setSelectedCourierId(null);
    const result = await checkServiceability(vendorOrderId, returnRequestId);
    setLoading(false);
    if (result) {
      setCouriers(result.couriers);
      setIsCod(result.isCod);
      setDestination(result.destination ?? null);
      setWeightKg(result.weightKg ?? null);
      setSelectedCourierId(result.couriers[0]?.courierId ?? null);
    } else {
      setOpen(false);
    }
  };

  const confirmShip = async () => {
    if (!selectedCourierId) return;
    setBooking(true);
    const selectedEtd = couriers?.find((c) => c.courierId === selectedCourierId)?.etd ?? null;
    const success = await shipNow(vendorOrderId, selectedCourierId, selectedEtd, returnRequestId);
    setBooking(false);
    if (success) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
      <Button
        size={triggerSize}
        className="h-8 text-xs gap-1"
        disabled={actioning}
        onClick={openDialog}
      >
        {actioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
        {triggerLabel}
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose a courier</DialogTitle>
          <DialogDescription>
            Real rates for this pickup and delivery address, straight from Shiprocket - cross-check
            any of these against Shiprocket's own rate calculator and the numbers will match exactly.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : couriers && couriers.length > 0 ? (
          <>
            {/* Whether THIS order is COD, not whether a courier merely offers
                COD as a general capability - the old per-courier "COD" badge
                (sourced from codAvailable, true for nearly every courier
                regardless of how this specific order is actually paid) read
                as "this rate includes COD" even for prepaid orders, which is
                exactly the confusion that prompted this fix. */}
            {destination?.kind === "warehouse" && (
              <p className="text-sm -mt-2 rounded-md bg-primary/5 border border-primary/20 p-2">
                Ships to <span className="font-medium">{destination.name}</span>
                {destination.city ? `, ${destination.city}` : ""} ({destination.pincode}). We check it there and send
                it on to the customer{returnRequestId ? "" : " together with the rest of their order"}.
              </p>
            )}
            {weightKg != null && (
              <p className="text-sm -mt-2">
                Parcel weight for these rates: <span className="font-medium">{formatWeightKg(weightKg)}</span>
                <span className="block text-xs text-muted-foreground">
                  From each product's weight × quantity (300 g where a product has none). Wrong? Correct the product's
                  weight first - the fare depends on it.
                </span>
              </p>
            )}
            <p className="text-xs text-muted-foreground -mt-2">
              {destination?.kind === "warehouse"
                ? "Parcels to the warehouse are prepaid - rates below are freight only, paid by AllBoutiqs."
                : isCod
                  ? "This order is Cash on Delivery - rates below include the courier's COD handling charge."
                  : "This order is prepaid - rates below are freight only."}
            </p>
            <RadioGroup
              value={selectedCourierId?.toString() ?? ""}
              onValueChange={(v) => setSelectedCourierId(Number(v))}
              className="space-y-2 max-h-[50vh] overflow-y-auto"
            >
              {couriers.map((c) => (
                <Label
                  key={c.courierId}
                  htmlFor={`courier-${c.courierId}`}
                  className="flex items-start justify-between gap-3 p-3 border border-border rounded-lg cursor-pointer hover:border-primary [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value={c.courierId.toString()} id={`courier-${c.courierId}`} className="mt-1" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{c.courierName}</p>
                        {c.recommended && (
                          <Badge className="text-[10px] px-1.5 py-0">Recommended</Badge>
                        )}
                        {c.rating != null && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Star className="h-3 w-3 fill-current" /> {c.rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      {c.etd && (
                        <span className="text-xs text-muted-foreground">Delivery by {c.etd}</span>
                      )}
                      {/* Same line items Shiprocket's own rate calculator shows
                          (Freight charges / Smart Order / COD) - so a vendor
                          checking there sees the exact same numbers, not a
                          single total with no way to verify it. */}
                      <div className="text-xs text-muted-foreground mt-1">
                        Freight: {formatMoney(c.freightCharge)}
                        {c.serviceFee > 0 && <> · Service fee: {formatMoney(c.serviceFee)}</>}
                        {c.codCharges > 0 && <> · COD charge: {formatMoney(c.codCharges)}</>}
                      </div>
                    </div>
                  </div>
                  <span className="font-semibold whitespace-nowrap">{formatMoney(c.rate)}</span>
                </Label>
              ))}
            </RadioGroup>
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">No couriers available.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={booking}>
            Cancel
          </Button>
          <Button onClick={confirmShip} disabled={!selectedCourierId || booking || loading}>
            {booking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm &amp; Ship
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
