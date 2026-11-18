import { useQuery, useQueryClient } from '@tanstack/react-query';
import { decode } from 'base64-arraybuffer';
import {
  launchCamera,
  launchImageLibrary,
  Asset,
} from 'react-native-image-picker';
import { useSession } from './auth';
import {
  Order,
  OrderItem,
  RefundMethod,
  Shipment,
  shortDateTime,
} from './orders';
import { friendly } from './errors';
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

// When a part's returns close: the moment stamped on delivery (24 hours
// after it by default, return_window_ends_at); a part delivered before
// windows were timed stays open to the end of that day (IST).
function windowEnd(s: Shipment): number | null {
  if (s.return_window_ends_at)
    return new Date(s.return_window_ends_at).getTime();
  if (s.return_window_ends_on)
    return (
      new Date(`${s.return_window_ends_on}T23:59:59+05:30`).getTime() + 1000
    );
  return null;
}

// Each boutique part can come back from its delivery until its return
// window closes - the server enforces the same rule (enforce_return_window);
// a customised piece only within 24 hours of its delivery.
export function returnWindow(o: Order): {
  items: OrderItem[];
  // "Available until ..." while some items can still come back.
  note: string | null;
  // When the window closed, once nothing can come back any more.
  closedAt: number | null;
} {
  const now = Date.now();
  const delivered = o.shipments.filter(s => s.status === 'delivered');
  const open = new Set(
    delivered
      .filter(s => {
        const end = windowEnd(s);
        return end === null || end > now;
      })
      .map(s => s.id),
  );
  const customisedOpen = new Set(
    delivered
      .filter(
        s => now - new Date(s.delivered_at ?? 0).getTime() < 24 * 3600_000,
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
  const deadlines = [
    ...new Set(
      delivered
        .filter(s => open.has(s.id))
        .map(windowEnd)
        .filter((d): d is number => d !== null),
    ),
  ].sort((x, y) => x - y);
  const note =
    deadlines.length === 0
      ? null
      : deadlines.length === 1
      ? `Available until ${shortDateTime(deadlines[0])}`
      : `Available until ${shortDateTime(
          deadlines[0],
        )} for some items, ${shortDateTime(
          deadlines[deadlines.length - 1],
        )} for others`;
  // (A customised piece never had a return window to close.)
  const closedAt =
    items.length === 0 && o.items.some(i => !i.customisation)
      ? delivered
          .map(windowEnd)
          .filter((d): d is number => d !== null)
          .sort((x, y) => x - y)
          .pop() ?? null
      : null;
  return { items, note, closedAt };
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
    const { error } = await supabase.from('return_requests').insert({
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
    if (error)
      return friendly(error, "Couldn't cancel the request. Please try again.");
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

// The website's photo rule (client, 16 Nov 2026; src/lib/uploadPrep.ts):
// JPG, PNG, WEBP or HEIC, under 5 MB. Here the picker does the work: HEIC
// becomes JPG (iOS "compatible" representation; Android converts it) and
// every photo is re-encoded at most 1600 px, quality 0.8 - far under 5 MB.
export const PHOTO_FORMATS = 'JPG, PNG, WEBP or HEIC';
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const PICK = {
  mediaType: 'photo' as const,
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.8 as const,
  includeBase64: true,
  assetRepresentationMode: 'compatible' as const,
};

export async function pickPhotos(
  fromCamera: boolean,
  limit: number,
): Promise<Asset[]> {
  const r = fromCamera
    ? await launchCamera({ ...PICK, saveToPhotos: false })
    : await launchImageLibrary({
        ...PICK,
        selectionLimit: Math.max(1, limit),
        restrictMimeTypes: [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/heic',
          'image/heif',
        ],
      });
  if (r.didCancel || r.errorCode) return [];
  return (r.assets ?? []).filter(a => !!a.base64);
}

type PhotoKind = 'jpeg' | 'png' | 'webp' | 'heic';
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm'];

// The real format, from the first bytes (a renamed file can't fool it).
function photoKind(base64: string): PhotoKind | null {
  const b = new Uint8Array(decode(base64.slice(0, 64)));
  const text = (from: number, to: number) =>
    String.fromCharCode(...b.subarray(from, Math.min(to, b.length)));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && text(1, 4) === 'PNG') return 'png';
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'webp';
  if (text(4, 8) === 'ftyp') {
    const brands = [text(8, 12)];
    for (let i = 16; i + 4 <= b.length; i += 4) brands.push(text(i, i + 4));
    if (brands.some(x => HEIC_BRANDS.includes(x))) return 'heic';
  }
  return null;
}

const MIME: Record<Exclude<PhotoKind, 'heic'>, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const byteSize = (base64: string) =>
  Math.floor((base64.length * 3) / 4) -
  (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);

const photoName = (a: Asset) => {
  const n = a.fileName ?? '';
  if (!n) return 'This photo';
  return `"${n.length > 60 ? `${n.slice(0, 40)}…${n.slice(-15)}` : n}"`;
};

// Why a picked photo can't be used, in the website's words; null when fine.
export function photoProblem(asset: Asset): string | null {
  if (!asset.base64)
    return `Couldn't prepare ${photoName(asset)} - please try again`;
  const kind = photoKind(asset.base64);
  if (!kind)
    return `${photoName(
      asset,
    )} isn't a photo format we take. Please use ${PHOTO_FORMATS}.`;
  // HEIC is turned into JPG by the picker; one that wasn't can't be shown
  // in every browser.
  if (kind === 'heic')
    return `Couldn't prepare ${photoName(asset)} - please try again`;
  if (byteSize(asset.base64) > PHOTO_MAX_BYTES)
    return `${photoName(asset)} is still over ${
      PHOTO_MAX_BYTES / 1024 / 1024
    } MB after compressing. Please choose a smaller photo.`;
  return null;
}

// The customer's own folder in the public bucket, as the website does
// (storage policy: first folder = their user id). Saved under its real
// format (photoProblem() first).
export async function uploadPhoto(
  asset: Asset,
  subfolder = 'returns',
): Promise<string | null> {
  const userId = useSession.getState().user?.id;
  if (!userId || !asset.base64) return null;
  const kind = photoKind(asset.base64);
  if (!kind || kind === 'heic') return null;
  const ext = kind === 'jpeg' ? 'jpg' : kind;
  const name = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${ext}`;
  const path = `${userId}/${subfolder}/${name}`;
  const { error } = await supabase.storage
    .from('category-images')
    .upload(path, decode(asset.base64), {
      contentType: MIME[kind],
    });
  if (error) return null;
  return supabase.storage.from('category-images').getPublicUrl(path).data
    .publicUrl;
}
