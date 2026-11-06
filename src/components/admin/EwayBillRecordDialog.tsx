import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { BOUTIQUE_LEGS, EwayBillLeg, localInput, orderRefOf, uploadEwayBillPdf } from "@/lib/ewayBill";
import type { AdminEwayBill } from "@/hooks/useEwayBillsAdmin";

// One number, typed in from the portal (bulk entry covers many). The PDF can
// go with it; the document can be corrected when the portal entry differs.
export function EwayBillRecordDialog({ bill, onSaved }: { bill: AdminEwayBill; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [number, setNumber] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [changeDocument, setChangeDocument] = useState(false);
  const [documentNumber, setDocumentNumber] = useState(bill.document_number);
  const [documentDate, setDocumentDate] = useState(bill.document_date);

  const openDialog = () => {
    setNumber(bill.ewb_number ?? "");
    setGeneratedAt(localInput(bill.ewb_date ? new Date(bill.ewb_date) : new Date()));
    setValidUntil(bill.valid_until ? localInput(new Date(bill.valid_until)) : "");
    setPdf(null);
    setChangeDocument(false);
    setDocumentNumber(bill.document_number);
    setDocumentDate(bill.document_date);
    setOpen(true);
  };

  const digits = number.replace(/\s/g, "");
  const valid = /^\d{12}$/.test(digits);

  const save = async () => {
    setSaving(true);
    // The PDF first, so the boutique's "ready" message can say it's there.
    if (pdf) {
      const pdfError = await uploadEwayBillPdf(bill, pdf);
      if (pdfError) {
        setSaving(false);
        toast.error(pdfError);
        return;
      }
    }
    const { errorMessage } = await invokeEdgeFunction("eway-bill-actions", {
      action: "record",
      eway_bill_id: bill.id,
      ewb_number: digits,
      ewb_date: generatedAt ? new Date(generatedAt).toISOString() : null,
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      ...(changeDocument ? { document_number: documentNumber, document_date: documentDate } : {}),
    });
    setSaving(false);
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }
    toast.success(
      BOUTIQUE_LEGS.includes(bill.leg as EwayBillLeg)
        ? `Saved - ${bill.vendorName} has been told to ship`
        : bill.leg.startsWith("warehouse_")
          ? "Saved - the warehouse can book the parcel now"
          : "Saved",
    );
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant={bill.status === "active" ? "outline" : "default"} className="h-8 text-xs" onClick={openDialog}>
        {bill.status === "active" ? "Edit" : "Enter number"}
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>E-way bill for order {orderRefOf(bill.order_id)}</DialogTitle>
          <DialogDescription>
            {bill.vendorName} · {bill.document_number}
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
            Validity starts when Part B is filled, so it's often blank at first - add it later with Edit.
          </p>
          <div className="space-y-1">
            <Label htmlFor="ewb-pdf">PDF from the portal {bill.pdf_path ? "(replaces the one saved)" : "(optional now)"}</Label>
            <Input id="ewb-pdf" type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
          </div>

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
          <Button onClick={save} disabled={!valid || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
