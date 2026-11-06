import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import RazorpayCheckout from 'react-native-razorpay';
import { create } from 'zustand';
import { CONFIG } from '@/config';
import { Address, normalizeState } from './account';
import { useSession } from './auth';
import { CartItem } from './stores';
import { supabase } from './supabase';

// Checkout - the website's (Live-Vendor src/pages/Checkout.tsx with the
// "Order amounts worked out by the server" change) step for step. The app
// saves the order the way the website does; the database re-prices every
// line, the coupon, shipping and the COD charge itself (price_order), the
// Razorpay amount comes from the saved order (create-razorpay-order), and
// only verify-razorpay-payment marks it paid. If the database's total isn't
// what the app showed, the order is cancelled before anything is charged.

export const MIN_ONLINE_PAYMENT_AMOUNT = 1;
const PLATFORM_SHIPPING = { flatRate: 99, threshold: 999 };
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Buy now: one piece, the bag left as it is ----------

interface BuyNowState {
  item: CartItem | null;
  set: (item: CartItem | null) => void;
}
export const useBuyNow = create<BuyNowState>(set => ({
  item: null,
  set: item => set({ item }),
}));

// ---------- what the totals need ----------

interface VendorInfo {
  id: string;
  name: string;
  shipping_flat_rate: number | null;
  free_shipping_threshold: number | null;
  commission_rate: number | null;
  cod_enabled: boolean | null;
}

export function useCheckoutData(items: CartItem[]) {
  const vendorIds = [
    ...new Set(items.map(i => i.vendorId).filter((v): v is string => !!v)),
  ].sort();
  const productIds = [...new Set(items.map(i => i.productId))].sort();
  return useQuery({
    queryKey: ['checkout-data', vendorIds.join(','), productIds.join(',')],
    enabled: items.length > 0,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [vendors, products, settings, rates] = await Promise.all([
        vendorIds.length
          ? supabase
              .from('vendors')
              .select(
                'id, name, shipping_flat_rate, free_shipping_threshold, commission_rate, cod_enabled',
              )
              .in('id', vendorIds)
          : Promise.resolve({ data: [] as VendorInfo[] }),
        supabase
          .from('products')
          .select('id, name, cod_available, category_id, is_returnable, sku')
          .in('id', productIds),
        supabase
          .from('platform_settings')
          .select('customer_shipping_enabled')
          .maybeSingle(),
        supabase
          .from('platform_rates')
          .select('*')
          .order('effective_from', { ascending: false }),
      ]);
      const currentRate =
        ((rates.data ?? []) as any[]).find(r => r.effective_from <= today) ??
        null;
      return {
        vendors: new Map(
          ((vendors.data ?? []) as VendorInfo[]).map(v => [v.id, v]),
        ),
        products: new Map(
          ((products.data ?? []) as any[]).map(p => [
            p.id as string,
            p as {
              id: string;
              name: string;
              cod_available: boolean | null;
              category_id: string | null;
              is_returnable: boolean | null;
              sku: string | null;
            },
          ]),
        ),
        shippingCharged: settings.data?.customer_shipping_enabled === true,
        marketplaceCommissionPct: Number(
          currentRate?.marketplace_commission_pct ?? 10,
        ),
      };
    },
  });
}

export interface VendorGroup {
  vendorId: string | null;
  vendorName: string | null;
  commissionRate: number;
  items: CartItem[];
  subtotal: number;
  shippingCost: number;
}

