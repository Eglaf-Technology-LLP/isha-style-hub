import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildWorkbookSheets } from "@/lib/excelImportExport";
import { printElement } from "@/lib/printElement";
import {
  applyFilters,
  fiscalYearOf,
  monthlyGstRows,
  orderRows,
  ORDER_FILTERS,
  PAYMENT_FILTERS,
  PAYOUT_FILTERS,
  periodRange,
  quarterlyTdsRows,
  totals,
  type OrderFilter,
  type PaymentFilter,
  type PayoutFilter,
  type PeriodKind,
  type StatementLine,
} from "@/lib/statement";

const ALL = "__all__";
const money = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cell = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v ?? "");

function ReportTable({ rows, countColumns = [] }: { rows: Record<string, unknown>[]; countColumns?: string[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-3">Nothing in this period.</p>;
  const headers = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-y border-foreground text-left">
            {headers.map((h) => (
              <th key={h} className="py-1.5 pr-2 whitespace-nowrap font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border">
              {headers.map((h) => (
                <td key={h} className={`py-1 pr-2 whitespace-nowrap ${typeof r[h] === "number" ? "text-right" : ""}`}>
                  {countColumns.includes(h) ? String(r[h]) : cell(r[h])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// "Download Statement" for the Payouts section: every charge and tax per
// order for a period, with monthly GST/TCS/TDS and quarterly TDS summaries,
// as Excel or PDF - each report on its own or the whole statement. A
// boutique gets its own data; admins pick one boutique or all.
export function StatementDownload({ vendorId, admin = false }: { vendorId?: string; admin?: boolean }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PeriodKind>("monthly");
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [fy, setFy] = useState(fiscalYearOf(new Date()));
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [boutique, setBoutique] = useState<string>(vendorId ?? ALL);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [payoutFilter, setPayoutFilter] = useState<PayoutFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [loading, setLoading] = useState(false);

  const [rangeFrom, rangeTo] = periodRange(kind, { date, month, fy, from, to });
  const allBoutiques = admin && boutique === ALL;

  useEffect(() => {
    if (open && admin) supabase.from("vendors").select("id, name").order("name").then(({ data }) => setVendors(data ?? []));
  }, [open, admin]);

  useEffect(() => {
    if (!open || !rangeFrom || !rangeTo || rangeFrom > rangeTo) return;
    let alive = true;
    setLoading(true);
    supabase
      .rpc("statement_lines", { _vendor_id: boutique === ALL ? null : boutique, _from: rangeFrom, _to: rangeTo })
      .then(({ data, error }) => {
        if (!alive) return;
        setLoading(false);
        if (error) return toast.error(error.message);
        setLines(data ?? []);
      });
    return () => {
      alive = false;
    };
  }, [open, boutique, rangeFrom, rangeTo]);

  const filtered = useMemo(
    () => applyFilters(lines, { order: orderFilter, payout: payoutFilter, payment: paymentFilter }),
    [lines, orderFilter, payoutFilter, paymentFilter],
  );
  const reports = useMemo(
    () => ({
      orders: orderRows(filtered, allBoutiques),
      gst: monthlyGstRows(filtered, allBoutiques),
      tds: quarterlyTdsRows(filtered, allBoutiques),
    }),
    [filtered, allBoutiques],
  );
  const t = totals(filtered);
  const who = allBoutiques ? "all-boutiques" : (vendors.find((v) => v.id === boutique)?.name ?? "boutique").replace(/\W+/g, "-").toLowerCase();
  const fileBase = `allboutiqs-statement-${who}-${rangeFrom}-to-${rangeTo}`;
  const titleLine = `Statement ${format(new Date(rangeFrom), "dd MMM yyyy")} - ${format(new Date(rangeTo), "dd MMM yyyy")}`;

  const SHEETS = {
    orders: { name: "Orders", rows: reports.orders },
    gst: { name: "Monthly GST & TCS", rows: reports.gst },
    tds: { name: "TDS by quarter", rows: reports.tds },
  } as const;
  const excel = (keys: (keyof typeof SHEETS)[], suffix = "") =>
    buildWorkbookSheets(keys.map((k) => SHEETS[k]), `${fileBase}${suffix}.xlsx`);
  const pdf = (elementId: string, label: string) =>
    printElement(document.getElementById(elementId), `${label} - ${titleLine}`, { landscape: true });

  const sectionButtons = (key: keyof typeof SHEETS, elementId: string) => (
    <span className="flex gap-1 print:hidden">
      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => excel([key], `-${key}`)}>
        <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
      </Button>
      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => pdf(elementId, SHEETS[key].name)}>
        <FileText className="h-3.5 w-3.5" /> PDF
      </Button>
    </span>
  );

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Download className="h-4 w-4" /> Download Statement
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Download statement</DialogTitle>
            <DialogDescription>
              Every charge and tax per order (by order date), with the monthly GST, GST TCS and income-tax TDS summary
              and TDS by quarter - as Excel or PDF.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as PeriodKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly (Mon-Sun)</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Financial year</SelectItem>
                  <SelectItem value="custom">Custom dates</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{kind === "custom" ? "From - to" : kind === "yearly" ? "Year" : kind === "monthly" ? "Month" : "Date"}</Label>
              {(kind === "daily" || kind === "weekly") && <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
              {kind === "monthly" && <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />}
              {kind === "yearly" && (
                <Select value={String(fy)} onValueChange={(v) => setFy(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2].map((back) => {
                      const y = fiscalYearOf(new Date()) - back;
                      return (
                        <SelectItem key={y} value={String(y)}>
                          FY {y}-{String((y + 1) % 100).padStart(2, "0")}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
              {kind === "custom" && (
                <div className="flex gap-2">
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
                  <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To" />
                </div>
              )}
            </div>
            {admin && (
              <div className="space-y-1.5">
                <Label>Boutique</Label>
                <Select value={boutique} onValueChange={setBoutique}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All boutiques</SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
              <Label>Show</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:max-w-3xl">
                <Select value={orderFilter} onValueChange={(v) => setOrderFilter(v as OrderFilter)}>
                  <SelectTrigger className="text-xs" aria-label="Order status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_FILTERS.map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={payoutFilter} onValueChange={(v) => setPayoutFilter(v as PayoutFilter)}>
                  <SelectTrigger className="text-xs" aria-label="Payout">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYOUT_FILTERS.map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={paymentFilter} onValueChange={(v) => setPaymentFilter(v as PaymentFilter)}>
                  <SelectTrigger className="text-xs" aria-label="Payment type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_FILTERS.map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border py-3">
            <p className="text-sm">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin inline" />
              ) : (
                <>
                  <span className="font-medium">{t.orders} orders</span> · product value {money(t.productValue)} · GST{" "}
                  {money(t.gst)} · AllBoutiqs fees incl. GST {money(t.fees)} · gateway {money(t.gateway)} · TCS{" "}
                  {money(t.tcs)} · TDS {money(t.tds)} · <span className="font-medium">net payout {money(t.payout)}</span>
                </>
              )}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" disabled={loading} onClick={() => excel(["orders", "gst", "tds"])}>
                <FileSpreadsheet className="h-4 w-4" /> Whole statement · Excel
              </Button>
              <Button variant="outline" className="gap-2" disabled={loading} onClick={() => pdf("statement-all", "Statement")}>
                <FileText className="h-4 w-4" /> Whole statement · PDF
              </Button>
            </div>
          </div>

          <div id="statement-all" className="space-y-6 text-foreground">
            <div className="hidden print:block">
              <p className="text-lg font-bold">AllBoutiqs · {titleLine}</p>
              <p className="text-xs">{allBoutiques ? "All boutiques" : vendors.find((v) => v.id === boutique)?.name ?? ""}</p>
            </div>
            <section id="statement-orders" className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Orders, charges &amp; taxes</h3>
                {sectionButtons("orders", "statement-orders")}
              </div>
              <ReportTable rows={reports.orders} />
            </section>
            <section id="statement-gst" className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Monthly GST, GST TCS &amp; TDS summary</h3>
                {sectionButtons("gst", "statement-gst")}
              </div>
              <p className="text-xs text-muted-foreground">
                GST TCS is 0.25% CGST + 0.25% SGST when the customer is in the boutique's state, else 0.5% IGST, on the
                net taxable value after returns - credited to the boutique's GST cash ledger.
              </p>
              <ReportTable rows={reports.gst} countColumns={["Orders"]} />
            </section>
            <section id="statement-tds" className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Income-tax TDS by quarter</h3>
                {sectionButtons("tds", "statement-tds")}
              </div>
              <ReportTable rows={reports.tds} countColumns={["Orders"]} />
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
