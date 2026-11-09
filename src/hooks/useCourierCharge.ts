import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

// The courier & logistics charge boutiques pay per piece shipped, from the
// fees in force today (platform_rates.logistics_fee_per_piece, Rs 500 + GST
// from 10 Nov 2026): taken off the payout, not added to the customer's price.
// Read once per page load and shared.
export interface CourierCharge {
  perPiece: number;
  gstPct: number;
}

let cached: Promise<CourierCharge | null> | null = null;

function load(): Promise<CourierCharge | null> {
  cached ??= Promise.resolve(
    supabase
      .from("platform_rates")
      .select("logistics_fee_per_piece, fee_gst_pct")
      .lte("effective_from", format(new Date(), "yyyy-MM-dd"))
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) =>
        data ? { perPiece: Number(data.logistics_fee_per_piece), gstPct: Number(data.fee_gst_pct) } : null,
      ),
  );
  return cached;
}

export function useCourierCharge(): CourierCharge | null {
  const [charge, setCharge] = useState<CourierCharge | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((v) => alive && setCharge(v));
    return () => {
      alive = false;
    };
  }, []);
  return charge;
}
