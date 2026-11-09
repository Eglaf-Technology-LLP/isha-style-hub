import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// How long customers can return or exchange after delivery - one number for
// every boutique, set by AllBoutiqs in Admin > Returns > Return settings
// (platform_settings.return_window_hours, 24 by default). Read once per page
// load and shared by every component.
const DEFAULT_HOURS = 24;
let cached: Promise<number> | null = null;

function load(): Promise<number> {
  cached ??= Promise.resolve(
    supabase
      .from("platform_settings")
      .select("return_window_hours")
      .maybeSingle()
      .then(({ data }) => data?.return_window_hours ?? DEFAULT_HOURS),
  );
  return cached;
}

export function refreshReturnWindowHours() {
  cached = null;
  return load();
}

export function useReturnWindowHours() {
  const [hours, setHours] = useState(DEFAULT_HOURS);
  useEffect(() => {
    let alive = true;
    load().then((h) => alive && setHours(h));
    return () => {
      alive = false;
    };
  }, []);
  return hours;
}

// "24-hour" / "2-day", for "24-hour return policy".
export const returnWindowAdjective = (hours: number) =>
  hours > 24 && hours % 24 === 0 ? `${hours / 24}-day` : `${hours}-hour`;

// "24 hours" / "2 days", for "within 24 hours of delivery".
export const returnWindowSpan = (hours: number) =>
  hours > 24 && hours % 24 === 0 ? `${hours / 24} days` : `${hours} hour${hours === 1 ? "" : "s"}`;
