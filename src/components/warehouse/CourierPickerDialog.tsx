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
import { formatMoney } from "@/lib/format";
import { EwayBillPreview } from "@/lib/ewayBill";
import { EwayBillNotice } from "@/components/EwayBillNotice";

interface CourierPickerDialogProps {
  triggerLabel: string;
  title: string;
  description: string;
  disabled?: boolean;
  loadRates: () => Promise<{ couriers: CourierOption[]; isCod: boolean; weightKg?: number; ewayBills?: EwayBillPreview[] } | null>;
  // { ewayBills }: not booked - the parcel waits for these e-way bills.
  onBook: (courierId: number, etd: string | null, courierName: string | null) => Promise<boolean | { ewayBills: EwayBillPreview[] }>;
}

// Couriers and fares from the warehouse for one parcel - staff pick one,
// then the booking is made with exactly that courier (same idea as the
// boutique's Ship Now). A boutique part over the e-way bill limit makes the
// parcel wait for its e-way bill, which fixes the courier.
export function CourierPickerDialog({ triggerLabel, title, description, disabled, loadRates, onBook }: CourierPickerDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [isCod, setIsCod] = useState(false);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [ewayBills, setEwayBills] = useState<EwayBillPreview[]>([]);

  // AllBoutiqs is the transporter on the e-way bills, so any courier can be booked.
  const waiting = ewayBills.some((p) => p.bill?.status === "pending");
  const notAskedYet = ewayBills.some((p) => !p.bill);
  const applyEwayBills = (previews: EwayBillPreview[]) => setEwayBills(previews);

  const openDialog = async () => {
    setOpen(true);
    setLoading(true);
    setEwayBills([]);
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
    applyEwayBills(result.ewayBills ?? []);
  };

  const confirm = async () => {
    if (!selected) return;
    setBooking(true);
    const courier = couriers.find((c) => c.courierId === selected);
    const result = await onBook(selected, courier?.etd ?? null, courier?.courierName ?? null);
    setBooking(false);
    if (result === true) setOpen(false);
    else if (result && typeof result === "object") applyEwayBills(result.ewayBills);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
      <Button size="sm" className="h-8 text-xs gap-1" disabled={disabled} onClick={openDialog}>
        <Truck className="h-3 w-3" />
        {triggerLabel}
      </Button>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
            {ewayBills.map((p) => (
              <EwayBillNotice key={p.vendor_order_id} preview={p} boutique={ewayBills.length > 1 ? p.vendor_name : undefined} />
            ))}
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
                  <span className="font-semibold whitespace-nowrap">{formatMoney(c.rate)}</span>
                </Label>
              ))}
            </RadioGroup>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={booking}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!selected || booking || loading || (waiting && !notAskedYet)}>
            {booking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {notAskedYet ? "Ask for e-way bill" : waiting ? "E-way bill being made" : <>Confirm &amp; Book</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
