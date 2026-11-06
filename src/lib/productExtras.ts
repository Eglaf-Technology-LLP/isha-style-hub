import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from './auth';
import { supabase } from './supabase';

// Product-page extras, the same backend calls as the website's product page
// (Live-Vendor src/pages/ProductDetail.tsx and its components).

// ---------- the selling boutique ----------

export interface VendorInfo {
  name: string;
  slug: string;
  is_trusted: boolean;
  is_verified: boolean;
  is_founding: boolean;
  return_window_days: number | null;
  returns_enabled: boolean | null;
  cod_enabled: boolean | null;
  address: {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  } | null;
  contact_email: string | null;
  contact_phone: string | null;
  default_prep_days: number | null;
}

export function useVendorInfo(vendorId: string | null | undefined) {
  return useQuery({
    queryKey: ['vendor-info', vendorId],
    enabled: !!vendorId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('vendors')
        .select(
          'name, slug, is_trusted, is_verified, is_founding, return_window_days, returns_enabled, cod_enabled, address, contact_email, contact_phone, default_prep_days',
        )
        .eq('id', vendorId!)
        .maybeSingle();
      return (data as VendorInfo | null) ?? null;
    },
  });
}

export function vendorAddressLine(
  v: VendorInfo | null | undefined,
): string | null {
  const a = v?.address;
  if (!a?.address_line1) return null;
  return `${a.address_line1}${a.address_line2 ? `, ${a.address_line2}` : ''}, ${
    a.city
  }, ${a.state} - ${a.pincode}, ${a.country || 'India'}`;
}

// ---------- reviews ----------

export interface Review {
  id: string;
  user_id: string;
  rating: number;
  title: string | null;
  review_text: string | null;
  is_verified_purchase: boolean;
  is_approved: boolean;
  created_at: string;
  review_images?: {
    id: string;
    url: string;
    status: string;
    user_id: string;
  }[];
}

export function useReviews(productId: string | undefined) {
  return useQuery({
    queryKey: ['reviews', productId],
    enabled: !!productId,
    queryFn: async (): Promise<Review[]> => {
      const { data, error } = await supabase
        .from('product_reviews')
        .select('*, review_images(id, url, status, user_id)')
        .eq('product_id', productId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Review[];
    },
  });
}

// Approved photos, plus the reviewer's own (pending ones show only to them).
export const visibleImages = (r: Review, me: string | null) =>
  (r.review_images ?? []).filter(
    i => i.status === 'approved' || i.user_id === me,
  );

export function useReviewActions(productId: string) {
  const qc = useQueryClient();
  const user = useSession(st => st.user);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ['reviews', productId] });

  const save = async (
    form: { rating: number; title: string; review_text: string },
    existingId?: string,
  ): Promise<string | null> => {
    if (!user) return 'Please sign in to write a review.';
    const row = {
      rating: form.rating,
      title: form.title.trim() || null,
      review_text: form.review_text.trim() || null,
    };
    const { error } = existingId
      ? await supabase
          .from('product_reviews')
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq('id', existingId)
          .eq('user_id', user.id)
      : await supabase
          .from('product_reviews')
          .insert({ ...row, product_id: productId, user_id: user.id });
    if (error)
      return error.code === '23505'
        ? 'You have already reviewed this product.'
        : error.message;
    refresh();
    return null;
  };

  const remove = async (id: string): Promise<string | null> => {
    if (!user) return null;
    const { error } = await supabase
      .from('product_reviews')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) return error.message;
    refresh();
    return null;
  };

  return { save, remove };
}

// ---------- size guide (template per category + the boutique's numbers) ----------

export interface SizeChart {
  name: string;
  unit: 'in' | 'cm';
  sizes: string[];
  rows: { name: string; hint: string; values: Record<string, string> }[];
}

const hasAnyValue = (
  values: Record<string, Record<string, string>> | null | undefined,
) =>
  !!values &&
  Object.values(values).some(row =>
    Object.values(row ?? {}).some(v => String(v ?? '').trim()),
  );

export function useSizeChart(
  categoryId: string | null | undefined,
  vendorId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['size-chart', categoryId, vendorId],
    enabled: !!categoryId,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<SizeChart | null> => {
      const { data: t } = await supabase
        .from('size_guides')
        .select('*')
        .eq('category_id', categoryId!)
        .maybeSingle();
      if (!t) return null;
      const measurements: any[] = Array.isArray((t as any).measurements)
        ? (t as any).measurements
        : [];
      const sizes: string[] = Array.isArray((t as any).sizes)
        ? (t as any).sizes.map(String)
        : [];
      const keyOf = (m: any, i: number) => String(m.key ?? m.name ?? `m${i}`);
      let own: Record<string, Record<string, string>> | null = null;
      if (vendorId) {
        const { data } = await supabase
          .from('vendor_size_charts')
          .select('values')
          .eq('vendor_id', vendorId)
          .eq('category_id', categoryId!)
          .maybeSingle();
        own = (data?.values as Record<string, Record<string, string>>) ?? null;
      }
      const standard = Object.fromEntries(
        measurements.map((m, i) => [keyOf(m, i), m.values ?? {}]),
      );
      const values = hasAnyValue(own)
        ? own!
        : hasAnyValue(standard)
        ? standard
        : null;
      if (!values) return null;
      return {
        name: String((t as any).name ?? ''),
        unit: (t as any).unit === 'cm' ? 'cm' : 'in',
        sizes,
        rows: measurements.map((m, i) => ({
          name: String(m.name ?? m.key ?? ''),
          hint: String(m.hint ?? ''),
          values: values[keyOf(m, i)] ?? {},
        })),
      };
    },
  });
}

// ---------- delivery date by pincode (shiprocket-estimate-delivery) ----------

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dateLabel = (iso: string) => {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export async function estimateDelivery(
  vendorId: string,
  productId: string,
  pincode: string,
): Promise<{ available: boolean; etaLabel: string | null }> {
  const { data, error } = await supabase.functions.invoke(
    'shiprocket-estimate-delivery',
    {
      body: {
        vendor_id: vendorId,
        delivery_pincode: pincode,
        items: [{ product_id: productId, quantity: 1 }],
      },
    },
  );
  const couriers: { etd?: string | null }[] = data?.couriers ?? [];
  if (error || !data?.available || couriers.length === 0)
    return { available: false, etaLabel: null };
  if (data.estimated_delivery_date)
    return {
      available: true,
      etaLabel: dateLabel(data.estimated_delivery_date),
    };
  // The earliest courier's date, as on the website.
  const dates = couriers
    .map(c => (c.etd ? Date.parse(c.etd) : NaN))
    .filter(n => !Number.isNaN(n));
  return {
    available: true,
    etaLabel: dates.length
      ? dateLabel(new Date(Math.min(...dates)).toISOString())
      : null,
  };
}

// ---------- back-in-stock alerts (stock_notifications) ----------

export async function isSubscribedToStock(
  productId: string,
  email: string,
): Promise<boolean> {
  const { data } = await (supabase as any)
    .from('stock_notifications')
    .select('id')
    .eq('product_id', productId)
    .eq('email', email)
    .eq('is_notified', false)
    .maybeSingle();
  return !!data;
}

export async function subscribeToStock(
  productId: string,
  email: string,
): Promise<string | null> {
  const user = useSession.getState().user;
  if (await isSubscribedToStock(productId, email)) return null;
  const { error } = await (supabase as any).from('stock_notifications').insert({
    product_id: productId,
    user_id: user?.id || null,
    email,
    is_notified: false,
  });
  return error ? error.message : null;
}
