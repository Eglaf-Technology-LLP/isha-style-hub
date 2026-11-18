import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FoundingPeriod } from "@/lib/founding";

// The founding period for every Founding Boutique (platform_settings), or null when
// none is set, and the launch date the "2 months from launch" buttons use.
export function useFoundingPeriod() {
  const [period, setPeriod] = useState<FoundingPeriod | null>(null);
  const [launchDate, setLaunchDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("platform_settings")
      .select("founding_from, founding_until, launch_date")
      .maybeSingle();
    setPeriod(data?.founding_from && data?.founding_until ? { from: data.founding_from, until: data.founding_until } : null);
    setLaunchDate(data?.launch_date ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { period, launchDate, loading, refetch };
}
