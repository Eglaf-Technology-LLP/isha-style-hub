import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface HsnCode {
  id: string;
  code: string;
  description: string;
  gst_rate: number;
  // Apparel/footwear price band: up to price_limit per piece -> gst_rate,
  // above it -> gst_rate_above_limit. Both null = one rate at any price.
  price_limit: number | null;
  gst_rate_above_limit: number | null;
  is_active: boolean;
}

export type HsnCodeInput = Omit<HsnCode, "id">;

// "5%" or "5% up to ₹2,500 · 18% above" - how the rate reads everywhere.
export function describeGst(h: Pick<HsnCode, "gst_rate" | "price_limit" | "gst_rate_above_limit">): string {
  const pct = (n: number) => `${Number(n)}%`;
  if (h.price_limit == null || h.gst_rate_above_limit == null) return pct(h.gst_rate);
  return `${pct(h.gst_rate)} up to ₹${Number(h.price_limit).toLocaleString("en-IN")} · ${pct(h.gst_rate_above_limit)} above`;
}

export function useHsnCodes() {
  const [hsnCodes, setHsnCodes] = useState<HsnCode[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.from("hsn_codes").select("*").order("code");
    if (!error) setHsnCodes((data ?? []) as HsnCode[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Insert or update by HSN code (the natural key admins and Excel use).
  const saveHsnCodes = async (rows: HsnCodeInput[]): Promise<string | null> => {
    const { error } = await supabase.from("hsn_codes").upsert(rows, { onConflict: "code" });
    if (error) return error.message;
    await refetch();
    return null;
  };

  return { hsnCodes, loading, refetch, saveHsnCodes };
}
