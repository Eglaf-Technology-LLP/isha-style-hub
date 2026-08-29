import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface VendorPayout {
  id: string;
  period_start: string;
  period_end: string;
  gross_sales: number;
  commission_amount: number;
  net_payable: number;
  status: string;
  paid_at: string | null;
  payment_reference: string | null;
  created_at: string;
}

// A vendor's own read of vendor_payouts (RLS already scopes this to their
// own rows) - "payout schedule and history" from their side of the screen.
export function useVendorPayoutHistory(vendorId: string | undefined) {
  const [payouts, setPayouts] = useState<VendorPayout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vendorId) {
      setLoading(false);
      return;
    }
    supabase
      .from("vendor_payouts")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("period_start", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error("Error fetching vendor payout history:", error);
          setPayouts([]);
        } else {
          setPayouts((data ?? []) as VendorPayout[]);
        }
        setLoading(false);
      });
  }, [vendorId]);

  return { payouts, loading };
}
