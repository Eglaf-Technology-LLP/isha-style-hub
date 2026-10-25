import { useEffect, useMemo, useState } from "react";
import { format, subMonths } from "date-fns";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { buildWorkbook } from "@/lib/excelImportExport";
import { fiscalYearOf, orderRows, periodRange, type StatementLine } from "@/lib/statement";

type Period = "this-month" | "last-month" | "this-fy" | "custom";
type Scope = "completed" | "all";

const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const tcsOf = (l: StatementLine) => n(l.tcs_cgst) + n(l.tcs_sgst) + n(l.tcs_igst);
const platformFeesOf = (l: StatementLine) => n(l.commission) + n(l.tech_fee) + n(l.fee_gst);
const shippingFeesOf = (l: StatementLine) => n(l.courier) + n(l.cod_charge);

// Reports (Extra list H + I): for a period, the boutique's completed orders
// and every amount between what customers paid and what the boutique is
// paid - coupon, GST, platform fees, transaction fees, shipping, TCS, TDS -
// from the same per-order lines as the downloadable statement.
export function VendorReports({ vendorId }: { vendorId: string }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [period, setPeriod] = useState<Period>("this-month");
  const [scope, setScope] = useState<Scope>("completed");
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [lines, setLines] = useState<StatementLine[] | null>(null);

  const [rangeFrom, rangeTo] = useMemo(() => {
    if (period === "this-month") return periodRange("monthly", { month: today.slice(0, 7) });
    if (period === "last-month") return periodRange("monthly", { month: format(subMonths(new Date(), 1), "yyyy-MM") });
    if (period === "this-fy") return periodRange("yearly", { fy: fiscalYearOf(new Date()) });
    return [from, to] as [string, string];
  }, [period, from, to, today]);

  useEffect(() => {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) return;
    let alive = true;
    setLines(null);
    supabase.rpc("statement_lines", { _vendor_id: vendorId, _from: rangeFrom, _to: rangeTo }).then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        toast.error(error.message);
        setLines([]);
      } else setLines(data ?? []);
    });
    return () => {
      alive = false;
    };
  }, [vendorId, rangeFrom, rangeTo]);

  const shown = useMemo(
    () => (lines ?? []).filter((l) => (scope === "completed" ? l.status === "delivered" : l.status !== "cancelled")),
    [lines, scope],
  );

  const sum = (f: (l: StatementLine) => number) => r2(shown.reduce((s, l) => s + f(l), 0));
  const paid = sum((l) => n(l.goods_value));
  const discount = sum((l) => n(l.discount));
  const shippingCredit = sum((l) => n(l.shipping_credit));
  const deductions: [string, number, string?][] = [
    ["Marketplace commission", sum((l) => n(l.commission)), "Platform fee"],
    ["Technology & service fee", sum((l) => n(l.tech_fee)), "Platform fee"],
    ["GST on AllBoutiqs fees", sum((l) => n(l.fee_gst)), "18% on the two fees above"],
    ["Payment gateway fee", sum((l) => n(l.gateway_fee)), "Transaction fee on online payments"],
    ["Courier & shipping", sum((l) => n(l.courier)), "Shipping fee, when charged to you"],
    ["COD handling charge", sum((l) => n(l.cod_charge))],
    ["GST TCS", sum(tcsOf), "Section 52, CGST Act - claim it in your GST return"],
    ["Income-tax TDS", sum((l) => n(l.tds)), "Section 194-O - claim it in your income-tax return"],
  ];
  const deducted = r2(deductions.reduce((s, [, v]) => s + v, 0));
  const payout = sum((l) => n(l.net_payout));
  // Anything the lines above don't explain (e.g. TCS after a return).
  const other = r2(payout - (paid + shippingCredit - deducted));
  const gst = sum((l) => n(l.gst));
  const productValue = sum((l) => n(l.product_value));

  const download = () =>
    buildWorkbook(orderRows(shown, false), `allboutiqs-report-${scope}-${rangeFrom}-to-${rangeTo}.xlsx`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Reports</h3>
          <p className="text-sm text-muted-foreground">
            Orders placed {formatDate(rangeFrom)} to {formatDate(rangeTo)} - what customers paid, every charge and tax,
            and your payout.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rep-period">Period</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger id="rep-period" className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this-month">This month</SelectItem>
                <SelectItem value="last-month">Last month</SelectItem>
                <SelectItem value="this-fy">This financial year</SelectItem>
                <SelectItem value="custom">Choose dates</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="rep-from">From</Label>
                <Input id="rep-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rep-to">To</Label>
                <Input id="rep-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="rep-scope">Orders</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger id="rep-scope" className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">Completed (delivered)</SelectItem>
                <SelectItem value="all">All, except cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={download} disabled={!shown.length}>
            <Download className="mr-2 h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      {lines === null ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label={scope === "completed" ? "Completed orders" : "Orders"} value={String(shown.length)} />
            <Tile label="Paid by customers" value={formatMoney(paid)} note="Including GST, after coupons" />
            <Tile label="Charges & taxes" value={`-${formatMoney(deducted)}`} tone="minus" />
            <Tile label="Your payout" value={formatMoney(payout)} tone="strong" />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">From sale to payout</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-border text-sm">
                  <Line label="Sales at your prices" value={formatMoney(r2(paid + discount))} />
                  {discount > 0 && <Line label="Coupon discount" note="Your items' share of coupons" value={`-${formatMoney(discount)}`} minus />}
                  <Line label="Paid by customers" value={formatMoney(paid)} strong />
                  {shippingCredit > 0 && <Line label="Shipping charged to customers" value={`+${formatMoney(shippingCredit)}`} />}
                  {deductions
                    .filter(([, v]) => v !== 0)
                    .map(([label, v, note]) => (
                      <Line key={label} label={label} note={note} value={`-${formatMoney(v)}`} minus />
                    ))}
                  {Math.abs(other) >= 0.01 && (
                    <Line label="Other adjustments" note="Returns and refunds" value={`${other < 0 ? "-" : "+"}${formatMoney(Math.abs(other))}`} minus={other < 0} />
                  )}
                  <Line label="Your payout" value={formatMoney(payout)} strong />
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">GST on your sales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <dl className="divide-y divide-border">
                  <Line label="Taxable value" value={formatMoney(productValue)} />
                  <Line label="GST collected in the price" value={formatMoney(gst)} />
                  <Line label="GST TCS deducted by AllBoutiqs" value={formatMoney(sum(tcsOf))} />
                </dl>
                <p className="text-xs text-muted-foreground">
                  The GST in your prices is yours to pay in your GST return - it isn't deducted from your payout. The GST
                  TCS deducted is credited to your GSTIN and can be claimed there. Month-wise GST and quarter-wise TDS
                  are in Payouts &gt; Download Statement.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Orders</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {shown.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  {scope === "completed" ? "No delivered orders placed in this period." : "No orders placed in this period."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Placed</TableHead>
                        <TableHead>Delivered</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Coupon</TableHead>
                        <TableHead className="text-right">GST</TableHead>
                        <TableHead className="text-right">Platform fees</TableHead>
                        <TableHead className="text-right">Transaction fee</TableHead>
                        <TableHead className="text-right">Shipping</TableHead>
                        <TableHead className="text-right">TCS</TableHead>
                        <TableHead className="text-right">TDS</TableHead>
                        <TableHead className="text-right">Payout</TableHead>
                        <TableHead>Payout status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.map((l) => (
                        <TableRow key={l.vendor_order_id}>
                          <TableCell className="font-mono whitespace-nowrap">{l.order_number}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(l.order_date)}</TableCell>
                          <TableCell className="whitespace-nowrap">{l.delivered_on ? formatDate(l.delivered_on) : "-"}</TableCell>
                          <TableCell>{l.payment_method === "cod" ? "COD" : "Prepaid"}</TableCell>
                          <Money v={n(l.goods_value)} />
                          <Money v={n(l.discount)} />
                          <Money v={n(l.gst)} />
                          <Money v={platformFeesOf(l)} />
                          <Money v={n(l.gateway_fee)} />
                          <Money v={shippingFeesOf(l)} />
                          <Money v={tcsOf(l)} />
                          <Money v={n(l.tds)} />
                          <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">{formatMoney(n(l.net_payout))}</TableCell>
                          <TableCell>
                            <Badge variant={l.payout_status === "paid" ? "default" : "outline"}>
                              {l.payout_status === "paid" ? "Paid" : l.payout_status === "sent" ? "Sent" : "Pending"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "minus" | "strong" }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === "minus" ? "text-destructive" : tone === "strong" ? "text-primary" : ""}`}>
          {value}
        </p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

function Line({ label, value, note, minus, strong }: { label: string; value: string; note?: string; minus?: boolean; strong?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 py-2 ${strong ? "font-semibold" : ""}`}>
      <dt>
        {label}
        {note && <span className="block text-xs font-normal text-muted-foreground">{note}</span>}
      </dt>
      <dd className={`tabular-nums whitespace-nowrap ${minus ? "text-destructive" : ""}`}>{value}</dd>
    </div>
  );
}

function Money({ v }: { v: number }) {
  return <TableCell className="text-right tabular-nums whitespace-nowrap">{v ? formatMoney(v) : "-"}</TableCell>;
}
