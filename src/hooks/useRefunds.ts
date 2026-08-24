import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Refund {
  id: string;
  order_id: string;
  payment_id: string;
  return_request_id: string | null;
  initiated_by: string | null;
  amount: number;
  reason: string | null;
  status: "initiated" | "processing" | "processed" | "failed";
  razorpay_refund_id: string | null;
  razorpay_payment_id: string;
  speed: "normal" | "instant";
  failure_reason: string | null;
  initiated_at: string;
  gateway_processed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Read-only - RLS scopes what comes back automatically (admin sees all,
// a vendor only sees refunds on orders containing their own sale, a
// customer only their own order), so no client-side gating is needed on
// top of this for any of the three callers (PaymentManagement,
// VendorDashboard, OrderHistory).
export function useRefunds(orderId: string | null | undefined) {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      setRefunds([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    supabase
      .from("refunds")
      .select("*")
      .eq("order_id", orderId)
      .order("initiated_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Error fetching refunds:", error);
          setRefunds([]);
        } else {
          setRefunds((data ?? []) as Refund[]);
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orderId]);

  return { refunds, loading };
}
