import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Dispute {
  id: string;
  razorpay_dispute_id: string;
  payment_id: string | null;
  order_id: string | null;
  amount: number;
  reason_code: string | null;
  status: "open" | "under_review" | "won" | "lost" | "closed";
  respond_by: string | null;
  created_at: string;
  updated_at: string;
}

// Admin-only (RLS-enforced) - visibility only, no in-app response flow.
// Evidence submission stays in Razorpay's own dashboard; this just makes
// sure a dispute is never silently missed.
export function useDisputes(isAdmin: boolean) {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    supabase
      .from("disputes")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error("Error fetching disputes:", error);
          setDisputes([]);
        } else {
          setDisputes((data ?? []) as Dispute[]);
        }
        setLoading(false);
      });
  }, [isAdmin]);

  return { disputes, loading };
}
