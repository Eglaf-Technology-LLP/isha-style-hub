import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

// Admin settings (platform_settings) that the shop's wording follows - the
// website's src/hooks/useReturnWindowHours.ts and useCustomerShipping.ts.
// Read once and cached; until loaded (or if they can't be read) the same
// defaults as the website.

const SETTINGS_STALE = 30 * 60 * 1000;

// How long customers can return after delivery - one number for every
// boutique, set by AllBoutiqs (platform_settings.return_window_hours).
const DEFAULT_RETURN_WINDOW_HOURS = 24;

export function useReturnWindowHours(): number {
  const { data } = useQuery({
    queryKey: ['return-window-hours'],
    staleTime: SETTINGS_STALE,
    queryFn: async () => {
      const { data: row } = await supabase
        .from('platform_settings')
        .select('return_window_hours')
        .maybeSingle();
      return (
        Number(row?.return_window_hours ?? DEFAULT_RETURN_WINDOW_HOURS) ||
        DEFAULT_RETURN_WINDOW_HOURS
      );
    },
  });
  return data ?? DEFAULT_RETURN_WINDOW_HOURS;
}

// "24-hour" / "2-day", for "24-hour returns on returnable pieces".
export const returnWindowAdjective = (hours: number) =>
  hours > 24 && hours % 24 === 0 ? `${hours / 24}-day` : `${hours}-hour`;

// "24 hours" / "2 days", for "within 24 hours of delivery".
export const returnWindowSpan = (hours: number) =>
  hours > 24 && hours % 24 === 0
    ? `${hours / 24} days`
    : `${hours} hour${hours === 1 ? '' : 's'}`;

// Whether customers are charged shipping at all (Admin's switch,
// platform_settings.customer_shipping_enabled). Off = free shipping on every
// order, and no shipping lines.
export function useShippingCharged() {
  return useQuery({
    queryKey: ['shipping-charged'],
    staleTime: SETTINGS_STALE,
    queryFn: async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('customer_shipping_enabled')
        .maybeSingle();
      return data?.customer_shipping_enabled === true;
    },
  });
}
