import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Printer } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { amountInWords } from "@/lib/amountInWords";
import { COMPANY } from "@/lib/company";
import { printElement } from "@/lib/printElement";

export type FeeInvoice = Tables<"fee_invoices">;

const money = (n: number) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctOf = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 10000) / 100}%` : "—");
const addressLine = (a: unknown) => {
  const x = (a ?? {}) as Record<string, string>;
  return [x.address_line1, x.address_line2, x.city, x.state, x.pincode].filter(Boolean).join(", ");
};

// AllBoutiqs' weekly fee invoice to a boutique (fee_invoices), printable as
// an A4 PDF from its own window.
export function FeeInvoiceView({ invoice }: { invoice: FeeInvoice }) {
  const [open, setOpen] = useState(false);
  const intra = invoice.supply_type === "intra_state";
  const id = `fee-invoice-${invoice.id}`;
  const lines = [
    {
      label: "Marketplace commission",
      detail: invoice.founding_waiver && Number(invoice.commission_amount) === 0
        ? "Founding Boutique - waived"
        : `${pctOf(Number(invoice.commission_amount), Number(invoice.product_value))} of product value ₹${money(invoice.product_value)}`,
      amount: Number(invoice.commission_amount),
    },
    {
      label: "Technology & service fee",
      detail: `${pctOf(Number(invoice.tech_fee_amount), Number(invoice.product_value))} of product value ₹${money(invoice.product_value)}`,
      amount: Number(invoice.tech_fee_amount),
    },
  ];

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
        <FileText className="h-3.5 w-3.5" /> View
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AllBoutiqs fee invoice</DialogTitle>
          </DialogHeader>
          <div id={id} className="space-y-4 text-xs text-foreground">
            <div className="flex items-start justify-between gap-4 border-b-2 border-foreground pb-3">
              <div>
                <p className="text-lg font-bold tracking-wide">TAX INVOICE</p>
                <p className="text-muted-foreground">AllBoutiqs fees · original for recipient</p>
              </div>
              <div className="text-right space-y-0.5">
                <p>
                  <span className="text-muted-foreground">Invoice No: </span>
                  <span className="font-mono font-semibold">{invoice.invoice_number}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Invoice Date: </span>
                  {format(new Date(invoice.issued_at), "dd MMM yyyy")}
                </p>
                <p>
                  <span className="text-muted-foreground">Payout date: </span>
                  {format(new Date(invoice.payout_date), "dd MMM yyyy")}
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">From</p>
                <p className="text-sm font-semibold">{invoice.supplier_name}</p>
                <p>{COMPANY.location}</p>
                <p>State: Gujarat ({invoice.supplier_state_code})</p>
                <p>GSTIN: <span className="font-mono">{invoice.supplier_gstin}</span></p>
                <p>CIN: <span className="font-mono">{invoice.supplier_cin}</span></p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">To</p>
                <p className="text-sm font-semibold">{invoice.recipient_legal_name ?? invoice.recipient_name}</p>
                {invoice.recipient_legal_name && invoice.recipient_legal_name !== invoice.recipient_name && (
                  <p className="text-muted-foreground">Trading as {invoice.recipient_name}</p>
                )}
                {addressLine(invoice.recipient_address) && <p>{addressLine(invoice.recipient_address)}</p>}
                {invoice.recipient_state_code && <p>State code: {invoice.recipient_state_code}</p>}
                {invoice.recipient_gstin && <p>GSTIN: <span className="font-mono">{invoice.recipient_gstin}</span></p>}
                {invoice.recipient_pan && <p>PAN: <span className="font-mono">{invoice.recipient_pan}</span></p>}
              </div>
            </div>

            <p>
              Fees on {invoice.order_count} delivered order{invoice.order_count === 1 ? "" : "s"}
              {invoice.period_start && invoice.period_end
                ? ` (${format(new Date(invoice.period_start), "dd MMM")} - ${format(new Date(invoice.period_end), "dd MMM yyyy")})`
                : ""}
              , deducted from the payout of {format(new Date(invoice.payout_date), "dd MMM yyyy")}. SAC {invoice.sac_code}.
            </p>

            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-y border-foreground text-left">
                  <th className="py-1.5 pr-2">#</th>
                  <th className="py-1.5 pr-2">Description</th>
                  <th className="py-1.5 pr-2">SAC</th>
                  <th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.label} className="border-b border-border align-top">
                    <td className="py-1.5 pr-2">{i + 1}</td>
                    <td className="py-1.5 pr-2">
                      {l.label}
                      <div className="text-muted-foreground">{l.detail}</div>
                    </td>
                    <td className="py-1.5 pr-2 font-mono">{invoice.sac_code}</td>
                    <td className="py-1.5 text-right">₹{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-col sm:flex-row justify-between gap-4">
              <p className="sm:max-w-[55%]">
                <span className="text-muted-foreground">Amount in words: </span>
                {amountInWords(Number(invoice.total))}
              </p>
              <div className="space-y-1 sm:min-w-[240px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taxable value</span>
                  <span>₹{money(invoice.taxable_value)}</span>
                </div>
                {intra ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CGST {Number(invoice.gst_rate) / 2}%</span>
                      <span>₹{money(invoice.cgst_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SGST {Number(invoice.gst_rate) / 2}%</span>
                      <span>₹{money(invoice.sgst_amount)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IGST {Number(invoice.gst_rate)}%</span>
                    <span>₹{money(invoice.igst_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-foreground pt-1 text-sm font-bold">
                  <span>Total</span>
                  <span>₹{money(invoice.total)}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-3 space-y-1 text-[11px]">
              {invoice.founding_waiver && <p>Founding Boutique: marketplace commission waived for the founding period.</p>}
              <p>Customer care: {COMPANY.supportEmail} · {COMPANY.supportPhone}</p>
              <p>Subject to {COMPANY.jurisdiction} jurisdiction.</p>
              <p className="text-muted-foreground">This is a computer-generated invoice and does not need a signature.</p>
            </div>

            <Button
              onClick={() => printElement(document.getElementById(id), `Fee invoice ${invoice.invoice_number}`)}
              className="w-full gap-2 print:hidden"
            >
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
