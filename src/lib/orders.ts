import { useQuery } from '@tanstack/react-query';
import { useSession } from './auth';
import type { CustomisationChoice } from './customisation';
import { formatDateInWords, formatDateTimeInWords } from './dates';
import {
  AWAITING_CONFIRMATION_LABEL,
  buildOrderTimeline,
  buildWarehouseOrderTimeline,
  inboundBookedAt,
  OrderTimeline,
  ShipmentTimestamps,
} from './orderStatus';
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
  // What the customer asked for, as the server priced it (null: not
  // customised).
  customisation: CustomisationChoice | null;
  // The product's own flag AND its boutique's returns switch (as the website).
  is_returnable: boolean;
  product_id: string;
  product_title: string;
  variant_title: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  price: number;
  // This line's coupon share, and its customisation charge per piece (in price).
  discount_amount: number | null;
  customisation_price: number | null;
  // Made after the order (no stock taken); sold_out_terms when it's a
  // sold-out size made to order (src/lib/soldOutMadeToOrder.ts).
  made_to_order: boolean | null;
  sold_out_terms: unknown;
  // The product's category, for its GST rule; undefined when the product
  // can't be read any more (taken down).
  category_id?: string | null;
  image: string | null;
}

// A courier booking with its step times and tracking number (shipments).
export type CourierShipment = ShipmentTimestamps & {
  awb_code: string | null;
  courier_name: string | null;
};

export interface Shipment {
  id: string;
  status: string;
  dispatch_id: string | null;
  return_window_ends_on: string | null;
  // The moment returns close (24 hours after delivery), stamped on delivery.
  return_window_ends_at: string | null;
  // Warehouse route: already in the warehouse's booked parcel to the customer.
  inParcel: boolean;
  updated_at: string;
  delivered_at: string | null;
  tracking_number: string | null;
  carrier: string | null;
  // The part's items and delivery charge - what a cancel refunds, less coupon.
  subtotal: number | null;
  shipping_cost: number | null;
  // Step times for the tracker (src/lib/orderStatus.ts): reached our centre,
  // boutique accepted and courier out for delivery (migration
  // 20261124110000), boutique booked the courier to our centre.
  arrived_at_warehouse_at: string | null;
  confirmed_at: string | null;
  out_for_delivery_at: string | null;
  inbound_booked_at: string | null;
  // Direct route: the boutique's courier to the customer.
  forward: CourierShipment | null;
  // Warehouse route: the warehouse's parcel to the customer carrying it.
  parcel: CourierShipment | null;
}

