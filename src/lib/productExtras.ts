import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from './auth';
import { formatDateInWordsWithDay } from './dates';
import { friendly } from './errors';
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
  gst_number: string | null;
  default_prep_days: number | null;
}

export function useVendorInfo(vendorId: string | null | undefined) {
  return useQuery({
    queryKey: ['vendor-info', vendorId],
    enabled: !!vendorId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      // Not the boutique's phone: it is never shown to customers (as on the
      // website, e174257).
      const { data } = await supabase
        .from('vendors')
        .select(
          'name, slug, is_trusted, is_verified, is_founding, return_window_days, returns_enabled, cod_enabled, address, contact_email, gst_number, default_prep_days',
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
        : friendly(error, "Couldn't save your review. Please try again.");
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
    if (error)
      return friendly(error, "Couldn't delete your review. Please try again.");
    refresh();
    return null;
  };

  return { save, remove };
}

// ---------- size guide (website src/lib/sizeCharts.ts + SizeGuideModal) ----------

// Client, 2026-11-13: every category's chart is Bust, Waist and Hip, XS to
// 6XL, starting from AllBoutiqs' numbers (inches); other measurements are
// hidden. While true, the category's template (size_guides) only gives the
// chart its name, and every category has a chart.
export const SIZE_CHART_STANDARD_ONLY = true;

export const STANDARD_SIZES = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  '3XL',
  '4XL',
  '5XL',
  '6XL',
];
const STANDARD_ROWS = [
  {
    key: 'bust',
    name: 'Bust',
    hint: 'Around the fullest part of the chest, tape level',
    from: 32,
  },
  {
    key: 'waist',
    name: 'Waist',
    hint: 'Around the natural waist, the narrowest part',
    from: 26,
  },
  {
    key: 'hip',
    name: 'Hip',
    hint: 'Around the fullest part of the hips',
    from: 36,
  },
];

// A boutique's numbers: { measurementKey: { size: "34" } }
type ChartValues = Record<string, Record<string, string>>;

interface ChartTemplate {
  name: string;
  unit: 'in' | 'cm';
  sizes: string[];
  measurements: {
    key: string;
    name: string;
    hint: string;
    values: Record<string, string>;
  }[];
}

export interface SizeChart {
  name: string;
  unit: 'in' | 'cm';
  sizes: string[];
  // Only the measurements with at least one number.
  rows: { name: string; hint: string; values: Record<string, string> }[];
}

function parseTemplate(row: any): ChartTemplate {
  const measurements: any[] = Array.isArray(row?.measurements)
    ? row.measurements
    : [];
  return {
    name: String(row?.name ?? ''),
    unit: row?.unit === 'cm' ? 'cm' : 'in',
    sizes: Array.isArray(row?.sizes) ? row.sizes.map(String) : [],
    measurements: measurements.map((m, i) => ({
      key: String(m.key ?? m.name ?? `m${i}`),
      name: String(m.name ?? m.key ?? ''),
      hint: String(m.hint ?? ''),
      values: m.values && typeof m.values === 'object' ? m.values : {},
    })),
  };
}

// The standard chart: 2 inches up per size from XS.
function standardTemplate(name: string): ChartTemplate {
  return {
    name,
    unit: 'in',
    sizes: STANDARD_SIZES,
    measurements: STANDARD_ROWS.map(r => ({
      key: r.key,
      name: r.name,
      hint: r.hint,
      values: Object.fromEntries(
        STANDARD_SIZES.map((size, i) => [size, String(r.from + i * 2)]),
      ),
    })),
  };
}

const hasAnyValue = (values: ChartValues | null | undefined) =>
  !!values &&
  Object.values(values).some(row =>
    Object.values(row ?? {}).some(v => String(v ?? '').trim()),
  );

const standardValues = (t: ChartTemplate): ChartValues =>
  Object.fromEntries(t.measurements.map(m => [m.key, m.values ?? {}]));

export const unitLabel = (unit: string) =>
  unit === 'cm' ? 'centimetres (cm)' : 'inches';

export function useSizeChart(
  categoryId: string | null | undefined,
  vendorId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['size-chart', categoryId, vendorId],
    enabled: !!categoryId,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<SizeChart | null> => {
      // The category's chart: its template, or (standard only) the standard
      // Bust / Waist / Hip chart, named after the template or the category.
      const [{ data: t }, { data: category }] = await Promise.all([
        supabase
          .from('size_guides')
          .select('*')
          .eq('category_id', categoryId!)
          .maybeSingle(),
        SIZE_CHART_STANDARD_ONLY
          ? supabase
              .from('categories')
              .select('name')
              .eq('id', categoryId!)
              .maybeSingle()
          : Promise.resolve({ data: null as { name?: string } | null }),
      ]);
      const template = t ? parseTemplate(t) : null;
      const chart = SIZE_CHART_STANDARD_ONLY
        ? standardTemplate(template?.name || category?.name || 'Size chart')
        : template;
      if (!chart) return null;
      let own: ChartValues | null = null;
      if (vendorId) {
        const { data } = await supabase
          .from('vendor_size_charts')
          .select('values')
          .eq('vendor_id', vendorId)
          .eq('category_id', categoryId!)
          .maybeSingle();
        own = (data?.values as ChartValues) ?? null;
      }
      // The boutique's own numbers for this chart's rows, else the standard
      // ones.
      const ownRows: ChartValues | null = own
        ? Object.fromEntries(
            chart.measurements.map(m => [m.key, own![m.key] ?? {}]),
          )
        : null;
      const values = hasAnyValue(ownRows)
        ? ownRows!
        : hasAnyValue(standardValues(chart))
        ? standardValues(chart)
        : null;
      if (!values) return null;
      return {
        name: chart.name,
        unit: chart.unit,
        sizes: chart.sizes,
        rows: chart.measurements
          .filter(m =>
            chart.sizes.some(sz => String(values[m.key]?.[sz] ?? '').trim()),
          )
          .map(m => ({
            name: m.name,
            hint: m.hint,
            values: values[m.key] ?? {},
          })),
      };
    },
  });
}

