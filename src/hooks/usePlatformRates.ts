import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type PlatformRates = Tables<"platform_rates">;

export const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

// All rate versions (newest first) and the one in force today. Admins add
// new versions with a start date; started versions are read-only.
export function usePlatformRates() {
  const [versions, setVersions] = useState<PlatformRates[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data } = await supabase.from("platform_rates").select("*").order("effective_from", { ascending: false });
    setVersions(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const today = istToday();
  const current = versions.find((v) => v.effective_from <= today) ?? null;
  return { versions, current, today, loading, refetch };
}
