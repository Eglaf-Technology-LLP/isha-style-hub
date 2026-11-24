import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

// The day a made-to-order piece ships to the customer - the server's own
// estimate (shiprocket-estimate-delivery, no PIN code needed): the
// boutique's making days (working days) + the courier to our centre + our
// quality-check days. The same date the "Delivery date" box shows as "Ships
// by", so the page's "ships in N days" matches it (the website's
// src/hooks/useShipsBy.ts, a4e8e67; client corrections Part 2: "ships in 35
// days" next to "Ships by" 47 days away). Checkout's line rules use it too,
// with the customisation's extra days (customised).
export function useShipsBy(
  vendorId: string | null | undefined,
  productId: string | null | undefined,
  {
    enabled,
    soldOutMadeToOrder = false,
    customised,
  }: { enabled: boolean; soldOutMadeToOrder?: boolean; customised?: boolean },
) {
  return useQuery({
    queryKey: ['ships-by', vendorId, productId, soldOutMadeToOrder, customised],
    enabled: enabled && !!vendorId && !!productId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase.functions.invoke(
        'shiprocket-estimate-delivery',
        {
          body: {
            vendor_id: vendorId,
            items: [
              {
                product_id: productId,
                quantity: 1,
                ...(customised !== undefined ? { customised } : {}),
                ...(soldOutMadeToOrder ? { sold_out_made_to_order: true } : {}),
              },
            ],
          },
        },
      );
      return (data?.ships_by_date as string | null | undefined) ?? null;
    },
  });
}
