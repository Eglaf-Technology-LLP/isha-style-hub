import { useQuery } from '@tanstack/react-query';
import { useSession } from './auth';
import { supabase } from './supabase';

// The signed-in customer's orders - the same rules as the website's
// OrderHistory page (Live-Vendor): an online checkout that was never paid
// isn't an order; each order has its items and one or more shipments
// (vendor_orders), each with its own progress.

export interface OrderItem {
  id: string;
  vendor_order_id: string | null;
  vendor_id: string | null;
  variant_id: string;
  customisation: unknown | null;
  // The product's own flag AND its boutique's returns switch (as the website).
  is_returnable: boolean;
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
  dispatch_id: string | null;
  return_window_ends_on: string | null;
  // Warehouse route: already in the warehouse's booked parcel to the customer.
  inParcel: boolean;
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
  fulfilment_route: string;
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
            'id, order_id, status, updated_at, delivered_at, tracking_number, carrier, dispatch_id, return_window_ends_on',
          )
          .in('order_id', ids),
      ]);
      // Warehouse route: parcels already booked to the customer.
      const warehouseIds = (orders ?? [])
        .filter((o: any) => o.fulfilment_route === 'warehouse')
        .map((o: any) => o.id as string);
      const { data: parcels } = warehouseIds.length
        ? await supabase
            .from('shipments')
            .select('dispatch_id')
            .in('order_id', warehouseIds)
            .eq('shipment_type', 'warehouse_to_customer')
            .neq('status', 'cancelled')
        : { data: [] as any[] };
      const booked = new Set(
        (parcels ?? []).map((x: any) => x.dispatch_id).filter(Boolean),
      );
      // A boutique can switch returns off for its whole store.
      const vendorIds = [
        ...new Set((items ?? []).map((i: any) => i.vendor_id).filter(Boolean)),
      ];
      const { data: vendors } = vendorIds.length
        ? await supabase
            .from('vendors')
            .select('id, returns_enabled')
            .in('id', vendorIds)
        : { data: [] as any[] };
      const returnsOn = new Map(
        (vendors ?? []).map((v: any) => [v.id, v.returns_enabled !== false]),
      );
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
            is_returnable:
              !!i.is_returnable &&
              (i.vendor_id ? returnsOn.get(i.vendor_id) !== false : true),
          })),
        shipments: (vos ?? [])
          .filter((v: any) => v.order_id === o.id)
          .map((v: any) => ({
            ...v,
            inParcel: !!v.dispatch_id && booked.has(v.dispatch_id),
          })),
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

// ---------- cancel (cancel-order-items) ----------

// The cancel button shows while any boutique part is still before delivery
// and (warehouse route) not yet in a booked parcel. The function re-checks.
const NOT_CANCELLABLE = ['delivered', 'cancelled', 'returned'];
export const cancellableParts = (o: Order) =>
  o.shipments.filter(s => !NOT_CANCELLABLE.includes(s.status) && !s.inParcel);

export const CANCEL_REASONS = [
  'Changed my mind',
  'Found a better price',
  'Ordering by mistake',
  'Delivery taking too long',
  'Other',
];

export const isPaidOnline = (o: Order) =>
  o.payment_method === 'razorpay' && o.payment_status === 'paid';
export const isPaidFromWallet = (o: Order) => o.payment_method === 'wallet';

