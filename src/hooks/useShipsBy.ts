import { useQuery } from "@tanstack/react-query";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { todayIst } from "@/lib/payoutDates";

// The day a made-to-order piece ships to the customer - the server's own
// estimate (shiprocket-estimate-delivery, no PIN code needed): the boutique's
// making days (working days) + the courier to our centre + our quality-check
// days. The same date the "Delivery date" box shows as "Ships by", so the
// page's "ships in N days" matches it (client corrections Part 2: "ships in
// 35 days" next to "Ships by" 47 days away).
export function useShipsBy(
  vendorId: string | null | undefined,
  productId: string | null | undefined,
  { enabled, soldOutMadeToOrder = false }: { enabled: boolean; soldOutMadeToOrder?: boolean },
) {
  return useQuery({
    queryKey: ["ships-by", vendorId, productId, soldOutMadeToOrder],
    enabled: enabled && !!vendorId && !!productId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data } = await invokeEdgeFunction<{ ships_by_date?: string | null }>("shiprocket-estimate-delivery", {
        vendor_id: vendorId,
        items: [{ product_id: productId, quantity: 1, ...(soldOutMadeToOrder ? { sold_out_made_to_order: true } : {}) }],
      });
      return data?.ships_by_date ?? null;
    },
  });
}

// Calendar days from today (India) to a "2027-01-04" date.
export function daysUntil(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const [ty, tm, td] = todayIst().split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
}
