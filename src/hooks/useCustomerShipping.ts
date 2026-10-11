import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Whether customers are charged shipping at all (admin's Archive /
// Unarchive switch, platform_settings.customer_shipping_enabled). Archived =
// free shipping on every order and no "free above Rs 999" messages. Read
// once per page load and shared by every component.
let cached: Promise<boolean> | null = null;

function load(): Promise<boolean> {
  cached ??= Promise.resolve(
    supabase
      .from("platform_settings")
      .select("customer_shipping_enabled")
      .maybeSingle()
      .then(({ data }) => data?.customer_shipping_enabled ?? false),
  );
  return cached;
}

export function refreshCustomerShipping() {
  cached = null;
  return load();
}

export function useCustomerShipping() {
  // Until loaded, assume archived (the default), so no shipping price flashes.
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    load().then((v) => {
      if (!alive) return;
      setEnabled(v);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { shippingCharged: enabled, loading };
}
