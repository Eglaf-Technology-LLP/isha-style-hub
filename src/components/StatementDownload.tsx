import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
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
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/format";
import {
  b2clRows,
  b2csRows,
  cdnurRows,
  creditNoteRows,
  courierB2csRows,
  courierInvoiceRows,
  documentsIssuedRows,
  ecoRows,
  feeInvoiceRows,
  hsnRows,
  payoutRows,
  reconciliationRows,
  salesRegisterRows,
  tcsRows,
  type CourierInvoice,
  type CreditNote,
  type FeeInvoice,
  type ReconOrder,
  type SalesInvoice,
} from "@/lib/gstReports";

// Every page of a query (PostgREST returns at most 1,000 rows at a time).
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const chunks = <T,>(xs: T[], size = 150) => Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, i * size + size));

interface TaxDocs {
  sales: SalesInvoice[];
  creditNotes: CreditNote[];
  fees: FeeInvoice[];
  courier: CourierInvoice[];
  gstins: Map<string, string>;
}
const NO_DOCS: TaxDocs = { sales: [], creditNotes: [], fees: [], courier: [], gstins: new Map() };

const ALL = "__all__";
const money = (v: number) => `${formatINR(v)}`;
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
  // Invoices (by invoice date) for the GST return reports.
  const [docs, setDocs] = useState<TaxDocs>(NO_DOCS);
  const [docsLoading, setDocsLoading] = useState(false);

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

  useEffect(() => {
    if (!open || !rangeFrom || !rangeTo || rangeFrom > rangeTo) return;
    let alive = true;
    setDocsLoading(true);
    const vendorFilter = boutique === ALL ? null : boutique;
    const fromTs = `${rangeFrom}T00:00:00+05:30`;
    const toTs = `${format(addDays(new Date(rangeTo), 1), "yyyy-MM-dd")}T00:00:00+05:30`;
    (async () => {
      const sales = await allRows<SalesInvoice>((a, b) => {
        let q = supabase.from("invoices").select("*, invoice_lines(*)").gte("issued_at", fromTs).lt("issued_at", toTs);
        if (vendorFilter) q = q.eq("vendor_id", vendorFilter);
        return q.order("invoice_number").range(a, b);
      });
      const creditNotes = await allRows<CreditNote>((a, b) => {
        let q = supabase.from("credit_notes").select("*, credit_note_lines(*)").gte("issued_at", fromTs).lt("issued_at", toTs);
        if (vendorFilter) q = q.eq("vendor_id", vendorFilter);
        return q.order("credit_note_number").range(a, b);
      });
      const fees = await allRows<FeeInvoice>((a, b) => {
        let q = supabase.from("fee_invoices").select("*").gte("issued_at", fromTs).lt("issued_at", toTs);
        if (vendorFilter) q = q.eq("vendor_id", vendorFilter);
        return q.order("invoice_number").range(a, b);
      });
      const gstins = new Map<string, string>();
      const { data: vendorRows } = await (vendorFilter
        ? supabase.from("vendors").select("id, gst_number").eq("id", vendorFilter)
        : supabase.from("vendors").select("id, gst_number"));
      (vendorRows ?? []).forEach((v) => v.gst_number && gstins.set(v.id, v.gst_number));
      const { data: kycRows } = await (vendorFilter
        ? supabase.from("vendor_kyc").select("vendor_id, gstin").eq("vendor_id", vendorFilter)
        : supabase.from("vendor_kyc").select("vendor_id, gstin"));
      (kycRows ?? []).forEach((k) => k.gstin && gstins.set(k.vendor_id, k.gstin));
      // AllBoutiqs' own side: its courier invoices to customers.
      let courier: CourierInvoice[] = [];
      if (admin) {
        courier = await allRows<CourierInvoice>((a, b) =>
          supabase.from("platform_invoices").select("*").gte("issued_at", fromTs).lt("issued_at", toTs).order("invoice_number").range(a, b),
        );
      }
      return { sales, creditNotes, fees, courier, gstins };
    })()
      .then((d) => alive && setDocs(d))
      .catch((e: Error) => alive && toast.error(e.message))
      .finally(() => alive && setDocsLoading(false));
    return () => {
      alive = false;
    };
  }, [open, admin, boutique, rangeFrom, rangeTo]);

  // Admins: the order behind each boutique part, for the order-by-order check.
  const [orderByVendorOrder, setOrderByVendorOrder] = useState<Map<string, ReconOrder>>(new Map());
  useEffect(() => {
    if (!open || !admin || !lines.length) return;
    let alive = true;
    (async () => {
      const voToOrder = new Map<string, string>();
      for (const ids of chunks(lines.map((l) => l.vendor_order_id))) {
        const { data } = await supabase.from("vendor_orders").select("id, order_id").in("id", ids);
        (data ?? []).forEach((v) => voToOrder.set(v.id, v.order_id));
      }
      const orders = new Map<string, ReconOrder>();
      for (const ids of chunks([...new Set(voToOrder.values())])) {
        const { data } = await supabase.from("orders").select("id, total, shipping_cost, cod_charge, payment_method").in("id", ids);
        (data ?? []).forEach((o) =>
          orders.set(o.id, {
            id: o.id,
            total: Number(o.total),
            shipping_cost: Number(o.shipping_cost ?? 0),
            cod_charge: Number(o.cod_charge ?? 0),
            payment_method: o.payment_method,
          }),
        );
      }
      const out = new Map<string, ReconOrder>();
      voToOrder.forEach((orderId, voId) => {
        const o = orders.get(orderId);
        if (o) out.set(voId, o);
      });
      return out;
    })().then((m) => alive && setOrderByVendorOrder(m));
    return () => {
      alive = false;
    };
  }, [open, admin, lines]);

  const filtered = useMemo(
    () => applyFilters(lines, { order: orderFilter, payout: payoutFilter, payment: paymentFilter }),
    [lines, orderFilter, payoutFilter, paymentFilter],
  );
  const reports = useMemo(() => {
    const courierByVo = new Map(docs.courier.map((c) => [c.vendor_order_id, c]));
    return {
      orders: orderRows(filtered, allBoutiques),
      gst: monthlyGstRows(filtered, allBoutiques),
      tds: quarterlyTdsRows(filtered, allBoutiques),
      sales: salesRegisterRows(docs.sales, allBoutiques),
      b2cs: b2csRows(docs.sales, docs.creditNotes, allBoutiques),
      b2cl: b2clRows(docs.sales, allBoutiques),
      creditNotes: creditNoteRows(docs.creditNotes, allBoutiques),
      cdnur: cdnurRows(docs.creditNotes, allBoutiques),
      hsn: hsnRows(docs.sales, docs.creditNotes, allBoutiques),
      docsIssued: documentsIssuedRows(docs.sales, docs.creditNotes, allBoutiques),
      eco: ecoRows(docs.sales, docs.creditNotes, allBoutiques),
      itc: feeInvoiceRows(docs.fees, allBoutiques),
      tcs: tcsRows(filtered, docs.gstins, allBoutiques),
      payouts: payoutRows(filtered, allBoutiques),
      courier: courierInvoiceRows(docs.courier),
      courierB2cs: courierB2csRows(docs.courier),
      recon: reconciliationRows(filtered, orderByVendorOrder, courierByVo),
    };
  }, [filtered, allBoutiques, docs, orderByVendorOrder]);
  const t = totals(filtered);
  const who = allBoutiques ? "all-boutiques" : (vendors.find((v) => v.id === boutique)?.name ?? "boutique").replace(/\W+/g, "-").toLowerCase();
  const fileBase = `allboutiqs-statement-${who}-${rangeFrom}-to-${rangeTo}`;
  const titleLine = `Statement ${formatDate(new Date(rangeFrom))} - ${formatDate(new Date(rangeTo))}`;

  const SHEETS = {
    orders: { name: "Orders", rows: reports.orders },
    gst: { name: "Monthly GST & TCS", rows: reports.gst },
    tds: { name: "TDS by quarter", rows: reports.tds },
    sales: { name: "GSTR-1 Sales register", rows: reports.sales },
    b2cs: { name: "GSTR-1 B2CS", rows: reports.b2cs },
    b2cl: { name: "GSTR-1 B2CL", rows: reports.b2cl },
    creditNotes: { name: "GSTR-1 Credit notes", rows: reports.creditNotes },
    cdnur: { name: "GSTR-1 CDNUR", rows: reports.cdnur },
    hsn: { name: "GSTR-1 HSN summary", rows: reports.hsn },
    docsIssued: { name: "GSTR-1 Documents issued", rows: reports.docsIssued },
    eco: { name: "GSTR-1 Table 14 (ECO)", rows: reports.eco },
    itc: { name: admin ? "Fee invoices (B2B)" : "ITC - AllBoutiqs fee invoices", rows: reports.itc },
    tcs: { name: admin ? "GSTR-8 TCS" : "GST TCS (AllBoutiqs GSTR-8)", rows: reports.tcs },
    payouts: { name: "Payouts", rows: reports.payouts },
    courier: { name: "AllBoutiqs invoices to customers", rows: reports.courier },
    courierB2cs: { name: "AllBoutiqs B2CS", rows: reports.courierB2cs },
    recon: { name: "Order check", rows: reports.recon },
  } as const;
  type SheetKey = keyof typeof SHEETS;
  // The tax reports below the statement: [key, title, what it is for, admins only].
  const TAX_SECTIONS: [SheetKey, string, string, boolean][] = [
    ["sales", "GSTR-1 · Sales register", "Every line of every customer tax invoice issued in the period (by invoice date).", false],
    [
      "b2cs",
      "GSTR-1 · B2CS",
      "Sales to customers by place of supply and GST rate, less credit notes, through AllBoutiqs (e-commerce GSTIN).",
      false,
    ],
    ["b2cl", "GSTR-1 · B2CL", "Inter-state invoices above ₹1,00,000.", false],
    [
      "creditNotes",
      "GSTR-1 · Credit notes",
      "Issued in your name for returned pieces and for orders cancelled or not delivered after their invoice - they reduce your sales.",
      false,
    ],
    ["cdnur", "GSTR-1 · CDNUR", "Credit notes against B2CL invoices.", false],
    ["hsn", "GSTR-1 · HSN summary", "Table 12, less credit notes.", false],
    ["docsIssued", "GSTR-1 · Documents issued", "Table 13 - the invoice and credit note numbers used.", false],
    ["eco", "GSTR-1 · Table 14", "Supplies made through AllBoutiqs, which collects TCS on them - less credit notes.", false],
    [
      "itc",
      admin ? "AllBoutiqs fee invoices (its GSTR-1 B2B)" : "ITC · AllBoutiqs fee invoices",
      admin
        ? "Commission, technology fee and courier & logistics invoices to boutiques - report these as B2B so each boutique sees them in GSTR-2B."
        : "GST on AllBoutiqs' commission, technology fee and courier & logistics charge - claim it as input tax credit (GSTR-3B 4A(5)) once it shows in GSTR-2B.",
      false,
    ],
    [
      "tcs",
      admin ? "GSTR-8 · GST TCS by boutique" : "GST TCS collected by AllBoutiqs",
      admin
        ? "File in GSTR-8 by the 10th - each boutique's statement shows the same figures."
        : "AllBoutiqs files these in its GSTR-8; accept them on the GST portal and they reach your cash ledger.",
      false,
    ],
    ["payouts", "Payouts", "What reached the bank, with the UTR - match it with your bank statement.", false],
    ["courier", "AllBoutiqs invoices to customers", "AllBoutiqs' own invoices to customers for the COD charge (its GSTR-1, B2C).", true],
    ["courierB2cs", "AllBoutiqs invoices to customers · B2CS", "Those invoices by place of supply - AllBoutiqs' GSTR-1 B2CS.", true],
    [
      "recon",
      "Order check",
      "Customer paid - refunds = boutique goods (after returns) + shipping and COD charge - a refund charge kept shows as a difference; and boutique goods - fees (incl. the courier & logistics charge) - taxes - payout = 0.",
      true,
    ],
  ];
  const taxKeys = TAX_SECTIONS.filter(([, , , adminOnly]) => admin || !adminOnly).map(([k]) => k);
  const excel = (keys: SheetKey[], suffix = "") =>
    buildWorkbookSheets(keys.map((k) => SHEETS[k]), `${fileBase}${suffix}.xlsx`);
  const pdf = (elementId: string, label: string) =>
    printElement(document.getElementById(elementId), `${label} - ${titleLine}`, { landscape: true });

  const sectionButtons = (key: SheetKey, elementId: string) => (
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
              and TDS by quarter; then the GST return reports - GSTR-1 tables from the tax invoices (by invoice date), the
              AllBoutiqs fee invoices for input tax credit, GST TCS and payouts - as Excel or PDF.
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
              <Button variant="outline" className="gap-2" disabled={loading} onClick={() => excel(["orders", "gst", "tds", ...taxKeys])}>
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
            {docsLoading ? (
              <p className="text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline" /> Loading invoices…
              </p>
            ) : (
              TAX_SECTIONS.filter(([, , , adminOnly]) => admin || !adminOnly).map(([key, title, note]) => (
                <section key={key} id={`statement-${key}`} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{title}</h3>
                    {sectionButtons(key, `statement-${key}`)}
                  </div>
                  <p className="text-xs text-muted-foreground">{note}</p>
                  <ReportTable
                    rows={SHEETS[key].rows}
                    countColumns={["Orders", "Qty", "Pieces", "Total quantity", "Total number", "Cancelled", "Rate %", "GST rate %"]}
                  />
                </section>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
