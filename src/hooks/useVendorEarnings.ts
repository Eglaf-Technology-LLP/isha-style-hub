import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildWorkbook } from "@/lib/excelImportExport";
import { format } from "date-fns";
import { formatDate } from "@/lib/dates";

export interface VendorOrderEarning {
  id: string;
  orderId: string;
  createdAt: string;
  deliveredAt: string | null;
  status: string;
  // What the customer paid for this boutique's pieces (incl. GST), plus
  // the delivery charge when it goes to the boutique.
  grossSales: number;
  commissionRate: number;
  commissionAmount: number;
  // Everything else net_payable takes off (see compute_vendor_order_fees):
  // technology fee, GST on AllBoutiqs' fees, payment gateway, courier / COD
  // handling (when charged to the boutique), GST TCS and income-tax TDS.
  fees: FeeBreakdown;
  feesTotal: number;
  netPayable: number;
}

export interface FeeBreakdown {
  techFee: number;
  feeGst: number;
  gateway: number;
  courierAndCod: number;
  tcs: number;
  tds: number;
}

export interface VendorEarningsSummary {
  grossSales: number;
  commissionDeducted: number;
  fees: FeeBreakdown;
  feesTotal: number;
  // Gross Sales - Commission - Fees & taxes, to the paisa.
  netPayable: number;
  orders: VendorOrderEarning[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;
export const ZERO_FEES: FeeBreakdown = { techFee: 0, feeGst: 0, gateway: 0, courierAndCod: 0, tcs: 0, tds: 0 };
export const sumFees = (f: FeeBreakdown) => r2(f.techFee + f.feeGst + f.gateway + f.courierAndCod + f.tcs + f.tds);
export const addFees = (a: FeeBreakdown, b: FeeBreakdown): FeeBreakdown => ({
  techFee: r2(a.techFee + b.techFee),
  feeGst: r2(a.feeGst + b.feeGst),
  gateway: r2(a.gateway + b.gateway),
  courierAndCod: r2(a.courierAndCod + b.courierAndCod),
  tcs: r2(a.tcs + b.tcs),
  tds: r2(a.tds + b.tds),
});

// A nested embed via a single FK column can come back as an object or a
// one-element array depending on the client/typegen combo - same defensive
// unwrap already used in usePlatformRevenue.ts / useVendorPerformance.ts.
const unwrapOne = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

// The vendor_orders columns an earning is worked out from.
export const VENDOR_EARNING_COLUMNS =
  "id, order_id, created_at, delivered_at, status, subtotal, shipping_cost, goods_value, shipping_to_boutique, commission_rate, commission_amount, tech_fee_amount, fee_gst_amount, gateway_fee_amount, courier_charge, logistics_fee_amount, cod_handling_charge, tcs_amount, tds_amount, net_payable, rzp_reversed_amount, order:orders(payment_status, cod_charge)";

// One boutique order's sale, commission, fees and net - the same stored
// figures net_payable is made of, so Gross - Commission - Fees always equals
// Net Payable (Developer Corrections Part 8, 6).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toVendorOrderEarning(vo: any): VendorOrderEarning {
  const n = (v: unknown) => Number(v ?? 0);
  const toBoutique = !!vo.shipping_to_boutique;
  const fees: FeeBreakdown = {
    techFee: n(vo.tech_fee_amount),
    feeGst: n(vo.fee_gst_amount),
    gateway: n(vo.gateway_fee_amount),
    // The courier & logistics charge per piece (its GST is in feeGst); a COD
    // charge the customer paid at checkout isn't the boutique's (Extra list M).
    courierAndCod: r2(
      n(vo.logistics_fee_amount) +
        (toBoutique ? n(vo.courier_charge) : 0) +
        (n(unwrapOne(vo.order)?.cod_charge) > 0 ? 0 : n(vo.cod_handling_charge)),
    ),
    tcs: n(vo.tcs_amount),
    tds: n(vo.tds_amount),
  };
  return {
    id: vo.id,
    orderId: vo.order_id,
    createdAt: vo.created_at,
    deliveredAt: vo.delivered_at ?? null,
    status: vo.status,
    grossSales: r2((vo.goods_value != null ? n(vo.goods_value) : n(vo.subtotal)) + (toBoutique ? n(vo.shipping_cost) : 0)),
    commissionRate: n(vo.commission_rate),
    commissionAmount: n(vo.commission_amount),
    fees,
    feesTotal: sumFees(fees),
    // What the boutique is actually paid (less anything Razorpay took back).
    netPayable: r2(n(vo.net_payable) - n(vo.rzp_reversed_amount)),
  };
}

// The commission/net_payable breakdown a vendor is entitled to see was
// already RLS-permitted on their own vendor_orders rows - this hook is the
// first thing to actually surface it, rather than only the commission
// *rate* they already saw on their dashboard stat card.
export function useVendorEarnings(vendorId: string | undefined) {
  const [summary, setSummary] = useState<VendorEarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (vendorId) {
      fetchEarnings();
    } else {
      setLoading(false);
    }
  }, [vendorId]);

  const fetchEarnings = async () => {
    if (!vendorId) return;
    setLoading(true);
    try {
      const { data: vendorOrders, error } = await supabase
        .from("vendor_orders")
        .select(VENDOR_EARNING_COLUMNS)
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Same exclusion every other revenue surface in this app applies -
      // a cancelled vendor_order's figures must not count as live earnings.
      const eligible = (vendorOrders || []).filter((vo) => {
        const order = unwrapOne(vo.order);
        // A part cancelled / back undelivered after it left the boutique still
        // owes the courier & logistics charge.
        return (order?.payment_status === "paid" && vo.status !== "cancelled") || (vo.status === "cancelled" && Number(vo.logistics_fee_amount) > 0);
      });

      const orders: VendorOrderEarning[] = eligible.map(toVendorOrderEarning);

      const fees = orders.reduce<FeeBreakdown>((t, o) => addFees(t, o.fees), ZERO_FEES);
      setSummary({
        grossSales: r2(orders.reduce((s, o) => s + o.grossSales, 0)),
        commissionDeducted: r2(orders.reduce((s, o) => s + o.commissionAmount, 0)),
        fees,
        feesTotal: sumFees(fees),
        netPayable: r2(orders.reduce((s, o) => s + o.netPayable, 0)),
        orders,
      });
    } catch (error) {
      console.error("Error fetching vendor earnings:", error);
    } finally {
      setLoading(false);
    }
  };

  // Per-order transaction detail, for the vendor's own accounting - not
  // just the period totals the summary cards show. One row per vendor_order
  // (the actual grain commission/net_payable exist at) rather than a fake
  // per-product split of a figure that's never computed per line item.
  const exportStatement = async () => {
    if (!summary || summary.orders.length === 0) return;

    const vendorOrderIds = summary.orders.map((o) => o.id);
    const { data: items } = await supabase
      .from("order_items")
      .select("vendor_order_id, product_title")
      .in("vendor_order_id", vendorOrderIds);

    const productsByVendorOrder = new Map<string, string[]>();
    (items ?? []).forEach((item) => {
      if (!item.vendor_order_id) return;
      const list = productsByVendorOrder.get(item.vendor_order_id) ?? [];
      list.push(item.product_title);
      productsByVendorOrder.set(item.vendor_order_id, list);
    });

    const rows = summary.orders.map((o) => ({
      "Order Date": formatDate(o.createdAt),
      "Order ID": o.orderId,
      Products: (productsByVendorOrder.get(o.id) ?? []).join(", "),
      "Gross Sales": o.grossSales,
      "Commission Rate %": o.commissionRate,
      Commission: o.commissionAmount,
      "Technology fee": o.fees.techFee,
      "GST on AllBoutiqs fees": o.fees.feeGst,
      "Payment gateway fee": o.fees.gateway,
      "Courier & COD": o.fees.courierAndCod,
      "GST TCS": o.fees.tcs,
      "Income-tax TDS": o.fees.tds,
      "Fees & taxes": o.feesTotal,
      "Net Payable": o.netPayable,
    }));

    await buildWorkbook(rows, `earnings-statement-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return { summary, loading, refetch: fetchEarnings, exportStatement };
}