export function vendorGroups(
  items: CartItem[],
  data: NonNullable<ReturnType<typeof useCheckoutData>['data']>,
): VendorGroup[] {
  const buckets = new Map<string, CartItem[]>();
  for (const item of items) {
    const key = item.vendorId ?? '__platform__';
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  return [...buckets.entries()].map(([key, groupItems]) => {
    const subtotal = groupItems.reduce(
      (s, i) => s + parseFloat(i.price.amount) * i.quantity,
      0,
    );
    if (key === '__platform__') {
      const shipping =
        !data.shippingCharged || subtotal >= PLATFORM_SHIPPING.threshold
          ? 0
          : PLATFORM_SHIPPING.flatRate;
      return {
        vendorId: null,
        vendorName: null,
        commissionRate: 0,
        items: groupItems,
        subtotal,
        shippingCost: shipping,
      };
    }
    const info = data.vendors.get(key);
    const flatRate = info?.shipping_flat_rate ?? PLATFORM_SHIPPING.flatRate;
    const threshold = info
      ? info.free_shipping_threshold
      : PLATFORM_SHIPPING.threshold;
    const shipping =
      !data.shippingCharged || (threshold !== null && subtotal >= threshold)
        ? 0
        : flatRate;
    return {
      vendorId: key,
      vendorName: info?.name ?? 'Store',
      commissionRate: info?.commission_rate ?? data.marketplaceCommissionPct,
      items: groupItems,
      subtotal,
      shippingCost: shipping,
    };
  });
}

// ---------- coupon (src/lib/coupons.ts + Checkout's validateDiscountCode) ----------

export interface Coupon {
  id: string;
  code: string;
  name: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  category_ids: string[] | null;
  product_ids: string[] | null;
  vendor_id: string | null;
  min_order_amount: number;
}

const isLimited = (
  c: Pick<Coupon, 'category_ids' | 'product_ids' | 'vendor_id'>,
) => !!(c.category_ids?.length || c.product_ids?.length || c.vendor_id);

export function splitCoupon(
  c: Coupon,
  items: CartItem[],
  categoryOf: (productId: string) => string | null,
) {
  const lines = items.map(i => ({
    key: i.variantId,
    productId: i.productId,
    vendorId: i.vendorId,
    categoryId: categoryOf(i.productId),
    amount: parseFloat(i.price.amount) * i.quantity,
  }));
  const covered = lines.filter(
    l =>
      l.amount > 0 &&
      (!c.category_ids?.length ||
        (l.categoryId && c.category_ids.includes(l.categoryId))) &&
      (!c.product_ids?.length || c.product_ids.includes(l.productId)) &&
      (!c.vendor_id || l.vendorId === c.vendor_id),
  );
  const coveredSubtotal = round2(covered.reduce((s, l) => s + l.amount, 0));
  const total =
    c.discount_type === 'percentage'
      ? round2(
          (coveredSubtotal * Math.min(Math.max(c.discount_value, 0), 100)) /
            100,
        )
      : round2(Math.min(Math.max(c.discount_value, 0), coveredSubtotal));
  const perLine = new Map<string, number>();
  let left = total;
  covered.forEach((l, i) => {
    const share =
      i === covered.length - 1
        ? left
        : round2((total * l.amount) / coveredSubtotal);
    perLine.set(l.key, Math.min(share, l.amount));
    left = round2(left - share);
  });
  return { total, perLine, coveredSubtotal, coveredCount: covered.length };
}

const listNames = (names: string[]) =>
  names.length <= 1
    ? names[0] ?? ''
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

// The website's checks and messages, in order.
export async function checkCoupon(
  code: string,
  items: CartItem[],
  categoryOf: (productId: string) => string | null,
): Promise<{ coupon: Coupon | null; error: string | null }> {
  const { data } = await supabase
    .from('discounts')
    .select('*')
    .eq('code', code.trim().toUpperCase())
    .eq('is_active', true)
    .maybeSingle();
  if (!data) return { coupon: null, error: 'Invalid discount code' };
  if (data.expires_at && new Date(data.expires_at) < new Date())
    return { coupon: null, error: 'This discount code has expired' };
  if (data.starts_at && new Date(data.starts_at) > new Date())
    return { coupon: null, error: 'This discount code is not yet active' };
  if (data.max_uses && data.used_count >= data.max_uses)
    return {
      coupon: null,
      error: 'This discount code has reached its usage limit',
    };
  const coupon: Coupon = {
    id: data.id,
    code: data.code,
    name: data.name,
    discount_type: data.discount_type,
    discount_value: Number(data.discount_value),
    category_ids: data.category_ids?.length ? data.category_ids : null,
    product_ids: data.product_ids?.length ? data.product_ids : null,
    vendor_id: data.vendor_id,
    min_order_amount: Number(data.min_order_amount || 0),
  };
  const subtotal = items.reduce(
    (s, i) => s + parseFloat(i.price.amount) * i.quantity,
    0,
  );
  let coveredSubtotal = subtotal;
  let categoryNames: string[] = [];
  if (isLimited(coupon)) {
    if (coupon.category_ids) {
      const { data: cats } = await supabase
        .from('categories')
        .select('name')
        .in('id', coupon.category_ids)
        .order('name');
      categoryNames = (cats ?? []).map(c => c.name as string);
    }
    const covered = splitCoupon(coupon, items, categoryOf);
    if (covered.coveredCount === 0)
      return {
        coupon: null,
        error: categoryNames.length
          ? `This coupon is only for ${listNames(categoryNames)}`
          : "This coupon isn't for any item in your cart",
      };
    coveredSubtotal = covered.coveredSubtotal;
  }
  if (coveredSubtotal < coupon.min_order_amount) {
    const amt = `₹${coupon.min_order_amount.toLocaleString('en-IN')}`;
    return {
      coupon: null,
      error: `Minimum order of ${amt}${
        categoryNames.length
          ? ` on ${listNames(categoryNames)}`
          : isLimited(coupon)
          ? ' on the items this coupon is for'
          : ''
      } required`,
    };
  }
  return { coupon, error: null };
}

// ---------- COD charge and delivery date (Shiprocket, through our functions) ----------

const groupsFor = (items: CartItem[]) => {
  const map = new Map<string, { product_id: string; quantity: number }[]>();
  for (const i of items) {
    if (!i.vendorId) continue;
    map.set(i.vendorId, [
      ...(map.get(i.vendorId) ?? []),
      { product_id: i.productId, quantity: i.quantity },
    ]);
  }
  return [...map.entries()].map(([vendor_id, its]) => ({
    vendor_id,
    items: its,
  }));
};

// The courier's real COD charge for this parcel to this PIN at this value.
// shiprocket-cod-charge records the quote; the database accepts the order's
// COD charge only if it matches one.
export async function codQuote(
  pincode: string,
  goodsDue: number,
  items: CartItem[],
): Promise<{ status: 'ready' | 'unavailable' | 'error'; amount: number }> {
  const groups = groupsFor(items);
  if (!groups.length) return { status: 'unavailable', amount: 0 };
  const { data, error } = await supabase.functions.invoke(
    'shiprocket-cod-charge',
    {
      body: { delivery_pincode: pincode, order_value: goodsDue, groups },
    },
  );
  if (error || !data) return { status: 'error', amount: 0 };
  if (!data.available || data.cod_charge == null)
    return { status: 'unavailable', amount: 0 };
  return { status: 'ready', amount: Number(data.cod_charge) };
}

// Whole-bag delivery date for this PIN (slowest boutique wins).
export async function cartDeliveryDate(
  pincode: string,
  items: CartItem[],
): Promise<string | null> {
  const groups = groupsFor(items).map(g => ({
    ...g,
    items: g.items.map(i => ({ ...i, customised: false })),
  }));
  if (!groups.length) return null;
  const { data } = await supabase.functions.invoke(
    'shiprocket-estimate-delivery',
    {
      body: { delivery_pincode: pincode, groups },
    },
  );
  return data?.available && data.estimated_delivery_date
    ? (data.estimated_delivery_date as string)
    : null;
}

// ---------- placing the order ----------

export interface PlaceInput {
  items: CartItem[];
  address: Address;
  email: string;
  paymentMethod: 'razorpay' | 'cod';
  coupon: Coupon | null;
  couponPerLine: Map<string, number>;
  groups: VendorGroup[];
  totals: {
    subtotal: number;
    discount: number;
    shipping: number;
    codFee: number;
    total: number;
    walletUse: number;
    payNow: number;
  };
  deliveryEta: string | null;
  products: Map<string, { is_returnable: boolean | null; sku: string | null }>;
}

export type PlaceResult =
  | { kind: 'placed'; orderId: string; message: string }
  | {
      kind: 'pay';
      orderId: string;
      razorpay: { razorpayOrderId: string; amount: number; keyId: string };
    }
  | { kind: 'error'; message: string };

const cancelPending = (orderId: string) =>
  supabase.rpc('cancel_pending_order', { _order_id: orderId });

// Emails as the website sends them (never hold up the order).
async function sendOrderEmails(orderId: string) {
  const call = (fn: string, body: object) =>
    fetch(`${CONFIG.supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CONFIG.supabaseKey}`,
        apikey: CONFIG.supabaseKey,
      },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  await call('send-order-email', { orderId, type: 'confirmation' });
  await call('send-vendor-order-email', { orderId });
}

export async function releaseUnpaid(orderId: string): Promise<string | null> {
  const { data } = await supabase.functions.invoke('release-unpaid-orders', {
    body: { order_id: orderId },
  });
  return (data?.status as string) ?? null;
}

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export async function placeOrder(input: PlaceInput): Promise<PlaceResult> {
  const user = useSession.getState().user;
  if (!user)
    return { kind: 'error', message: 'Please sign in to place your order' };
  const { items, address, totals } = input;
  const orderPaymentMethod =
    totals.walletUse > 0 && totals.payNow <= 0 ? 'wallet' : input.paymentMethod;
  if (
    orderPaymentMethod === 'razorpay' &&
    totals.payNow > 0 &&
    totals.payNow < MIN_ONLINE_PAYMENT_AMOUNT
  )
    return {
      kind: 'error',
      message:
        'Online payment needs at least ₹1 - please choose Cash on Delivery instead',
    };

  // The name on the address becomes the account's name if it has none yet.
  void supabase
    .from('profiles')
    .update({ full_name: address.full_name.trim() })
    .eq('user_id', user.id)
    .or('full_name.is.null,full_name.eq.');

  let unpaidOnline: string | null = null;
  const orderId = uuid();
  try {
    const { error: orderError } = await supabase.from('orders').insert({
      id: orderId,
      user_id: user.id,
      customer_name: address.full_name,
      customer_email: input.email,
      customer_phone: address.phone,
      shipping_address: {
        address_line1: address.address_line_1,
        address_line2: address.address_line_2 || '',
        city: address.city,
        state: normalizeState(address.state),
        pincode: address.pincode,
        country: 'India',
      },
      payment_method: orderPaymentMethod,
      payment_status: 'pending',
      order_status: 'pending',
      // Replaced by the database's own sums (price_order).
      subtotal: totals.subtotal,
      shipping_cost: totals.shipping,
      total: totals.total,
      discount_code: input.coupon?.code ?? null,
      discount_amount: totals.discount,
      cod_charge: totals.codFee,
      notes: null,
      estimated_delivery_date: input.deliveryEta,
    });
    if (orderError) throw orderError;

    // One part per boutique, so each boutique's dashboard sees its sale.
    const partByVendor: Record<string, string> = {};
    const parts = input.groups
      .filter(g => g.vendorId)
      .map(g => {
        const id = uuid();
        partByVendor[g.vendorId!] = id;
        const commission = g.subtotal * (g.commissionRate / 100);
        return {
          id,
          order_id: orderId,
          vendor_id: g.vendorId!,
          subtotal: g.subtotal,
          shipping_cost: g.shippingCost,
          commission_rate: g.commissionRate,
          commission_amount: commission,
          net_payable: g.subtotal + g.shippingCost - commission,
          status: 'pending',
        };
      });
    if (parts.length) {
      const { error } = await supabase.from('vendor_orders').insert(parts);
      if (error) throw error;
    }

    const realVariantIds = items
      .map(i => i.variantId)
      .filter(id => UUID_RE.test(id));
    const { data: variantSkus } = realVariantIds.length
      ? await supabase
          .from('product_variants')
          .select('id, sku')
          .in('id', realVariantIds)
      : { data: [] as { id: string; sku: string | null }[] };
    const skuByVariant = new Map((variantSkus ?? []).map(v => [v.id, v.sku]));
    const lines = items.map(i => ({
      order_id: orderId,
      product_id: i.productId,
      variant_id: i.variantId,
      product_title: i.productName,
      variant_title: i.variantTitle || null,
      size:
        i.selectedOptions.find(o => o.name.toLowerCase() === 'size')?.value ||
        null,
      color:
        i.selectedOptions.find(o =>
          ['color', 'colour'].includes(o.name.toLowerCase()),
        )?.value || null,
      sku:
        (UUID_RE.test(i.variantId) ? skuByVariant.get(i.variantId) : null) ||
        input.products.get(i.productId)?.sku ||
        null,
      quantity: i.quantity,
      price: parseFloat(i.price.amount),
      discount_amount: input.couponPerLine.get(i.variantId) ?? 0,
      vendor_id: i.vendorId,
      vendor_order_id: i.vendorId ? partByVendor[i.vendorId] ?? null : null,
      is_returnable: input.products.get(i.productId)?.is_returnable ?? true,
      customisation: null,
    }));
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(lines);
    if (itemsError) {
      await cancelPending(orderId);
      throw itemsError;
    }

    // The database has priced the order from its items. If that isn't what
    // the app showed (a price changed since), stop before charging anything.
    const { data: priced, error: pricedError } = await supabase
      .from('orders')
      .select('total')
      .eq('id', orderId)
      .single();
    if (pricedError || Math.abs(Number(priced.total) - totals.total) >= 0.01) {
      await cancelPending(orderId);
      return {
        kind: 'error',
        message: pricedError
          ? 'Could not save your order. Please try again.'
          : `Your order now comes to ₹${Number(priced.total).toLocaleString(
              'en-IN',
            )} - prices changed. Please check your bag and place the order again.`,
      };
    }

    for (const i of items) {
      const { error: stockError } = await supabase.rpc('adjust_stock', {
        _product_id: i.productId,
        _variant_id: UUID_RE.test(i.variantId) ? i.variantId : null,
        _delta: -i.quantity,
        _movement_type: 'sale',
        _reason: `Order ${orderId}`,
        _reference_order_id: orderId,
      } as any);
      if (stockError) {
        await cancelPending(orderId);
        return {
          kind: 'error',
          message: stockError.message.includes('Insufficient stock')
            ? stockError.message
            : `${i.productName} is no longer available in the requested quantity.`,
        };
      }
    }

    // The payment row ("paid" only ever set by verify-razorpay-payment).
    const { error: paymentError } = await supabase.from('payments').insert({
      order_id: orderId,
      amount:
        orderPaymentMethod === 'wallet' ? totals.walletUse : totals.payNow,
      payment_method: orderPaymentMethod,
      payment_status: 'pending',
    });
    if (paymentError) throw paymentError;
    if (orderPaymentMethod === 'razorpay') unpaidOnline = orderId;

    if (totals.walletUse > 0) {
      const { error: walletError } = await supabase.rpc(
        'apply_wallet_to_order',
        {
          _order_id: orderId,
          _amount: totals.walletUse,
        },
      );
      if (walletError) {
        await cancelPending(orderId);
        return {
          kind: 'error',
          message:
            'Your wallet balance changed - please check and place the order again.',
        };
      }
    }

    let razorpay: {
      razorpayOrderId: string;
      amount: number;
      keyId: string;
    } | null = null;
    if (orderPaymentMethod === 'razorpay') {
      const { data, error } = await supabase.functions.invoke(
        'create-razorpay-order',
        { body: { orderId } },
      );
      if (error || !data?.razorpayOrderId)
        throw new Error('Could not start online payment. Please try again.');
      razorpay = data;
    }

    if (input.coupon) {
      await supabase.rpc('increment_discount_usage', {
        _discount_id: input.coupon.id,
      });
    }

    if (orderPaymentMethod !== 'razorpay') {
      await sendOrderEmails(orderId);
      return {
        kind: 'placed',
        orderId,
        message:
          orderPaymentMethod === 'wallet'
            ? 'Order placed - paid from your wallet'
            : 'Order placed successfully!',
      };
    }
    return { kind: 'pay', orderId, razorpay: razorpay! };
  } catch (e: any) {
    if (unpaidOnline) await releaseUnpaid(unpaidOnline);
    const raw = String(e?.message ?? '');
    // The database's own reasons are written for shoppers (price_order,
    // price_order_item); anything else gets a plain sentence.
    const shopperReason =
      /no longer available|can't be used any more|isn't for any item|minimum order|Cash on Delivery charge has changed|choose a quantity|choose again|try again/i.test(
        raw,
      );
    console.warn('[AllBoutiqs] place order', raw);
    return {
      kind: 'error',
      message: shopperReason ? raw : 'Failed to place order. Please try again.',
    };
  }
}

// ---------- paying online (Razorpay's native checkout) ----------

const PENDING_KEY = 'allboutiqs:pending-payment';
interface Pending {
  orderId: string;
  userId: string;
  buyNow: boolean;
  startedAt: number;
}
export const savePending = (p: Pending) =>
  AsyncStorage.setItem(PENDING_KEY, JSON.stringify(p)).catch(() => undefined);
export const clearPending = () =>
  AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
export async function readPending(userId: string): Promise<Pending | null> {
  try {
    const p = JSON.parse(
      (await AsyncStorage.getItem(PENDING_KEY)) ?? 'null',
    ) as Pending | null;
    return p && p.userId === userId && Date.now() - p.startedAt < 60 * 60_000
      ? p
      : null;
  } catch {
    return null;
  }
}

export type PayOutcome = 'paid' | 'processing' | 'released' | 'unverified';

export async function payOnline(
  orderId: string,
  razorpay: { razorpayOrderId: string; amount: number; keyId: string },
  prefill: { name: string; email: string; contact: string },
  buyNow: boolean,
): Promise<PayOutcome> {
  const user = useSession.getState().user!;
  await savePending({
    orderId,
    userId: user.id,
    buyNow,
    startedAt: Date.now(),
  });
  try {
    const res = await RazorpayCheckout.open({
      key: razorpay.keyId,
      amount: razorpay.amount,
      currency: 'INR',
      order_id: razorpay.razorpayOrderId,
      name: 'AllBoutiqs',
      description: `Order ${orderId.slice(0, 8)}`,
      prefill,
      // The storefront's maroon.
      theme: { color: '#7E3626' },
    } as any);
    const { data, error } = await supabase.functions.invoke(
      'verify-razorpay-payment',
      {
        body: {
          orderId,
          razorpay_order_id: res.razorpay_order_id,
          razorpay_payment_id: res.razorpay_payment_id,
          razorpay_signature: res.razorpay_signature,
        },
      },
    );
    if (error || !data?.verified) return 'unverified';
    await clearPending();
    await sendOrderEmails(orderId);
    return 'paid';
  } catch {
    // Closed or failed: ask the server how it really ended.
    const status = await releaseUnpaid(orderId);
    if (status !== 'processing') await clearPending();
    if (status === 'paid') {
      await sendOrderEmails(orderId);
      return 'paid';
    }
    return status === 'processing' ? 'processing' : 'released';
  }
}

// An online payment left open when the app was closed: how did it end?
export async function checkPending(
  userId: string,
): Promise<{ orderId: string; buyNow: boolean; status: PayOutcome } | null> {
  const pending = await readPending(userId);
  if (!pending) return null;
  const { data: o } = await supabase
    .from('orders')
    .select('payment_status, order_status')
    .eq('id', pending.orderId)
    .maybeSingle();
  let status: PayOutcome;
  if (o && ['paid', 'refunded'].includes(o.payment_status)) status = 'paid';
  else if (!o || o.order_status === 'cancelled') status = 'released';
  else {
    const s = await releaseUnpaid(pending.orderId);
    status =
      s === 'paid'
        ? 'paid'
        : s === 'processing' || s === null
        ? 'processing'
        : 'released';
  }
  if (status !== 'processing') await clearPending();
  return { orderId: pending.orderId, buyNow: pending.buyNow, status };
}
