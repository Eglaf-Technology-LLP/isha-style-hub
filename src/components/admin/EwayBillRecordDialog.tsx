import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { orderRefOf } from "@/lib/ewayBill";
import type { AdminEwayBill, CourierTransporter } from "@/hooks/useEwayBillsAdmin";

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
const localInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Type in the number the portal gave (or the boutique emailed). Usually just
// the number; the courier and document can be corrected when the e-way bill
// was made out differently from the request.
export function EwayBillRecordDialog({
  bill,
  transporters,
  onSaved,
}: {
  bill: AdminEwayBill;
  transporters: CourierTransporter[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [number, setNumber] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [changeCourier, setChangeCourier] = useState(false);
  const [courierId, setCourierId] = useState<string>("");
  const [changeDocument, setChangeDocument] = useState(false);
  const [documentNumber, setDocumentNumber] = useState(bill.document_number);
  const [documentDate, setDocumentDate] = useState(bill.document_date);

  const openDialog = () => {
    setNumber(bill.ewb_number ?? "");
    setGeneratedAt(localInput(bill.ewb_date ? new Date(bill.ewb_date) : new Date()));
    setValidUntil(bill.valid_until ? localInput(new Date(bill.valid_until)) : "");
    setChangeCourier(false);
    setCourierId(bill.courier_id != null ? String(bill.courier_id) : "");
    setChangeDocument(false);
    setDocumentNumber(bill.document_number);
    setDocumentDate(bill.document_date);
    setOpen(true);
  };

  const digits = number.replace(/\s/g, "");
  const valid = /^\d{12}$/.test(digits);

  const save = async () => {
    setSaving(true);
    const courier = transporters.find((t) => String(t.courier_id) === courierId);
    const { data, errorMessage } = await invokeEdgeFunction<{ pickup_requested?: boolean; pickup_error?: string | null }>("eway-bill-actions", {
      action: "record",
      eway_bill_id: bill.id,
      ewb_number: digits,
      ewb_date: generatedAt ? new Date(generatedAt).toISOString() : null,
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      ...(changeCourier && courier ? { courier_id: courier.courier_id, courier_name: courier.courier_name } : {}),
      ...(changeDocument ? { document_number: documentNumber, document_date: documentDate } : {}),
    });
    setSaving(false);
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }
    if (data?.pickup_error) toast.error(`Saved, but the courier pickup couldn't be requested: ${data.pickup_error}`);
    else
      toast.success(
        data?.pickup_requested
          ? "Saved - the courier will collect the return from the customer"
          : bill.movement.startsWith("rto:")
            ? "Saved - now upload it on Shiprocket's RTO order"
            : bill.leg.startsWith("warehouse_to_")
              ? "Saved - the warehouse can book the parcel now"
              : bill.leg.startsWith("customer_to_")
                ? "Saved"
                : `Saved - ${bill.vendorName} has been told to ship`,
      );
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" className="h-8 text-xs" onClick={openDialog}>
        {bill.status === "active" ? "Edit number" : "Enter e-way bill number"}
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>E-way bill for order {orderRefOf(bill.order_id)}</DialogTitle>
          <DialogDescription>
            {bill.vendorName} · {bill.document_number} · made out to {bill.courier_name ?? "the courier"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ewb-number">E-way bill number</Label>
            <Input
              id="ewb-number"
              inputMode="numeric"
              placeholder="12 digits"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="font-mono"
              autoFocus
            />
            {number && !valid && <p className="text-xs text-destructive">An e-way bill number has 12 digits.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ewb-date">Generated on</Label>
              <Input id="ewb-date" type="datetime-local" value={generatedAt} onChange={(e) => setGeneratedAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ewb-valid">Valid until (if shown)</Label>
              <Input id="ewb-valid" type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Validity starts when the courier fills Part B, so it's often blank at first - add it later with Edit number.
          </p>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={changeCourier} onCheckedChange={(v) => setChangeCourier(v === true)} />
            Made out to a different courier
          </label>
          {changeCourier && (
            <Select value={courierId} onValueChange={setCourierId}>
              <SelectTrigger>
                <SelectValue placeholder="Courier" />
              </SelectTrigger>
              <SelectContent>
                {transporters.map((t) => (
                  <SelectItem key={t.courier_id} value={String(t.courier_id)}>
                    {t.courier_name} ({t.transporter_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {changeCourier && transporters.length === 0 && (
            <p className="text-xs text-muted-foreground">Add couriers in the Couriers tab first.</p>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={changeDocument} onCheckedChange={(v) => setChangeDocument(v === true)} />
            Made on a different document
          </label>
          {changeDocument && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ewb-doc">Document number</Label>
                <Input id="ewb-doc" value={documentNumber} maxLength={16} onChange={(e) => setDocumentNumber(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ewb-doc-date">Document date</Label>
                <Input id="ewb-doc-date" type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid || saving || (changeCourier && !courierId)}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