// ---------- delivery date by pincode (shiprocket-estimate-delivery) ----------

// For customers: in words, India time - "Mon, 4 Jan 2027", never
// "04-01-2027" (website a4e8e67). A plain "2027-01-04" is that day as-is.
const dateLabel = (value: string | Date) => formatDateInWordsWithDay(value);

export const isPin = (pin: string | null | undefined): pin is string =>
  !!pin && /^\d{6}$/.test(pin);

export interface DeliveryEstimate {
  // The PIN code it was worked out for; null = none given yet, so only
  // "Ships by" is known.
  pin: string | null;
  available: boolean;
  // When the parcel leaves the AllBoutiqs warehouse.
  shipsBy: string | null;
  deliveryBy: string | null;
}

// "Ships by" / "Delivery by" for one piece, as the website's
// DeliveryEstimate: the server adds up the boutique's preparation time,
// courier to the warehouse, the quality check (3 working days) and courier
// to this PIN code. Without a PIN code only "Ships by" comes back.
// soldOutMadeToOrder: the chosen size is sold out and made to order, so its
// extra days count.
export async function estimateDelivery(
  vendorId: string,
  productId: string,
  pincode: string | null,
  soldOutMadeToOrder = false,
): Promise<DeliveryEstimate> {
  const { data, error } = await supabase.functions.invoke(
    'shiprocket-estimate-delivery',
    {
      body: {
        vendor_id: vendorId,
        ...(pincode ? { delivery_pincode: pincode } : {}),
        items: [
          {
            product_id: productId,
            quantity: 1,
            ...(soldOutMadeToOrder ? { sold_out_made_to_order: true } : {}),
          },
        ],
      },
    },
  );
  const shipsBy = data?.ships_by_date ? dateLabel(data.ships_by_date) : null;
  if (!pincode)
    return {
      pin: null,
      available: !error && !!data?.available,
      shipsBy,
      deliveryBy: null,
    };
  const couriers: { etd?: string | null }[] = data?.couriers ?? [];
  if (error || !data?.available || couriers.length === 0)
    return { pin: pincode, available: false, shipsBy: null, deliveryBy: null };
  if (data.estimated_delivery_date)
    return {
      pin: pincode,
      available: true,
      shipsBy,
      deliveryBy: dateLabel(data.estimated_delivery_date),
    };
  // The earliest courier's date, as on the website.
  const dates = couriers
    .map(c => (c.etd ? Date.parse(c.etd) : NaN))
    .filter(n => !Number.isNaN(n));
  return {
    pin: pincode,
    available: true,
    shipsBy,
    deliveryBy: dates.length ? dateLabel(new Date(Math.min(...dates))) : null,
  };
}

// The last PIN code checked on this phone, so a shopper without a saved
// address doesn't retype it on every product. A convenience only: when
// storage fails the box simply starts empty.
const LAST_PIN_KEY = 'allboutiqs:delivery-pincode';
let lastPin: string | null | undefined; // undefined = not read yet

export async function readLastPin(): Promise<string | null> {
  if (lastPin !== undefined) return lastPin;
  try {
    const pin = await AsyncStorage.getItem(LAST_PIN_KEY);
    lastPin = isPin(pin) ? pin : null;
  } catch {
    lastPin = null;
  }
  return lastPin;
}

export function rememberPin(pin: string) {
  lastPin = pin;
  AsyncStorage.setItem(LAST_PIN_KEY, pin).catch(() => undefined);
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
  return error
    ? friendly(error, "Couldn't set up the alert. Please try again.")
    : null;
}
