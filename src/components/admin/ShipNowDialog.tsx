import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, Truck } from "lucide-react";
import { CourierOption } from "@/hooks/useShipments";

interface ShipNowDialogProps {
  vendorOrderId: string;
  actioning: boolean;
  checkServiceability: (vendorOrderId: string) => Promise<{ couriers: CourierOption[] } | null>;
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a courier</DialogTitle>
          <DialogDescription>
            Real rates for this pickup and delivery address - pick one to book the pickup.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : couriers && couriers.length > 0 ? (
          <RadioGroup
            value={selectedCourierId?.toString() ?? ""}
            onValueChange={(v) => setSelectedCourierId(Number(v))}
            className="space-y-2 max-h-[50vh] overflow-y-auto"
          >
            {couriers.map((c) => (
              <Label
                key={c.courierId}
                htmlFor={`courier-${c.courierId}`}
                className="flex items-center justify-between gap-3 p-3 border border-border rounded-lg cursor-pointer hover:border-primary [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
              >
                <div className="flex items-center gap-3">
                  <RadioGroupItem value={c.courierId.toString()} id={`courier-${c.courierId}`} />
                  <div>
                    <p className="text-sm font-medium">{c.courierName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {c.etd && <span className="text-xs text-muted-foreground">Delivery by {c.etd}</span>}
                      {c.codAvailable && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          COD
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <span className="font-semibold">₹{c.rate.toFixed(0)}</span>
              </Label>
            ))}
          </RadioGroup>
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
