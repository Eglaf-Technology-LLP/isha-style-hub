import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { COMPANY } from "@/lib/company";
import { printElement } from "@/lib/printElement";
import { formatDate } from "@/lib/dates";
import { amountInWords } from "@/lib/amountInWords";
import { formatEwbNumber } from "@/lib/ewayBill";

type Address = { address_line1?: string; address_line2?: string; city?: string; state?: string; pincode?: string } | null;

const money = (n: number) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const addressLines = (a: Address) =>
  a ? [[a.address_line1, a.address_line2].filter(Boolean).join(", "), [a.city, a.state, a.pincode].filter(Boolean).join(", ")].filter(Boolean) : [];

interface Loaded {
  challan: Tables<"delivery_challans">;
  invoice: Tables<"invoices">;
  lines: Tables<"invoice_lines">[];
  ewbNumbers: string[];
}

// The delivery challan a boutique's goods travel on from the AllBoutiqs
// warehouse to the customer (they were invoiced to the customer when they
// left the boutique). Issued for parts over the e-way bill limit, whose
// e-way bill is made on it. Prints like the invoice.
export function DeliveryChallanButton({ challanId, label = "Challan" }: { challanId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data) return;
    (async () => {
      const { data: challan, error: challanErr } = await supabase.from("delivery_challans").select("*").eq("id", challanId).maybeSingle();
      if (challanErr || !challan) {
        setError(challanErr?.message ?? "Challan not found");
        return;
      }
      const [{ data: invoice }, { data: lines }, { data: bills }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", challan.invoice_id).maybeSingle(),
        supabase.from("invoice_lines").select("*").eq("invoice_id", challan.invoice_id).order("line_no"),
        supabase.from("eway_bills").select("ewb_number").eq("challan_id", challanId).eq("status", "active"),
      ]);
      if (!invoice) {
        setError("The invoice for this challan couldn't be loaded");
        return;
      }
      setData({
        challan,
        invoice,
        lines: lines ?? [],
        ewbNumbers: (bills ?? []).map((b) => b.ewb_number).filter((n): n is string => !!n),
      });
    })();
  }, [open, data, challanId]);

  const intra = data?.invoice.supply_type !== "inter_state";

  return (
    <>
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setOpen(true)}>
        <FileText className="h-3 w-3" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delivery Challan</DialogTitle>
          </DialogHeader>
          {error ? (
            <p className="text-sm text-destructive py-6 text-center">{error}</p>
          ) : !data ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div id="challan-content" className="space-y-4 text-xs text-foreground">
              <div className="flex items-start justify-between gap-4 border-b-2 border-foreground pb-3">
                <div>
                  <p className="text-lg font-bold tracking-wide">DELIVERY CHALLAN</p>
                  <p className="text-muted-foreground">{data.challan.reason}</p>
                </div>
                <div className="text-right space-y-0.5">
                  <p>
                    <span className="text-muted-foreground">Challan No: </span>
                    <span className="font-mono font-semibold">{data.challan.challan_number}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Date: </span>
                    {formatDate(new Date(data.challan.issued_at))}
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
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Supplier (bill from)</p>
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
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Dispatch from</p>
                  <p className="text-sm font-semibold">{data.challan.dispatch_from_name}</p>
                  {addressLines(data.challan.dispatch_from_address as Address).map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Bill to</p>
                  <p className="text-sm font-semibold">{data.invoice.billing_name}</p>
                  <p>
                    Unregistered · Place of supply: {data.invoice.billing_state ?? "—"}
                    {data.invoice.place_of_supply_code && ` (${data.invoice.place_of_supply_code})`}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ship to</p>
                  <p className="text-sm font-semibold">{data.challan.ship_to_name}</p>
                  {addressLines(data.challan.ship_to_address as Address).map((l) => (
                    <p key={l}>{l}</p>
                  ))}
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
                      <th className="py-1.5 pr-2 text-right">{intra ? "CGST + SGST" : "IGST"}</th>
                      <th className="py-1.5 text-right">Value</th>
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
                        <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                          {Number(l.gst_rate)}% · {money(Number(l.cgst_amount) + Number(l.sgst_amount) + Number(l.igst_amount))}
                        </td>
                        <td className="py-1.5 text-right font-medium">{money(l.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <p className="sm:max-w-[55%]">
                  <span className="text-muted-foreground">Value in words: </span>
                  {amountInWords(Number(data.challan.value))}
                </p>
                <div className="flex justify-between gap-6 border-t border-foreground pt-1 text-sm font-bold sm:min-w-[240px]">
                  <span>Value (incl. GST)</span>
                  <span>₹{money(Number(data.challan.value))}</span>
                </div>
              </div>

              <div className="border-t border-border pt-3 space-y-1 text-[11px]">
                <p>
                  Not a tax invoice: these goods were invoiced to the customer on {data.invoice.invoice_number}. This challan
                  covers their movement from the AllBoutiqs warehouse to the customer.
                </p>
                <p className="font-medium">
                  Issued on behalf of the supplier through {COMPANY.legalName}, GSTIN {COMPANY.gstin}
                </p>
                <p className="text-muted-foreground">Computer-generated; no signature needed.</p>
              </div>

              <Button
                onClick={() => printElement(document.getElementById("challan-content"), `Delivery challan ${data.challan.challan_number}`)}
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
