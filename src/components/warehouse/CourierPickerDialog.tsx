import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Star, Truck } from "lucide-react";
import { CourierOption } from "@/hooks/useShipments";
import { formatWeightKg } from "@/lib/weight";

interface CourierPickerDialogProps {
  triggerLabel: string;
  title: string;
  description: string;
  disabled?: boolean;
  loadRates: () => Promise<{ couriers: CourierOption[]; isCod: boolean; weightKg?: number } | null>;
  onBook: (courierId: number, etd: string | null) => Promise<boolean>;
}

// Couriers and fares from the warehouse for one parcel - staff pick one,
// then the booking is made with exactly that courier (same idea as the
// boutique's Ship Now).
export function CourierPickerDialog({ triggerLabel, title, description, disabled, loadRates, onBook }: CourierPickerDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [isCod, setIsCod] = useState(false);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const openDialog = async () => {
    setOpen(true);
    setLoading(true);
    const result = await loadRates();
    setLoading(false);
    if (!result) {
      setOpen(false);
      return;
    }
    setCouriers(result.couriers);
    setIsCod(result.isCod);
    setWeightKg(result.weightKg ?? null);
    setSelected(result.couriers.find((c) => c.recommended)?.courierId ?? result.couriers[0]?.courierId ?? null);
  };

  const confirm = async () => {
    if (!selected) return;
    setBooking(true);
    const ok = await onBook(selected, couriers.find((c) => c.courierId === selected)?.etd ?? null);
    setBooking(false);
    if (ok) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
      <Button size="sm" className="h-8 text-xs gap-1" disabled={disabled} onClick={openDialog}>
        <Truck className="h-3 w-3" />
        {triggerLabel}
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {weightKg != null && (
              <p className="text-sm -mt-2">
                Parcel weight for these rates: <span className="font-medium">{formatWeightKg(weightKg)}</span>
                <span className="block text-xs text-muted-foreground">Wrong? Cancel and fix it with Edit size first.</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground -mt-2">
              {isCod
                ? "Cash on Delivery - rates include the courier's COD charge. The courier collects the amount on the packing slip."
                : "Prepaid - rates are freight only, paid by AllBoutiqs."}
            </p>
            <RadioGroup
              value={selected?.toString() ?? ""}
              onValueChange={(v) => setSelected(Number(v))}
              className="space-y-2 max-h-[50vh] overflow-y-auto"
            >
              {couriers.map((c) => (
                <Label
                  key={c.courierId}
                  htmlFor={`wh-courier-${c.courierId}`}
                  className="flex items-start justify-between gap-3 p-3 border border-border rounded-lg cursor-pointer hover:border-primary [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value={c.courierId.toString()} id={`wh-courier-${c.courierId}`} className="mt-1" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{c.courierName}</p>
                        {c.recommended && <Badge className="text-[10px] px-1.5 py-0">Recommended</Badge>}
                        {c.rating != null && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Star className="h-3 w-3 fill-current" /> {c.rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      {c.etd && <span className="text-xs text-muted-foreground">Delivery by {c.etd}</span>}
                    </div>
                  </div>
                  <span className="font-semibold whitespace-nowrap">₹{c.rate.toFixed(2)}</span>
                </Label>
              ))}
            </RadioGroup>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={booking}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!selected || booking || loading}>
            {booking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm &amp; Book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
