import { useQuery, useQueryClient } from '@tanstack/react-query';
import { decode } from 'base64-arraybuffer';
import {
  launchCamera,
  launchImageLibrary,
  Asset,
} from 'react-native-image-picker';
import { useSession } from './auth';
import { Order, OrderItem, RefundMethod } from './orders';
import { supabase } from './supabase';

// Returns and exchanges - the website's ReturnRequestForm / useReturnRequests
// (Live-Vendor): same reasons, windows, photo rule and return_requests row.

export const MIN_PHOTOS_PER_ITEM = 3; // front, back, tag (enforce_return_evidence)
export const MAX_PHOTOS_PER_ITEM = 5;

export const RETURN_REASONS = [
  'Defective or damaged product',
  'Wrong item received',
  "Size doesn't fit",
  'Colour is different from what was shown',
  'Product not as described',
  'Changed my mind',
  'Other',
];
// A customised piece can only come back damaged or wrong, within 24 hours.
export const RETURN_REASONS_CUSTOMISED = [
  'Defective or damaged product',
  'Wrong item received',
];

export const RETURN_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  pickup_scheduled: 'Pickup Scheduled',
  picked_up: 'Items Picked Up',
  completed: 'Completed',
  cancelled: 'Cancelled',
  pickup_failed: "Pickup Issue - We're On It",
  at_warehouse: 'Received - Being Inspected',
  qc_passed: 'Passed Inspection',
  qc_failed: "Didn't Pass Inspection - Sending Back",
  replacement_shipped: 'Replacement Shipped',
  returned_to_customer: 'Items Sent Back to You',
};

// ---------- the return window (OrderHistory.tsx returnWindowFor) ----------

const istToday = () =>
  new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

// Each boutique part can come back from delivery until its window ends; a
// customised piece only within 24 hours of its delivery.
export function returnWindow(o: Order): {
  items: OrderItem[];
  until: string | null;
} {
  const today = istToday();
  const delivered = o.shipments.filter(s => s.status === 'delivered');
  const open = new Set(
    delivered
      .filter(s => !s.return_window_ends_on || s.return_window_ends_on >= today)
      .map(s => s.id),
  );
  const customisedOpen = new Set(
    delivered
      .filter(
        s =>
          Date.now() - new Date(s.delivered_at ?? 0).getTime() < 24 * 3600_000,
      )
      .map(s => s.id),
  );
  const items = o.items.filter(
    i =>
      i.vendor_order_id &&
      (i.customisation
        ? customisedOpen.has(i.vendor_order_id)
        : open.has(i.vendor_order_id)),
  );
  const deadlines = delivered
    .filter(s => open.has(s.id))
    .map(s => s.return_window_ends_on)
    .filter((d): d is string => !!d)
    .sort();
  return { items, until: deadlines[0] ?? null };
}

// ---------- requests on an order ----------

export interface ReturnRequest {
  id: string;
  order_id: string;
  request_type: 'return' | 'exchange';
  status: string;
  reason: string;
  refund_method: RefundMethod | null;
  refund_amount: number | null;
  refund_fee: number | null;
  refund_fee_gst: number | null;
  created_at: string;
  items: {
    product_title: string;
    quantity: number;
    exchange_to?: { size: string | null; color: string | null };
  }[];
}

export function useReturnRequests(orderId: string | undefined) {
  const userId = useSession(st => st.user?.id ?? null);
  return useQuery({
    queryKey: ['returns', orderId],
    enabled: !!orderId && !!userId,
    queryFn: async (): Promise<ReturnRequest[]> => {
      const { data } = await supabase
        .from('return_requests')
        .select('*')
        .eq('order_id', orderId!)
        .eq('user_id', userId!)
        .order('created_at', { ascending: false });
      return (data ?? []) as ReturnRequest[];
    },
  });
}

export function useReturnActions(orderId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['returns', orderId] });
    qc.invalidateQueries({ queryKey: ['orders'] });
  };

  const submit = async (req: {
    request_type: 'return' | 'exchange';
    reason: string;
    additional_notes?: string;
    items: {
      order_item_id: string;
      product_title: string;
      quantity: number;
      size: string | null;
      color: string | null;
      price: number;
      photo_urls: string[];
      photo_url?: string;
      exchange_to?: { size: string | null; color: string | null };
    }[];
    refund_method: RefundMethod | null;
  }): Promise<string | null> => {
    const userId = useSession.getState().user?.id;
    if (!userId) return 'Please sign in to submit a return request.';
    const { error } = await supabase
      .from('return_requests')
      .insert({
        ...req,
        order_id: orderId,
        user_id: userId,
        evidence_video_url: null,
        items: req.items as any,
      });
    if (error) {
      if (error.message?.includes('Photo evidence is required'))
        return 'Please add 3 photos of every selected item: the front, the back and the tag.';
      if (
        error.message?.includes('return window') ||
        error.message?.includes("hasn't been delivered")
      )
        return error.message;
      return 'Failed to submit return request.';
    }
    refresh();
    return null;
  };

  const withdraw = async (id: string): Promise<string | null> => {
    const { error } = await supabase
      .from('return_requests')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (error) return error.message;
    refresh();
    return null;
  };

  return { submit, withdraw };
}

// ---------- exchange targets (live variants) ----------

export interface VariantOption {
  id: string;
  size: string | null;
  color: string | null;
  stock: number;
}

export async function exchangeVariants(
  productId: string,
): Promise<VariantOption[]> {
  const { data } = await supabase
    .from('product_variants')
    .select('id, options, stock')
    .eq('product_id', productId);
  const read = (o: Record<string, string> | null, k: 'size' | 'color') =>
    o ? o[k] ?? o[k.charAt(0).toUpperCase() + k.slice(1)] ?? null : null;
  return (data ?? []).map((v: any) => ({
    id: v.id,
    size: read(v.options, 'size'),
    color: read(v.options, 'color'),
    stock: Number(v.stock) || 0,
  }));
}

// ---------- photos: pick (made small on the phone) and upload ----------

const PICK = {
  mediaType: 'photo' as const,
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.8 as const,
  includeBase64: true,
};

export async function pickPhotos(
  fromCamera: boolean,
  limit: number,
): Promise<Asset[]> {
  const r = fromCamera
    ? await launchCamera({ ...PICK, saveToPhotos: false })
    : await launchImageLibrary({ ...PICK, selectionLimit: Math.max(1, limit) });
  if (r.didCancel || r.errorCode) return [];
  return (r.assets ?? []).filter(a => !!a.base64);
}

// The customer's own folder in the public bucket, as the website does
// (storage policy: first folder = their user id).
export async function uploadPhoto(
  asset: Asset,
  subfolder = 'returns',
): Promise<string | null> {
  const userId = useSession.getState().user?.id;
  if (!userId || !asset.base64) return null;
  const ext = (asset.fileName?.split('.').pop() || 'jpg').toLowerCase();
  const name = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${ext}`;
  const path = `${userId}/${subfolder}/${name}`;
  const { error } = await supabase.storage
    .from('category-images')
    .upload(path, decode(asset.base64), {
      contentType: asset.type || 'image/jpeg',
    });
  if (error) return null;
  return supabase.storage.from('category-images').getPublicUrl(path).data
    .publicUrl;
}
