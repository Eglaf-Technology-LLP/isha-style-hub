import {
  GstRule,
  gstInsideLine,
  gstRateForInclusive,
  useCategoryGstRules,
} from './gst';

// What the items of an order come to, split into product value,
// customisation charge and GST - the website's src/lib/orderAmounts.ts
// (87776a5), the way checkout shows it (2.9.2) and the tax invoice charges
// it (invoice_line_amounts): prices include GST and any customisation
// charge, the GST is worked out on each line after its coupon share, and the
// customisation charge is shown before GST (its GST is in the GST line).
// Product value is the rest, so product value + customisation + GST = the
// items' price before the coupon.

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
// shop's checkout shows them; otherwise to the paisa.
export function splitGoods(
  lines: GoodsLine[],
  wholeRupees = false,
): GoodsSplit {
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

// An order line as useMyOrders loads it. category_id is undefined when the
// product can't be read any more (a product taken down).
export interface OrderItemAmounts {
  product_id: string;
  price: number;
  quantity: number;
  discount_amount?: number | null;
  customisation_price?: number | null;
  category_id?: string | null;
}

// The coupon on the order, for lines from before each line kept its own
// share (they share it by value, as invoice_line_amounts does).
export interface OrderCoupon {
  subtotal: number | null | undefined;
  discount_amount: number | null | undefined;
}

// Lines for splitGoods, or null while a product's category isn't known (the
// screen then shows the plain items total instead).
export function goodsLinesFor(
  items: OrderItemAmounts[],
  coupon: OrderCoupon | null | undefined,
  ruleFor: (categoryId: string | null | undefined) => GstRule | null,
): GoodsLine[] | null {
  const orderDiscount = Number(coupon?.discount_amount ?? 0);
  const orderSubtotal = Number(coupon?.subtotal ?? 0);
  const lines: GoodsLine[] = [];
  for (const i of items) {
    if (i.category_id === undefined) return null;
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
      rule: ruleFor(i.category_id),
    });
  }
  return lines;
}

// split(items, coupon) gives an order's split, or null while the GST rules
// load or a product is unknown.
export function useGoodsSplitter(wholeRupees = false) {
  const { data: rules } = useCategoryGstRules();
  return (
    items: OrderItemAmounts[] | null | undefined,
    coupon?: OrderCoupon | null,
  ): GoodsSplit | null => {
    if (!rules || !items?.length) return null;
    const lines = goodsLinesFor(
      items,
      coupon,
      id => (id && rules.get(id)) || null,
    );
    return lines ? splitGoods(lines, wholeRupees) : null;
  };
}

// The rows every order summary shows (the website's GoodsSplitRows): as
// checkout words them, "Product value", any customisation charge, "GST".
export function goodsSplitRows(split: GoodsSplit): [string, number][] {
  return [
    ['Product value', split.productValue],
    ...(split.customisation > 0
      ? ([['Customisation charge (excl. GST)', split.customisation]] as [
          string,
          number,
        ][])
      : []),
    ['GST', split.gst],
  ];
}
