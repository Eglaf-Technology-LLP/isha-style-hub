import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OrderCancellation {
  id: string;
  orderId: string;
  vendorOrderId: string;
  customerName: string;
  customerEmail: string;
  vendorName: string;
  reason: string | null;
  wasAlreadyShipped: boolean;
  refundAmount: number | null;
  refundStatus: string | null;
  createdAt: string;
}

// A nested embed via a single FK column can come back as an object or a
// one-element array depending on the client/typegen combo in play - same
// defensive unwrap already used in usePlatformRevenue.ts / useVendorPerformance.ts.
const unwrapOne = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

// Dedicated read model for "show cancelled orders separately" - a
// per-vendor cancellation never flips the parent orders.order_status, so a
// status filter on the flat orders list would miss exactly that case.
// order_cancellations already captures every cancellation (full or partial)
// with its reason, whether the shipment had already gone out, and the
// linked refund, so this is a direct read rather than a guess at order state.
export function useOrderCancellations(isAdmin: boolean = false) {
  const [cancellations, setCancellations] = useState<OrderCancellation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      fetchCancellations();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  const fetchCancellations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("order_cancellations")
        .select(
          `
          id,
          order_id,
          vendor_order_id,
          reason,
          was_already_shipped,
          created_at,
          order:orders ( customer_name, customer_email ),
          vendor_order:vendor_orders ( vendor:vendors ( name ) ),
          refund:refunds ( amount, status )
        `,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      const results: OrderCancellation[] = (data || []).map((row) => {
        const order = unwrapOne(row.order);
        const vendorOrder = unwrapOne(row.vendor_order);
        const vendor = vendorOrder ? unwrapOne(vendorOrder.vendor) : null;
        const refund = unwrapOne(row.refund);

        return {
          id: row.id,
          orderId: row.order_id,
          vendorOrderId: row.vendor_order_id,
          customerName: order?.customer_name ?? "Unknown",
          customerEmail: order?.customer_email ?? "",
          vendorName: vendor?.name ?? "Unknown vendor",
          reason: row.reason,
          wasAlreadyShipped: row.was_already_shipped,
          refundAmount: refund?.amount ?? null,
          refundStatus: refund?.status ?? null,
          createdAt: row.created_at,
        };
      });

      setCancellations(results);
    } catch (error) {
      console.error("Error fetching order cancellations:", error);
      toast.error("Failed to load cancelled orders");
    } finally {
      setLoading(false);
    }
  };

  return { cancellations, loading, refetch: fetchCancellations };
}
