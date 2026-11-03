import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// The customer's cancel and return windows (hours; admin settings, 24 each):
// cancel within this long of ordering, return within this long of delivery.
export interface PolicyHours {
  cancelHours: number;
  returnHours: number;
}

export const DEFAULT_POLICY_HOURS: PolicyHours = { cancelHours: 24, returnHours: 24 };

let cached: Promise<PolicyHours> | null = null;

function loadPolicyHours(): Promise<PolicyHours> {
  cached ??= Promise.resolve(
    supabase
      .from("platform_settings")
      .select("customer_cancel_hours, return_window_hours")
      .maybeSingle()
      .then(({ data }) => ({
        cancelHours: data?.customer_cancel_hours ?? DEFAULT_POLICY_HOURS.cancelHours,
        returnHours: data?.return_window_hours ?? DEFAULT_POLICY_HOURS.returnHours,
      })),
  ).catch(() => {
    cached = null;
    return DEFAULT_POLICY_HOURS;
  });
  return cached;
}

export function usePolicyHours(): PolicyHours {
  const [hours, setHours] = useState<PolicyHours>(DEFAULT_POLICY_HOURS);
  useEffect(() => {
    let alive = true;
    loadPolicyHours().then((h) => alive && setHours(h));
    return () => {
      alive = false;
    };
  }, []);
  return hours;
}

// "24 hours", "2 days".
export const hoursText = (hours: number) => (hours % 24 === 0 && hours > 24 ? `${hours / 24} days` : `${hours} hours`);

// Still inside the customer's cancel window for an order placed at createdAt.
export const canCustomerCancel = (createdAt: string, cancelHours: number) =>
  Date.now() - new Date(createdAt).getTime() <= cancelHours * 3_600_000;
