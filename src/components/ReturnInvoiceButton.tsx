import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { COMPANY } from "@/lib/company";
import { printElement } from "@/lib/printElement";
import { formatDate } from "@/lib/dates";
import { amountInWords } from "@/lib/amountInWords";
import { formatEwbNumber, RETURN_INVOICE_REASON_LABELS } from "@/lib/ewayBill";

type Address = { address_line1?: string; address_line2?: string; city?: string; state?: string; pincode?: string } | null;

const money = (n: number) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const addressLines = (a: Address) =>
  a ? [[a.address_line1, a.address_line2].filter(Boolean).join(", "), [a.city, a.state, a.pincode].filter(Boolean).join(", ")].filter(Boolean) : [];

interface Loaded {
  returnInvoice: Tables<"return_invoices">;
  lines: Tables<"return_invoice_lines">[];
  invoice: Tables<"invoices">;
  ewbNumbers: string[];
}

// The boutique's return invoice: takes back (part of) a tax invoice - the
// items a customer returned, or the whole sale when it was undone before the
// customer had the goods. Issued by AllBoutiqs on the boutique's behalf;
// prints like the tax invoice.
export function ReturnInvoiceButton({ returnInvoiceId, label = "Return invoice" }: { returnInvoiceId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data) return;
    (async () => {
      const { data: returnInvoice, error: riErr } = await supabase
        .from("return_invoices")
        .select("*")
        .eq("id", returnInvoiceId)
        .maybeSingle();
      if (riErr || !returnInvoice) {
        setError(riErr?.message ?? "Return invoice not found");
        return;
      }
      const [{ data: lines }, { data: invoice }, { data: bills }] = await Promise.all([
        supabase.from("return_invoice_lines").select("*").eq("return_invoice_id", returnInvoiceId).order("line_no"),
        supabase.from("invoices").select("*").eq("id", returnInvoice.invoice_id).maybeSingle(),
        supabase.from("eway_bills").select("ewb_number").eq("return_invoice_id", returnInvoiceId).eq("status", "active"),
      ]);
      if (!invoice) {
        setError("The invoice it takes back couldn't be loaded");
        return;
      }
      setData({
        returnInvoice,
        lines: lines ?? [],
        invoice,
        ewbNumbers: (bills ?? []).map((b) => b.ewb_number).filter((n): n is string => !!n),
      });
    })();
  }, [open, data, returnInvoiceId]);

  const intra = data?.invoice.supply_type !== "inter_state";
  const cancelled = data?.returnInvoice.status === "cancelled";

  return (
    <>
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setOpen(true)}>
        <FileText className="h-3 w-3" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Return Invoice</DialogTitle>
          </DialogHeader>
          {error ? (
            <p className="text-sm text-destructive py-6 text-center">{error}</p>
          ) : !data ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div id="return-invoice-content" className="space-y-4 text-xs text-foreground">
              <div className="flex items-start justify-between gap-4 border-b-2 border-foreground pb-3">
                <div>
                  <p className="text-lg font-bold tracking-wide">RETURN INVOICE</p>
                  <p className="text-muted-foreground">
                    {RETURN_INVOICE_REASON_LABELS[data.returnInvoice.reason] ?? data.returnInvoice.reason}
                  </p>
                  {cancelled && (
                    <Badge variant="destructive" className="mt-1">
                      Cancelled{data.returnInvoice.cancelled_at ? ` ${formatDate(new Date(data.returnInvoice.cancelled_at))}` : ""}
                      {data.returnInvoice.cancel_reason ? ` - ${data.returnInvoice.cancel_reason}` : ""}
                    </Badge>
                  )}
                </div>
                <div className="text-right space-y-0.5">
                  <p>
                    <span className="text-muted-foreground">Return invoice No: </span>
                    <span className="font-mono font-semibold">{data.returnInvoice.return_invoice_number}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Date: </span>
                    {formatDate(new Date(data.returnInvoice.issued_at))}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Against invoice: </span>
                    <span className="font-mono">{data.invoice.invoice_number}</span> · {formatDate(new Date(data.invoice.issued_at))}
                  </p>
                  {data.invoice.order_number && (
                    <p>
                      <span className="text-muted-foreground">Order No: </span>
                      {data.invoice.order_number}
                    </p>
                  )}
                  {data.ewbNumbers.map((n) => (
                    <p key={n}>
                      <span className="text-muted-foreground">E-way bill: </span>
                      <span className="font-mono font-semibold">{formatEwbNumber(n)}</span>
                    </p>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Seller (taking the goods back)</p>
                  <p className="text-sm font-semibold">{data.invoice.seller_legal_name ?? data.invoice.seller_name}</p>
                  {addressLines(data.invoice.seller_address as Address).map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                  {data.invoice.seller_gstin && (
                    <p>
                      GSTIN: <span className="font-mono">{data.invoice.seller_gstin}</span>
                    </p>
                  )}
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Customer</p>
                  <p className="text-sm font-semibold">{data.invoice.billing_name}</p>
                  {addressLines(data.invoice.billing_address as Address).map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                  <p>
                    Place of supply: {data.invoice.billing_state ?? "—"}
                    {data.invoice.place_of_supply_code && ` (${data.invoice.place_of_supply_code})`}
                  </p>
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
                    {data.lines.map((l) => (
                      <tr key={l.line_no} className="border-b border-border align-top">
                        <td className="py-1.5 pr-2">{l.line_no}</td>
                        <td className="py-1.5 pr-2">
                          {l.description}
                          {l.size && <span className="text-muted-foreground"> · Size {l.size}</span>}
                        </td>
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
                  {amountInWords(Number(data.returnInvoice.total))}
                </p>
                <div className="space-y-1 sm:min-w-[240px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Taxable value</span>
                    <span>₹{money(data.returnInvoice.taxable_value)}</span>
                  </div>
                  {intra ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">CGST</span>
                        <span>₹{money(data.returnInvoice.cgst_amount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SGST</span>
                        <span>₹{money(data.returnInvoice.sgst_amount)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IGST</span>
                      <span>₹{money(data.returnInvoice.igst_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-foreground pt-1 text-sm font-bold">
                    <span>Total taken back (incl. GST)</span>
                    <span>₹{money(data.returnInvoice.total)}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-3 space-y-1 text-[11px]">
                <p>
                  Takes back the goods above from tax invoice {data.invoice.invoice_number}. Any refund to the customer is
                  made separately, as per the AllBoutiqs return policy.
                </p>
                <p className="font-medium">
                  Issued on behalf of the seller through {COMPANY.legalName}, GSTIN {COMPANY.gstin}
                </p>
                <p className="text-muted-foreground">Computer-generated; no signature needed.</p>
              </div>

              <Button
                onClick={() =>
                  printElement(document.getElementById("return-invoice-content"), `Return invoice ${data.returnInvoice.return_invoice_number}`)
                }
                className="w-full gap-2 print:hidden"
              >
                <Printer className="h-4 w-4" /> Print / Save as PDF
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
