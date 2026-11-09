import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// AllBoutiqs' courier charge per piece, GST included
// (platform_settings.delivery_charge_per_piece, Rs 500 - client, 10 Nov
// 2026). It is part of every customer price (MRP = Product Value + GST +
// courier), it is AllBoutiqs' supply - never the boutique's - and a coupon
// never comes off it. Read once per page load and shared.
export const DEFAULT_DELIVERY_CHARGE = 500;

let cached: Promise<number> | null = null;

function load(): Promise<number> {
  cached ??= Promise.resolve(
    supabase
      .from("platform_settings")
      .select("delivery_charge_per_piece")
      .maybeSingle()
      .then(({ data }) => Number(data?.delivery_charge_per_piece ?? DEFAULT_DELIVERY_CHARGE)),
  );
  return cached;
}

export function useDeliveryCharge(): number {
  const [charge, setCharge] = useState(DEFAULT_DELIVERY_CHARGE);
  useEffect(() => {
    let alive = true;
    load().then((v) => alive && setCharge(v));
    return () => {
      alive = false;
    };
  }, []);
  return charge;
}
