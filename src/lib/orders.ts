import { useQuery } from '@tanstack/react-query';
import { useSession } from './auth';
import { supabase } from './supabase';

// The signed-in customer's orders - the same rules as the website's
// OrderHistory page (Live-Vendor): an online checkout that was never paid
// isn't an order; each order has its items and one or more shipments
// (vendor_orders), each with its own progress.

export interface OrderItem {
  id: string;
  product_id: string;
  product_title: string;
  variant_title: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  price: number;
  image: string | null;
}

export interface Shipment {
  id: string;
  status: string;
  updated_at: string;
  delivered_at: string | null;
  tracking_number: string | null;
  carrier: string | null;
}

export interface Order {
  id: string;
  created_at: string;
  order_status: string;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  shipping_cost: number;
  discount_amount: number;
  cod_charge: number;
  wallet_amount: number;
  total: number;
  customer_name: string;
  customer_phone: string;
  estimated_delivery_date: string | null;
  shipping_address: {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
  } | null;
  items: OrderItem[];
  shipments: Shipment[];
}

export function useMyOrders() {
  const userId = useSession(st => st.user?.id ?? null);
  return useQuery({
    queryKey: ['orders', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Order[]> => {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', userId!)
        .or('payment_method.eq.cod,payment_status.in.(paid,refunded)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ids = (orders ?? []).map(o => o.id as string);
      if (!ids.length) return [];
      const [{ data: items }, { data: vos }] = await Promise.all([
        supabase.from('order_items').select('*').in('order_id', ids),
        supabase
          .from('vendor_orders')
          .select(
            'id, order_id, status, updated_at, delivered_at, tracking_number, carrier',
          )
          .in('order_id', ids),
      ]);
      // A photo for each line: the variant's own, else the product's first.
      const productIds = [
        ...new Set((items ?? []).map(i => i.product_id as string)),
      ];
      const { data: products } = productIds.length
        ? await supabase
            .from('products')
            .select('id, images, product_variants(id, image_url)')
            .in('id', productIds)
        : { data: [] as any[] };
      const photo = (productId: string, variantId: string | null) => {
        const p = (products ?? []).find((x: any) => x.id === productId) as any;
        const v = p?.product_variants?.find((x: any) => x.id === variantId);
        return (
          (v?.image_url as string | null) ||
          (p?.images?.[0] as string | undefined) ||
          null
        );
      };
      return (orders ?? []).map((o: any) => ({
        ...o,
        items: (items ?? [])
          .filter((i: any) => i.order_id === o.id)
          .map((i: any) => ({
            ...i,
            image: photo(i.product_id, i.variant_id),
          })),
        shipments: (vos ?? []).filter((v: any) => v.order_id === o.id),
      }));
    },
  });
}

// ---------- customer-facing status (src/lib/orderStatus.ts on the website) ----------

export const STAGES = [
  'Order placed',
  'Confirmed',
  'Shipped',
  'Out for delivery',
  'Delivered',
] as const;

const STATUS_TO_STAGE: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  processing: 1,
  shipped: 2,
  out_for_delivery: 3,
  ndr: 3,
  delivered: 4,
};

// The stage the whole order has reached: the least advanced live shipment.
export function orderStage(o: Order): number {
  const live = o.shipments.filter(s => s.status in STATUS_TO_STAGE);
  if (!live.length) return 0;
  return Math.min(...live.map(s => STATUS_TO_STAGE[s.status]));
}

export function orderLabel(o: Order): {
  text: string;
  tone: 'done' | 'progress' | 'stopped';
} {
  if (o.order_status === 'cancelled')
    return { text: 'Cancelled', tone: 'stopped' };
  if (o.shipments.length && o.shipments.every(s => s.status === 'cancelled'))
    return { text: 'Cancelled', tone: 'stopped' };
  if (o.shipments.some(s => /return/.test(s.status)))
    return { text: 'Return in progress', tone: 'progress' };
  const stage = orderStage(o);
  return { text: STAGES[stage], tone: stage === 4 ? 'done' : 'progress' };
}

export const orderNumber = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

export const paymentLabel = (o: Order) =>
  o.payment_method === 'cod'
    ? 'Cash on delivery'
    : o.payment_status === 'refunded'
    ? 'Paid online (refunded)'
    : 'Paid online';

export function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const m = [
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
  ][d.getMonth()];
  return `${d.getDate()} ${m} ${d.getFullYear()}`;
}
