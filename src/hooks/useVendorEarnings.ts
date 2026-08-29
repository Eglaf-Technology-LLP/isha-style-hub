import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildWorkbook } from "@/lib/excelImportExport";
import { format } from "date-fns";

export interface VendorOrderEarning {
  id: string;
  orderId: string;
  createdAt: string;
  status: string;
  subtotal: number;
  shippingCost: number;
  commissionRate: number;
  commissionAmount: number;
  // Informational only - the platform absorbs the gateway fee out of its
  // own commission today (see usePlatformRevenue.ts), it is never deducted
  // from a vendor's net_payable. Shown so a vendor can see how much of the
  // processing cost their own sales contributed to, not as money owed.
  gatewayFeeAttributed: number;
  netPayable: number;
}

export interface VendorEarningsSummary {
  grossSales: number;
  commissionDeducted: number;
  gatewayFeeAttributed: number;
  netPayable: number;
  orders: VendorOrderEarning[];
}

// A nested embed via a single FK column can come back as an object or a
// one-element array depending on the client/typegen combo - same defensive
// unwrap already used in usePlatformRevenue.ts / useVendorPerformance.ts.
const unwrapOne = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

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
        .select(
          "id, order_id, created_at, status, subtotal, shipping_cost, commission_rate, commission_amount, net_payable, order:orders(subtotal, payment_status)",
        )
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Same exclusion every other revenue surface in this app applies -
      // a cancelled vendor_order's figures must not count as live earnings.
      const eligible = (vendorOrders || []).filter((vo) => {
        const order = unwrapOne(vo.order);
        return order?.payment_status === "paid" && vo.status !== "cancelled";
      });

      const orderIds = [...new Set(eligible.map((vo) => vo.order_id))];
      const { data: payments } = orderIds.length
        ? await supabase.from("payments").select("order_id, gateway_fee, payment_status").in("order_id", orderIds)
        : { data: [] as { order_id: string; gateway_fee: number | null; payment_status: string }[] };

      const gatewayFeeByOrderId = new Map<string, number>();
      (payments ?? []).forEach((p) => {
        if (p.payment_status !== "paid") return;
        gatewayFeeByOrderId.set(
          p.order_id,
          (gatewayFeeByOrderId.get(p.order_id) || 0) + Number(p.gateway_fee || 0),
        );
      });

      const orders: VendorOrderEarning[] = eligible.map((vo) => {
        const order = unwrapOne(vo.order);
        const orderSubtotal = Number(order?.subtotal || 0);
        const totalGatewayFee = gatewayFeeByOrderId.get(vo.order_id) || 0;
        // This vendor's share of a multi-vendor order's one gateway fee,
        // proportional to their slice of the order's subtotal - nothing
        // splits this anywhere else today, so it's derived here, not stored.
        const gatewayFeeAttributed =
          orderSubtotal > 0 ? totalGatewayFee * (Number(vo.subtotal) / orderSubtotal) : 0;

        return {
          id: vo.id,
          orderId: vo.order_id,
          createdAt: vo.created_at,
          status: vo.status,
          subtotal: Number(vo.subtotal),
          shippingCost: Number(vo.shipping_cost),
          commissionRate: Number(vo.commission_rate),
          commissionAmount: Number(vo.commission_amount),
          gatewayFeeAttributed,
          netPayable: Number(vo.net_payable),
        };
      });

      setSummary({
        grossSales: orders.reduce((s, o) => s + o.subtotal + o.shippingCost, 0),
        commissionDeducted: orders.reduce((s, o) => s + o.commissionAmount, 0),
        gatewayFeeAttributed: orders.reduce((s, o) => s + o.gatewayFeeAttributed, 0),
        netPayable: orders.reduce((s, o) => s + o.netPayable, 0),
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
      "Order Date": format(new Date(o.createdAt), "yyyy-MM-dd"),
      "Order ID": o.orderId,
      Products: (productsByVendorOrder.get(o.id) ?? []).join(", "),
      Subtotal: o.subtotal,
      Shipping: o.shippingCost,
      "Commission Rate %": o.commissionRate,
      "Commission Amount": o.commissionAmount,
      "Gateway Fee (Attributed)": Number(o.gatewayFeeAttributed.toFixed(2)),
      "Net Payable": o.netPayable,
    }));

    await buildWorkbook(rows, `earnings-statement-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return { summary, loading, refetch: fetchEarnings, exportStatement };
}
