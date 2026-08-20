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
          .select("commission_amount, net_payable, order:orders(payment_status)"),
        supabase.from("payments").select("gateway_fee, payment_status"),
      ]);

      if (vendorOrdersRes.error) throw vendorOrdersRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      const paidVendorOrders = (vendorOrdersRes.data || []).filter((vo) => {
        const order = Array.isArray(vo.order) ? vo.order[0] : vo.order;
        return order?.payment_status === "paid";
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