export interface Order {
  id: string;
  created_at: string;
  order_status: string;
  payment_method: string;
  payment_status: string;
  // How it was paid online (UPI, card, ...) - see src/lib/paymentMode.ts.
  paid_via?: string | null;
  subtotal: number;
  shipping_cost: number;
  discount_amount: number;
  discount_code: string | null;
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

// A courier booking's step times and tracking number, as the tracker reads them.
const COURIER_FIELDS =
  'awb_code, courier_name, created_at, pickup_scheduled_at, picked_up_at, delivered_at, estimated_delivery_date';
const courier = (x: any): CourierShipment => ({
  awb_code: x.awb_code ?? null,
  courier_name: x.courier_name ?? null,
  created_at: x.created_at ?? null,
  pickup_scheduled_at: x.pickup_scheduled_at ?? null,
  picked_up_at: x.picked_up_at ?? null,
  delivered_at: x.delivered_at ?? null,
  estimated_delivery_date: x.estimated_delivery_date ?? null,
});

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
          // confirmed_at / out_for_delivery_at: migration 20261124110000.
          .select(
            `id, order_id, status, updated_at, delivered_at, tracking_number, carrier, dispatch_id, return_window_ends_on, return_window_ends_at, subtotal, shipping_cost, arrived_at_warehouse_at, confirmed_at, out_for_delivery_at, shipments(${COURIER_FIELDS}, shipment_type, return_request_id)`,
          )
          .in('order_id', ids),
      ]);
      // Warehouse route: the warehouse's own parcels to the customer.
      const warehouseIds = (orders ?? [])
        .filter((o: any) => o.fulfilment_route === 'warehouse')
        .map((o: any) => o.id as string);
      const { data: parcels } = warehouseIds.length
        ? await supabase
            .from('shipments')
            .select(`dispatch_id, ${COURIER_FIELDS}`)
            .in('order_id', warehouseIds)
            .eq('shipment_type', 'warehouse_to_customer')
            .neq('status', 'cancelled')
            .order('created_at', { ascending: true })
        : { data: [] as any[] };
      const parcelByDispatch = new Map<string, CourierShipment>();
      for (const x of (parcels ?? []) as any[])
        if (x.dispatch_id && !parcelByDispatch.has(x.dispatch_id))
          parcelByDispatch.set(x.dispatch_id, courier(x));
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
            .select('id, images, category_id, product_variants(id, image_url)')
            .in('id', productIds)
        : { data: [] as any[] };
      const productById = new Map(
        (products ?? []).map((p: any) => [p.id as string, p]),
      );
      const photo = (productId: string, variantId: string | null) => {
        const p = productById.get(productId) as any;
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
            // Unknown (undefined) when the product can't be read any more.
            category_id: productById.has(i.product_id)
              ? (productById.get(i.product_id) as any).category_id ?? null
              : undefined,
            is_returnable:
              !!i.is_returnable &&
              (i.vendor_id ? returnsOn.get(i.vendor_id) !== false : true),
          })),
        shipments: (vos ?? [])
          .filter((v: any) => v.order_id === o.id)
          .map((v: any) => {
            const { shipments, ...part } = v;
            const forward = (shipments ?? []).find(
              (x: any) => x.shipment_type === 'forward',
            );
            const parcel = v.dispatch_id
              ? parcelByDispatch.get(v.dispatch_id) ?? null
              : null;
            return {
              ...part,
              inParcel: !!parcel,
              inbound_booked_at: inboundBookedAt(shipments),
              forward: forward ? courier(forward) : null,
              parcel,
            };
          }),
      }));
    },
  });
}

// ---------- customer-facing status (src/lib/orderStatus.ts) ----------

export type Tone = 'done' | 'progress' | 'stopped';

// The order's tracker(s), as the website's My orders builds them: the
// warehouse route has one for the whole order (the customer gets AllBoutiqs'
// own parcel), the direct route one per boutique part.
export interface OrderTracking {
  // Warehouse route, or the direct route's only part: the order's tracker.
  single: OrderTimeline | null;
  // Direct route: each boutique part's tracker, by vendor_orders id.
  parts: Map<string, OrderTimeline>;
}

export const isViaWarehouse = (o: Order) => o.fulfilment_route === 'warehouse';

export function orderTracking(o: Order): OrderTracking {
  if (isViaWarehouse(o)) {
    return {
      single: o.shipments.length
        ? buildWarehouseOrderTimeline({
            orderPlacedAt: o.created_at,
            orderEstimatedDeliveryDate: o.estimated_delivery_date,
            parts: o.shipments.map(s => ({
              status: s.status,
              updated_at: s.updated_at,
              arrived_at_warehouse_at: s.arrived_at_warehouse_at,
              parcel: s.parcel,
              confirmed_at: s.confirmed_at,
              out_for_delivery_at: s.out_for_delivery_at,
              delivered_at: s.delivered_at,
              inbound_booked_at: s.inbound_booked_at,
            })),
          })
        : null,
      parts: new Map(),
    };
  }
  const parts = new Map(
    o.shipments.map(s => [
      s.id,
      buildOrderTimeline({
        vendorOrderStatus: s.status,
        vendorOrderUpdatedAt: s.updated_at,
        orderPlacedAt: o.created_at,
        shipment: s.forward,
        confirmedAt: s.confirmed_at,
        outForDeliveryAt: s.out_for_delivery_at,
        deliveredAt: s.delivered_at,
      }),
    ]),
  );
  return {
    single: o.shipments.length === 1 ? parts.get(o.shipments[0].id)! : null,
    parts,
  };
}

