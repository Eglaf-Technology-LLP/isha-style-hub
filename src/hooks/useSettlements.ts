import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Settlement {
  id: string;
  razorpay_settlement_id: string;
  amount: number;
  fees: number | null;
  tax: number | null;
  utr: string | null;
  settled_at: string;
  created_at: string;
}

// Admin-only (RLS-enforced) - Razorpay depositing the platform's own
// collected revenue into the platform's own bank account. Platform-wide by
// nature (one settlement batches many orders), not vendor payouts - Route
// isn't enabled on this account, vendor payouts stay a separate ledger.
export function useSettlements(isAdmin: boolean) {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    supabase
      .from("settlements")
      .select("*")
      .order("settled_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error("Error fetching settlements:", error);
          setSettlements([]);
        } else {
          setSettlements((data ?? []) as Settlement[]);
        }
        setLoading(false);
      });
  }, [isAdmin]);

  return { settlements, loading };
}
