import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { gstInsideLine, gstRateForInclusive, useCategoryGstRules, type GstRule } from "@/lib/gst";

// What the items of an order (or one boutique's part of it) come to, split
// into product value, customisation charge and GST, the way checkout shows
// it (2.9.2) and the tax invoice charges it (invoice_line_amounts): prices
// include GST and any customisation charge, the GST is worked out on each
// line after its coupon share, and the customisation charge is shown before
// GST (its GST is in the GST line). Product value is the rest, so
// product value + customisation + GST = the items' price before the coupon.

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface GoodsLine {
  price: number; // one piece, GST and any customisation charge included
  quantity: number;
  discount: number; // the line's coupon share
  customisation: number; // one piece's customisation charge (inside price)
  rule: GstRule | null; // the category's GST rule (null = no HSN code: no GST)
}

export interface GoodsSplit {
  productValue: number;
  customisation: number;
  gst: number;
}

// wholeRupees: GST (and the customisation charge) in whole rupees, as the
// shop's checkout shows them; otherwise to the paisa (seller and admin pages).
export function splitGoods(lines: GoodsLine[], wholeRupees = false): GoodsSplit {
  const r = wholeRupees ? Math.round : round2;
  let subtotal = 0;
  let gst = 0;
  let customisation = 0;
  for (const l of lines) {
    const qty = Math.max(Number(l.quantity) || 0, 1);
    const gross = Number(l.price) * qty;
    const net = gross - (Number(l.discount) || 0);
    subtotal += gross;
    gst += gstInsideLine(l.rule, net, qty);
    if (Number(l.customisation) > 0) {
      const rate = gstRateForInclusive(l.rule, net / qty);
      customisation += (Number(l.customisation) * qty) / (1 + rate / 100);
    }
  }
  const g = r(gst);
  const c = r(customisation);
  return { productValue: round2(subtotal - g - c), customisation: c, gst: g };
}

// An order line as the order screens load it.
export interface OrderItemAmounts {
  product_id: string;
  price: number;
  quantity: number;
  discount_amount?: number | null;
  customisation_price?: number | null;
}

// The coupon on the order, for lines from before each line kept its own
// share (they share it by value, as invoice_line_amounts does).
export interface OrderCoupon {
  subtotal: number | null | undefined;
  discount_amount: number | null | undefined;
}

// Lines for splitGoods, or null while a product's category isn't known (a
// customer can't read a product that has been taken down - the screen then
// shows the plain items total instead).
export function goodsLinesFor(
  items: OrderItemAmounts[],
  coupon: OrderCoupon | null | undefined,
  categories: Map<string, string | null> | null,
  ruleFor: (categoryId: string | null | undefined) => GstRule | null,
): GoodsLine[] | null {
  if (!categories) return null;
  const orderDiscount = Number(coupon?.discount_amount ?? 0);
  const orderSubtotal = Number(coupon?.subtotal ?? 0);
  const lines: GoodsLine[] = [];
  for (const i of items) {
    if (!categories.has(i.product_id)) return null;
    const gross = Number(i.price) * i.quantity;
    const discount =
      i.discount_amount != null
        ? Number(i.discount_amount)
        : orderDiscount > 0 && orderSubtotal > 0
          ? round2((orderDiscount * gross) / orderSubtotal)
          : 0;
    lines.push({
      price: Number(i.price),
      quantity: i.quantity,
      discount,
      customisation: Number(i.customisation_price ?? 0),
      rule: ruleFor(categories.get(i.product_id)),
    });
  }
  return lines;
}

// product id -> category id, shared by every screen (a product's category
// doesn't change under an order).
const categoryCache = new Map<string, string | null>();

async function loadCategories(ids: string[]): Promise<void> {
  const missing = ids.filter((id) => !categoryCache.has(id));
  if (!missing.length) return;
  for (let i = 0; i < missing.length; i += 200) {
    const chunk = missing.slice(i, i + 200);
    const { data } = await supabase.from("products").select("id, category_id").in("id", chunk);
    for (const p of data ?? []) categoryCache.set(p.id, p.category_id ?? null);
  }
}

// The categories of these products (those the signed-in person can read).
export function useProductCategories(productIds: string[]): Map<string, string | null> | null {
  const key = useMemo(() => [...new Set(productIds.filter(Boolean))].sort().join(","), [productIds]);
  const [map, setMap] = useState<Map<string, string | null> | null>(null);
  useEffect(() => {
    let alive = true;
    const ids = key ? key.split(",") : [];
    loadCategories(ids).then(() => {
      if (!alive) return;
      setMap(new Map(ids.filter((id) => categoryCache.has(id)).map((id) => [id, categoryCache.get(id) ?? null])));
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return map;
}

// Product categories and GST rules for a screen of orders: split(items, coupon)
// gives each order's (or part's) split, or null while loading / unknown.
export function useGoodsSplitter(productIds: string[], wholeRupees = false) {
  const categories = useProductCategories(productIds);
  const rules = useCategoryGstRules();
  const ready = !!categories && !rules.loading;
  return (items: OrderItemAmounts[] | null | undefined, coupon?: OrderCoupon | null): GoodsSplit | null => {
    if (!ready || !items?.length) return null;
    const lines = goodsLinesFor(items, coupon, categories, rules.ruleFor);
    return lines ? splitGoods(lines, wholeRupees) : null;
  };
}