export async function cancelParts(
  vendorOrderIds: string[],
  reason: string,
  refundMethod: RefundMethod | undefined,
  paidOnline: boolean,
): Promise<{ error: string | null; message: string }> {
  const { data, error } = await supabase.functions.invoke(
    'cancel-order-items',
    {
      body: {
        vendor_order_ids: vendorOrderIds,
        reason,
        refund_method: refundMethod,
      },
    },
  );
  if (error) {
    let msg = 'Could not cancel. Please try again.';
    try {
      msg = (await (error as any).context?.json?.())?.error ?? msg;
    } catch {
      // no body
    }
    return { error: msg, message: '' };
  }
  const cancelled: {
    wallet_refund: number;
    refund_charge: number;
    refund_error: string | null;
  }[] = data?.cancelled ?? [];
  const skipped = (data?.skipped ?? []).length;
  const wallet = cancelled.reduce(
    (n, c) => n + Number(c.wallet_refund ?? 0),
    0,
  );
  const charge = cancelled.reduce(
    (n, c) => n + Number(c.refund_charge ?? 0),
    0,
  );
  const money = (n: number) =>
    `₹${n.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const walletNote =
    wallet > 0 ? ` ${money(wallet)} has been added to your wallet.` : '';
  const chargeNote =
    charge > 0
      ? ` A refund charge of ${money(charge)} (incl. GST) was deducted.`
      : '';
  if (cancelled.length === 0)
    return {
      error:
        'Nothing could be cancelled - those items have already progressed too far.',
      message: '',
    };
  if (cancelled.some(c => c.refund_error))
    return {
      error: null,
      message:
        "Order cancelled, but your refund couldn't be processed automatically. Our team has been notified and will follow up.",
    };
  if (skipped > 0)
    return {
      error: null,
      message: `${cancelled.length} item${
        cancelled.length > 1 ? 's' : ''
      } cancelled. ${skipped} item${
        skipped > 1 ? 's' : ''
      } had already progressed too far to cancel.${walletNote}${chargeNote}`,
    };
  // The website's wording, case by case.
  if (walletNote)
    return {
      error: null,
      message: `Order cancelled.${walletNote}${chargeNote}`,
    };
  return {
    error: null,
    message: paidOnline
      ? `Order cancelled. Your refund is on its way.${chargeNote}`
      : 'Order cancelled.',
  };
}

// ---------- refunds (src/lib/wallet.ts on the website) ----------

export type RefundMethod = 'wallet' | 'original' | 'bank';
export const REFUND_METHOD_LABEL: Record<RefundMethod, string> = {
  wallet: 'AllBoutiqs Wallet',
  original: 'Original payment method',
  bank: 'Bank transfer',
};
export const BANK_DETAILS_FIELDS = [
  'Account holder name',
  'Account number',
  'Bank name',
  'IFSC code',
];
export const BANK_REFUND_DAYS = 5;

// Always the wallet, then the original online payment or (COD) a bank
// transfer. An order paid from the wallet goes back to the wallet only.
export function refundOptions(paymentMethod: string): RefundMethod[] {
  if (paymentMethod === 'wallet') return ['wallet'];
  return paymentMethod === 'cod' ? ['wallet', 'bank'] : ['wallet', 'original'];
}

// Returns where the fault isn't the customer's: no refund charge.
export const CHARGE_FREE_RETURN_REASONS = [
  'Defective or damaged product',
  'Wrong item received',
  'Product not as described',
  'Colour is different from what was shown',
];

export interface RefundCharge {
  pct: number;
  gstPct: number;
}
const round2 = (n: number) => Math.round(n * 100) / 100;
export const refundChargeLabel = (c: RefundCharge) =>
  `${c.pct}% + ${c.gstPct}% GST (${round2(
    c.pct * (1 + c.gstPct / 100),
  )}% in all)`;

export function useRefundCharge() {
  return useQuery({
    queryKey: ['refund-charge'],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<RefundCharge> => {
      const { data } = await supabase
        .from('platform_settings')
        .select('refund_charge_pct, refund_charge_gst_pct')
        .maybeSingle();
      return {
        pct: Number(data?.refund_charge_pct ?? 3),
        gstPct: Number(data?.refund_charge_gst_pct ?? 18),
      };
    },
  });
}

export interface Refund {
  id: string;
  amount: number;
  status: string;
  reason: string | null;
  speed: string;
  initiated_at: string;
  failure_reason: string | null;
}

export function useRefunds(orderId: string | undefined) {
  return useQuery({
    queryKey: ['refunds', orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<Refund[]> => {
      const { data } = await supabase
        .from('refunds')
        .select('*')
        .eq('order_id', orderId!)
        .order('initiated_at', { ascending: false });
      return (data ?? []) as Refund[];
    },
  });
}

// ---------- invoice (generate-invoice) ----------

// COD: the invoice exists once the goods are on their way (server checks too).
const COD_INVOICE_STATUSES = [
  'at_warehouse',
  'shipped',
  'out_for_delivery',
  'delivered',
  'ndr',
];
export function invoiceState(
  paymentStatus: string,
  partStatus: string,
): 'none' | 'later' | 'ready' {
  if (partStatus === 'cancelled' || partStatus === 'qc_failed') return 'none';
  if (paymentStatus !== 'paid' && !COD_INVOICE_STATUSES.includes(partStatus))
    return 'later';
  return 'ready';
}

// ---------- reorder (src/lib/reorderAvailability.ts) ----------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReorderLine {
  item: OrderItem;
  availability: 'available' | 'out_of_stock' | 'unavailable';
  currentPrice: number | null;
  priceChanged: boolean;
  availableQuantity: number;
}

// Today's price and stock for each line, so a reorder never adds something
// at a stale price or more than is in stock.
export async function checkReorder(items: OrderItem[]): Promise<ReorderLine[]> {
  const productIds = [...new Set(items.map(i => i.product_id))];
  const variantIds = [
    ...new Set(
      items.map(i => i.variant_id).filter(id => id && UUID_RE.test(id)),
    ),
  ];
  const [{ data: products }, { data: variants }] = await Promise.all([
    supabase
      .from('products')
      .select('id, price, stock_quantity')
      .in('id', productIds),
    variantIds.length
      ? supabase
          .from('product_variants')
          .select('id, price, stock')
          .in('id', variantIds)
      : Promise.resolve({
          data: [] as { id: string; price: number | null; stock: number }[],
        }),
  ]);
  const productById = new Map((products ?? []).map((p: any) => [p.id, p]));
  const variantById = new Map((variants ?? []).map((v: any) => [v.id, v]));
  return items.map(item => {
    const product: any = productById.get(item.product_id);
    const real = UUID_RE.test(item.variant_id);
    const variant: any = real ? variantById.get(item.variant_id) : undefined;
    if (!product || (real && !variant))
      return {
        item,
        availability: 'unavailable',
        currentPrice: null,
        priceChanged: false,
        availableQuantity: 0,
      };
    const currentPrice = Number(variant?.price || product.price);
    const stock = variant ? variant.stock : product.stock_quantity;
    const priceChanged = currentPrice !== Number(item.price);
    if (stock <= 0)
      return {
        item,
        availability: 'out_of_stock',
        currentPrice,
        priceChanged,
        availableQuantity: 0,
      };
    return {
      item,
      availability: 'available',
      currentPrice,
      priceChanged,
      availableQuantity: Math.min(item.quantity, stock),
    };
  });
}

// ---------- amount in words (tax invoice) ----------

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];
const below100 = (n: number) =>
  n < 20
    ? ONES[n]
    : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
const below1000 = (n: number) =>
  [
    Math.floor(n / 100) ? `${ONES[Math.floor(n / 100)]} Hundred` : '',
    n % 100 ? below100(n % 100) : '',
  ]
    .filter(Boolean)
    .join(' ');
function whole(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  if (crore) parts.push(`${whole(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}
export function amountInWords(amount: number): string {
  const paiseTotal = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  return `Rupees ${whole(rupees)}${
    paise ? ` and ${below100(paise)} Paise` : ''
  } Only`;
}
