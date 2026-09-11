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
import { CourierOption } from "@/hooks/useShipments";

interface ShipNowDialogProps {
  vendorOrderId: string;
  actioning: boolean;
  checkServiceability: (vendorOrderId: string) => Promise<{ couriers: CourierOption[]; isCod: boolean } | null>;
  shipNow: (vendorOrderId: string, courierId?: number, courierEtd?: string | null) => Promise<boolean>;
  triggerLabel?: string;
  triggerSize?: "sm" | "default";
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
}: ShipNowDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [couriers, setCouriers] = useState<CourierOption[] | null>(null);
  const [isCod, setIsCod] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null);
  const [booking, setBooking] = useState(false);

  const openDialog = async () => {
    setOpen(true);
    setLoading(true);
    setCouriers(null);
    setSelectedCourierId(null);
    const result = await checkServiceability(vendorOrderId);
    setLoading(false);
    if (result) {
      setCouriers(result.couriers);
      setIsCod(result.isCod);
      setSelectedCourierId(result.couriers[0]?.courierId ?? null);
    } else {
      setOpen(false);
    }
  };

  const confirmShip = async () => {
    if (!selectedCourierId) return;
    setBooking(true);
    const selectedEtd = couriers?.find((c) => c.courierId === selectedCourierId)?.etd ?? null;
    const success = await shipNow(vendorOrderId, selectedCourierId, selectedEtd);
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
            <p className="text-xs text-muted-foreground -mt-2">
              {isCod
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
                        Freight: ₹{c.freightCharge.toFixed(2)}
                        {c.serviceFee > 0 && <> · Service fee: ₹{c.serviceFee.toFixed(2)}</>}
                        {c.codCharges > 0 && <> · COD charge: ₹{c.codCharges.toFixed(2)}</>}
                      </div>
                    </div>
                  </div>
                  <span className="font-semibold whitespace-nowrap">₹{c.rate.toFixed(2)}</span>
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
