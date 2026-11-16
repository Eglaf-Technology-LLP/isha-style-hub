import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// How many of a boutique's products customers can see right now: switched on
// and approved - the same rule as the "Live on site" filter in the Seller
// Dashboard's product list, so the two numbers always agree.
export const liveProductCountKey = (vendorId: string | undefined) => ["vendor-live-product-count", vendorId] as const;

// For the "Live products (N)" button in the Seller Dashboard header (client
// corrections, 15 Nov 2026). It updates by itself: every 30 seconds, when the
// browser tab is opened again, and straight away when the dashboard changes a
// product (it invalidates liveProductCountKey).
export function useLiveProductCount(vendorId: string | undefined) {
  return useQuery({
    queryKey: liveProductCountKey(vendorId),
    enabled: !!vendorId,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", vendorId!)
        .eq("is_active", true)
        .eq("approval_status", "approved");
      if (error) throw error;
      return count ?? 0;
    },
  });
}
