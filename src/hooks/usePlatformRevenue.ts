import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PlatformRevenueStats {
  vendorPayoutObligation: number;
  platformCommissionEarned: number;
  gatewayFeesPaid: number;
  netPlatformRevenue: number;
  paidVendorOrderCount: number;
}

// Separate from usePayments (which only knows about the payments table) because
// commission/payout figures live on vendor_orders - a table split per vendor at
// checkout, joined back to orders only to know which ones are actually paid.
export function usePlatformRevenue(isAdmin: boolean = false) {
  const [stats, setStats] = useState<PlatformRevenueStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      fetchStats();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [vendorOrdersRes, paymentsRes] = await Promise.all([
        supabase
          .from("vendor_orders")
          .select("status, commission_amount, net_payable, order:orders(payment_status)"),
        supabase.from("payments").select("gateway_fee, payment_status"),
      ]);

      if (vendorOrdersRes.error) throw vendorOrdersRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      // A cancelled vendor_order keeps its commission_amount/net_payable
      // values on the row (they're never zeroed out - that's the original
      // figure for the record), but it must not count as live revenue or
      // payout obligation anymore. The parent order's own payment_status
      // alone isn't enough to catch this: a partial cancellation on a
      // multi-vendor order never flips orders.payment_status away from
      // "paid" (it only ever reaches "refunded" once the whole payment is
      // refunded - see _shared/refunds.ts's reconcileRefundTotals), so a
      // cancelled-and-refunded vendor's figures would otherwise keep
      // counting indefinitely, not just transiently.
      const paidVendorOrders = (vendorOrdersRes.data || []).filter((vo) => {
        const order = Array.isArray(vo.order) ? vo.order[0] : vo.order;
        return order?.payment_status === "paid" && vo.status !== "cancelled";
      });

      const platformCommissionEarned = paidVendorOrders.reduce(
        (sum, vo) => sum + Number(vo.commission_amount || 0),
        0
      );
      const vendorPayoutObligation = paidVendorOrders.reduce(
        (sum, vo) => sum + Number(vo.net_payable || 0),
        0
      );
      const gatewayFeesPaid = (paymentsRes.data || [])
        .filter((p) => p.payment_status === "paid")
        .reduce((sum, p) => sum + Number(p.gateway_fee || 0), 0);

      setStats({
        vendorPayoutObligation,
        platformCommissionEarned,
        gatewayFeesPaid,
        netPlatformRevenue: platformCommissionEarned - gatewayFeesPaid,
        paidVendorOrderCount: paidVendorOrders.length,
      });
    } catch (error: any) {
      console.error("Error fetching platform revenue stats:", error);
      toast.error("Failed to fetch platform revenue stats");
    } finally {
      setLoading(false);
    }
  };

  return { stats, loading, refetch: fetchStats };
}
