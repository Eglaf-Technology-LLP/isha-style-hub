import { useEffect, useState } from "react";
import { FileText, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  VENDOR_EARNING_COLUMNS,
  ZERO_FEES,
  addFees,
  toVendorOrderEarning,
  type FeeBreakdown,
  type VendorOrderEarning,
} from "@/hooks/useVendorEarnings";
import { openPayoutProof } from "@/lib/payoutProof";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";

export interface BreakdownPayout {
  id: string;
  vendorName?: string;
  netPayable: number;
  paymentReference?: string | null;
  paymentProofPath?: string | null;
}

const FEE_COLUMNS: [keyof FeeBreakdown, string][] = [
  ["techFee", "Technology fee"],
  ["feeGst", "GST on fees"],
  ["gateway", "Payment gateway"],
  ["courierAndCod", "Courier & COD"],
  ["tcs", "GST TCS"],
  ["tds", "Income-tax TDS"],
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const money = (n: number) => formatMoney(n);
const minus = (n: number) => (n ? `-${formatMoney(n)}` : "—");

// One payout, order by order: what each sold for and every charge taken off
// before the amount transferred - the same figures the boutique's earnings
// and statements use. For admins (Payouts) and boutiques (their dashboard).
export function PayoutBreakdownDialog({ payout, size = "sm" }: { payout: BreakdownPayout; size?: "sm" | "xs" }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<VendorOrderEarning[] | null>(null);

  useEffect(() => {
    if (!open || rows) return;
    supabase
      .from("vendor_orders")
      .select(VENDOR_EARNING_COLUMNS)
      .eq("payout_id", payout.id)
      .order("delivered_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          toast.error("Couldn't load the breakdown");
          setRows([]);
          return;
        }
        setRows((data ?? []).map(toVendorOrderEarning));
      });
  }, [open, rows, payout.id]);

  const totals = (rows ?? []).reduce(
    (t, o) => ({
      gross: r2(t.gross + o.grossSales),
      commission: r2(t.commission + o.commissionAmount),
      fees: addFees(t.fees, o.fees),
      net: r2(t.net + o.netPayable),
    }),
    { gross: 0, commission: 0, fees: ZERO_FEES, net: 0 },
  );
  const feeCols = FEE_COLUMNS.filter(([k]) => (rows ?? []).some((o) => o.fees[k] !== 0));
  const deductions = r2(totals.gross - totals.net);

  const showProof = async () => {
    if (!payout.paymentProofPath) return;
    const problem = await openPayoutProof(payout.paymentProofPath);
    if (problem) toast.error(problem);
  };

  return (
    <>
      <Button size="sm" variant="outline" className={size === "xs" ? "h-7 px-2 text-xs" : undefined} onClick={() => setOpen(true)}>
        <Receipt className="h-3.5 w-3.5 mr-1" /> Breakdown
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payout breakdown{payout.vendorName ? ` - ${payout.vendorName}` : ""}</DialogTitle>
            <DialogDescription>
              Each order's sale and every charge taken off it. Sale - commission - fees &amp; taxes = the amount transferred.
            </DialogDescription>
          </DialogHeader>

          {rows === null ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No orders in this payout.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead className="text-right">Sale</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      {feeCols.map(([k, label]) => (
                        <TableHead key={k} className="text-right">
                          {label}
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">#{o.orderId.slice(0, 8).toUpperCase()}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{o.deliveredAt ? formatDate(new Date(o.deliveredAt)) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(o.grossSales)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {minus(o.commissionAmount)}
                          {o.commissionRate ? <span className="block text-[10px]">{o.commissionRate}%</span> : null}
                        </TableCell>
                        {feeCols.map(([k]) => (
                          <TableCell key={k} className="text-right tabular-nums text-muted-foreground">
                            {minus(o.fees[k])}
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums font-medium">{money(o.netPayable)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-medium">
                        Total ({rows.length} order{rows.length === 1 ? "" : "s"})
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(totals.gross)}</TableCell>
                      <TableCell className="text-right tabular-nums">{minus(totals.commission)}</TableCell>
                      {feeCols.map(([k]) => (
                        <TableCell key={k} className="text-right tabular-nums">
                          {minus(totals.fees[k])}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums font-semibold">{money(totals.net)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              <div className="grid gap-2 rounded-lg bg-muted p-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Sales</p>
                  <p className="font-medium tabular-nums">{money(totals.gross)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Charges taken off</p>
                  <p className="font-medium tabular-nums text-destructive">-{money(deductions)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount transferred</p>
                  <p className="font-semibold tabular-nums">{money(payout.netPayable)}</p>
                </div>
              </div>
              {Math.abs(totals.net - payout.netPayable) >= 0.01 && (
                <p className="text-xs text-amber-700">
                  The orders add up to {money(totals.net)}, the payout is {money(payout.netPayable)} - an order was changed after the
                  payout was prepared.
                </p>
              )}
            </>
          )}

          {(payout.paymentReference || payout.paymentProofPath) && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">
                {payout.paymentReference ? (
                  <>
                    Bank reference (UTR): <span className="font-mono text-foreground">{payout.paymentReference}</span>
                  </>
                ) : null}
              </span>
              {payout.paymentProofPath && (
                <Button size="sm" variant="outline" onClick={showProof}>
                  <FileText className="h-3.5 w-3.5 mr-1" /> View transfer proof
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
