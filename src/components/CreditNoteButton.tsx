import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileMinus, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { amountInWords } from "@/lib/amountInWords";
import { COMPANY } from "@/lib/company";
import { formatDate } from "@/lib/dates";
import { invoiceLineDescription } from "@/lib/invoiceLine";
import { printElement } from "@/lib/printElement";

interface CreditNoteLine {
  line_no: number;
  description: string;
  hsn_code: string | null;
  quantity: number;
  taxable_value: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total: number;
}

interface CreditNote {
  id: string;
  credit_note_number: string;
  issued_at: string;
  reason: string | null;
  order_id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  seller_name: string;
  seller_legal_name: string | null;
  seller_gstin: string | null;
  seller_state_code: string | null;
  billing_name: string | null;
  billing_state: string | null;
  place_of_supply_code: string | null;
  supply_type: "intra_state" | "inter_state" | null;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total: number;
  credit_note_lines: CreditNoteLine[];
}

const money = (n: number) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const REASON_LABEL: Record<string, string> = {
  cancelled: "Order cancelled",
  return: "Goods returned",
  undelivered: "Not delivered",
};

// The boutique's GST credit note(s) on one part of an order - issued by the
// database when an invoiced part is cancelled or a return completes
// (credit_note_on_part_cancelled / credit_note_on_return_completed). Shows
// nothing when the part has none. Same layout and closing line as the tax
// invoice (InvoiceDownloadButton), for the customer and admins.
export function CreditNoteButton({ vendorOrderId }: { vendorOrderId: string }) {
  const [notes, setNotes] = useState<CreditNote[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("credit_notes")
      .select(
        "id, credit_note_number, issued_at, reason, order_id, invoice_number, invoice_date, seller_name, seller_legal_name, seller_gstin, seller_state_code, billing_name, billing_state, place_of_supply_code, supply_type, taxable_value, cgst_amount, sgst_amount, igst_amount, total, credit_note_lines(line_no, description, hsn_code, quantity, taxable_value, gst_rate, cgst_amount, sgst_amount, igst_amount, total)",
      )
      .eq("vendor_order_id", vendorOrderId)
      .order("issued_at")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("credit notes load error:", error);
        setNotes((data as unknown as CreditNote[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorOrderId]);

  if (!notes || notes.length === 0) return null;

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
        <FileMinus className="h-3.5 w-3.5" /> Credit note
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Credit Note</DialogTitle>
          </DialogHeader>
          {notes.map((note) => (
            <CreditNoteView key={note.id} note={note} />
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreditNoteView({ note }: { note: CreditNote }) {
  const elementId = `credit-note-${note.id}`;
  const intra = note.supply_type !== "inter_state";
  const lines = [...(note.credit_note_lines ?? [])].sort((a, b) => a.line_no - b.line_no);

  return (
    <div className="space-y-4 border-b border-border pb-6 last:border-b-0">
      <div id={elementId} className="space-y-4 text-xs text-foreground">
        <div className="flex items-start justify-between gap-4 border-b-2 border-foreground pb-3">
          <div>
            <p className="text-lg font-bold tracking-wide">CREDIT NOTE</p>
            <p className="text-muted-foreground">Original for recipient</p>
          </div>
          <div className="text-right space-y-0.5">
            <p>
              <span className="text-muted-foreground">Credit Note No: </span>
              <span className="font-mono font-semibold">{note.credit_note_number}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Date: </span>
              {formatDate(new Date(note.issued_at))}
            </p>
            {note.invoice_number && (
              <p>
                <span className="text-muted-foreground">Against invoice: </span>
                <span className="font-mono">{note.invoice_number}</span>
                {note.invoice_date && ` · ${formatDate(new Date(note.invoice_date))}`}
              </p>
            )}
            <p>
              <span className="text-muted-foreground">Order No: </span>
              {note.order_id.slice(0, 8).toUpperCase()}
            </p>
            {note.reason && (
              <p>
                <span className="text-muted-foreground">Reason: </span>
                {REASON_LABEL[note.reason] ?? note.reason}
              </p>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Issued by (seller)</p>
            <p className="text-sm font-semibold">{note.seller_legal_name ?? note.seller_name}</p>
            {note.seller_legal_name && <p className="text-muted-foreground">Boutique / Brand Name: {note.seller_name}</p>}
            {note.seller_state_code && <p>State code: {note.seller_state_code}</p>}
            {note.seller_gstin && (
              <p>
                GSTIN: <span className="font-mono">{note.seller_gstin}</span>
              </p>
            )}
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">To</p>
            <p className="text-sm font-semibold">{note.billing_name ?? "—"}</p>
            {note.billing_state && <p>State: {note.billing_state}</p>}
            {note.place_of_supply_code && <p>Place of supply: {note.place_of_supply_code}</p>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-y border-foreground text-left">
                <th className="py-1.5 pr-2">#</th>
                <th className="py-1.5 pr-2">Description</th>
                <th className="py-1.5 pr-2">HSN</th>
                <th className="py-1.5 pr-2 text-right">Qty</th>
                <th className="py-1.5 pr-2 text-right">Taxable value</th>
                {intra ? (
                  <>
                    <th className="py-1.5 pr-2 text-right">CGST</th>
                    <th className="py-1.5 pr-2 text-right">SGST</th>
                  </>
                ) : (
                  <th className="py-1.5 pr-2 text-right">IGST</th>
                )}
                <th className="py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.line_no} className="border-b border-border align-top">
                  <td className="py-1.5 pr-2">{l.line_no}</td>
                  <td className="py-1.5 pr-2">{invoiceLineDescription(l.description)}</td>
                  <td className="py-1.5 pr-2 font-mono">{l.hsn_code ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-right">{l.quantity}</td>
                  <td className="py-1.5 pr-2 text-right">{money(l.taxable_value)}</td>
                  {intra ? (
                    <>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                        {Number(l.gst_rate) / 2}% · {money(l.cgst_amount)}
                      </td>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                        {Number(l.gst_rate) / 2}% · {money(l.sgst_amount)}
                      </td>
                    </>
                  ) : (
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                      {Number(l.gst_rate)}% · {money(l.igst_amount)}
                    </td>
                  )}
                  <td className="py-1.5 text-right font-medium">{money(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <p className="sm:max-w-[55%]">
            <span className="text-muted-foreground">Amount in words: </span>
            {amountInWords(note.total)}
          </p>
          <div className="space-y-1 sm:min-w-[240px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxable value</span>
              <span>₹{money(note.taxable_value)}</span>
            </div>
            {intra ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CGST</span>
                  <span>₹{money(note.cgst_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST</span>
                  <span>₹{money(note.sgst_amount)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IGST</span>
                <span>₹{money(note.igst_amount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-foreground pt-1 text-sm font-bold">
              <span>Total credit (incl. GST)</span>
              <span>₹{money(note.total)}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-3 space-y-1 text-[11px]">
          <p className="font-medium">
            Sold through {COMPANY.legalName}, GSTIN {COMPANY.gstin}
          </p>
          <p>Subject to {COMPANY.jurisdiction} jurisdiction.</p>
          {/* The tax invoice's CA-approved closing line, for a credit note
              (client corrections Part 2, A10.4; 24 Nov 2026). */}
          <p className="text-muted-foreground">
            This is a computer-generated credit note issued electronically on behalf of the seller by AllBoutiqs Private
            Limited (e-commerce operator). No signature is required.
          </p>
        </div>
      </div>
      <Button
        onClick={() => printElement(document.getElementById(elementId), `Credit note ${note.credit_note_number}`)}
        className="w-full gap-2 print:hidden"
      >
        <Printer className="h-4 w-4" /> Print / Save as PDF
      </Button>
    </div>
  );
}