const timelineTone = (t: OrderTimeline): Tone =>
  t.kind !== 'progress'
    ? 'stopped'
    : t.stages.every(st => st.state === 'complete')
    ? 'done'
    : 'progress';

// How far a tracker has got (steps reached).
const reached = (t: OrderTimeline) =>
  t.stages.filter(st => st.state !== 'upcoming').length +
  (t.stages.every(st => st.state === 'complete') ? 1 : 0);

// The status pill: "Waiting for boutique confirmation" until the boutique
// accepts, then the tracker's step. With several boutique parts (the
// website shows no pill then) the least advanced part's step.
export function orderStatus(
  o: Order,
  tracking: OrderTracking = orderTracking(o),
): { text: string; tone: Tone } {
  if (o.order_status === 'cancelled')
    return { text: 'Cancelled', tone: 'stopped' };
  const t =
    tracking.single ??
    [...tracking.parts.values()]
      .filter(x => x.kind === 'progress')
      .sort((x, y) => reached(x) - reached(y))[0] ??
    [...tracking.parts.values()].find(x => x.kind === 'returned') ??
    [...tracking.parts.values()][0];
  if (!t) return { text: AWAITING_CONFIRMATION_LABEL, tone: 'progress' };
  return { text: t.currentLabel, tone: timelineTone(t) };
}

export const orderNumber = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

// "6 Jan 2027" and "19 Oct 2026, 5:33 PM IST", in India time - kept for the
// screens that still use these names (src/lib/dates.ts does the work).
export const shortDate = (iso: string | null): string => formatDateInWords(iso);
export const shortDateTime = (when: string | number | Date | null): string =>
  formatDateTimeInWords(when);

// ---------- cancel (cancel-order-items) ----------

// A customer can cancel only within 24 hours of placing the order (client,
// 13 Nov 2026; website src/lib/orderCancel.ts). This only decides whether
// the Cancel button shows - cancel-order-items enforces the same window.
export const CUSTOMER_CANCEL_WINDOW_HOURS = 24;
export const customerCancelDeadline = (orderPlacedAt: string) =>
  new Date(
    new Date(orderPlacedAt).getTime() +
      CUSTOMER_CANCEL_WINDOW_HOURS * 3_600_000,
  );
export const isWithinCustomerCancelWindow = (
  orderPlacedAt: string,
  now: number = Date.now(),
) => now <= customerCancelDeadline(orderPlacedAt).getTime();

// The cancel button shows while any boutique part is still before delivery
// and (warehouse route) not yet in a booked parcel. The function re-checks.
const NOT_CANCELLABLE = ['delivered', 'cancelled', 'returned'];
export const cancellableParts = (o: Order) =>
  o.shipments.filter(s => !NOT_CANCELLABLE.includes(s.status) && !s.inParcel);

// What cancelling one boutique part refunds - the same sum cancel-order-items
// refunds (supabase/functions/_shared/cancellation.ts): its items and
// delivery charge, less their share of any coupon. There is no cancellation
// fee (24 Nov 2026; website src/lib/orderCancel.ts partCancelRefund).
export function partCancelRefund(
  part: { subtotal?: number | null; shipping_cost?: number | null },
  items: { discount_amount?: number | null }[],
): number {
  const coupon = items.reduce(
    (sum, i) => sum + Number(i.discount_amount ?? 0),
    0,
  );
  return (
    Math.round(
      (Number(part.subtotal ?? 0) + Number(part.shipping_cost ?? 0) - coupon) *
        100,
    ) / 100
  );
}

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

// The refund charge (platform_settings.refund_charge_pct, plus GST on it):
// only on a Cash on Delivery order's refund by bank transfer (client, 10 Nov
// 2026). The wallet and the original online payment get the full amount.
export interface RefundCharge {
  pct: number;
  gstPct: number;
}
export const DEFAULT_REFUND_CHARGE: RefundCharge = { pct: 5, gstPct: 18 };
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
        pct: Number(data?.refund_charge_pct ?? DEFAULT_REFUND_CHARGE.pct),
        gstPct: Number(
          data?.refund_charge_gst_pct ?? DEFAULT_REFUND_CHARGE.gstPct,
        ),
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
