import { supabase } from "@/integrations/supabase/client";
import type { CartItem } from "@/stores/cartStore";

export interface VendorGroup {
  vendorId: string | null;
  vendorName: string;
  vendorSlug: string | null;
  items: CartItem[];
  subtotal: number;
  shippingCost: number;
  commissionRate: number;
  commissionAmount: number;
  netPayable: number;
  freeShippingThreshold: number | null;
  shippingFlatRate: number;
}

// Fallback used for products with no vendor assigned (platform-owned stock)
const PLATFORM = {
  name: "Isha Fashion Hub",
  shipping_flat_rate: 99,
  free_shipping_threshold: 999,
  commission_rate: 0,
};

const lineTotal = (item: CartItem) => parseFloat(item.price.amount) * item.quantity;

/**
 * Splits a cart into per-vendor groups, applying each vendor's own
 * shipping rate / free-shipping threshold and commission rate.
 */
export async function buildVendorSplit(items: CartItem[]): Promise<VendorGroup[]> {
  if (items.length === 0) return [];

  const productIds = Array.from(new Set(items.map((i) => i.product.node.id)));

  const { data: products } = await supabase
    .from("products")
    .select("id, vendor_id")
    .in("id", productIds);

  const vendorByProduct = new Map<string, string | null>();
  (products || []).forEach((p) => vendorByProduct.set(p.id, p.vendor_id));

  const vendorIds = Array.from(
    new Set((products || []).map((p) => p.vendor_id).filter(Boolean))
  ) as string[];

  let vendors: any[] = [];
  if (vendorIds.length > 0) {
    const { data } = await supabase
      .from("vendors")
      .select("id, name, slug, shipping_flat_rate, free_shipping_threshold, commission_rate")
      .in("id", vendorIds);
    vendors = data || [];
  }
  const vendorById = new Map(vendors.map((v) => [v.id, v]));

  const groups = new Map<string, VendorGroup>();

  for (const item of items) {
    const vendorId = vendorByProduct.get(item.product.node.id) ?? null;
    const key = vendorId ?? "__platform__";
    const vendor = vendorId ? vendorById.get(vendorId) : null;

    if (!groups.has(key)) {
      groups.set(key, {
        vendorId,
        vendorName: vendor?.name ?? PLATFORM.name,
        vendorSlug: vendor?.slug ?? null,
        items: [],
        subtotal: 0,
        shippingCost: 0,
        commissionRate: Number(vendor?.commission_rate ?? PLATFORM.commission_rate),
        commissionAmount: 0,
        netPayable: 0,
        freeShippingThreshold:
          vendor?.free_shipping_threshold != null
            ? Number(vendor.free_shipping_threshold)
            : vendor
            ? null
            : PLATFORM.free_shipping_threshold,
        shippingFlatRate: Number(vendor?.shipping_flat_rate ?? PLATFORM.shipping_flat_rate),
      });
    }

    const group = groups.get(key)!;
    group.items.push(item);
    group.subtotal += lineTotal(item);
  }

  return Array.from(groups.values()).map((g) => {
    const freeShipping =
      g.freeShippingThreshold != null && g.subtotal >= g.freeShippingThreshold;
    const shippingCost = freeShipping ? 0 : g.shippingFlatRate;
    const commissionAmount = (g.subtotal * g.commissionRate) / 100;
    return {
      ...g,
      shippingCost,
      commissionAmount,
      netPayable: g.subtotal + shippingCost - commissionAmount,
    };
  });
}
