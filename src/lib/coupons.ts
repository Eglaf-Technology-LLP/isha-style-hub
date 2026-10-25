// Which cart lines a coupon covers, and each line's share of the saving.
// A coupon can be limited to categories (several allowed), products and a
// boutique; an empty limit means "no limit". Checkout records each line's
// share on order_items.discount_amount - the boutique's payout, its invoice
// and the COD amount all use it (Extra list from the client, D).

export interface CouponScope {
  category_ids?: string[] | null;
  product_ids?: string[] | null;
  vendor_id?: string | null;
}

export interface CouponTerms extends CouponScope {
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
}

export interface CouponLine {
  key: string;
  productId: string;
  vendorId: string | null;
  categoryId: string | null;
  amount: number; // price x quantity
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const isLimitedCoupon = (c: CouponScope) =>
  !!(c.category_ids?.length || c.product_ids?.length || c.vendor_id);

export function couponCovers(c: CouponScope, line: Omit<CouponLine, "key" | "amount">): boolean {
  if (c.category_ids?.length && !(line.categoryId && c.category_ids.includes(line.categoryId))) return false;
  if (c.product_ids?.length && !c.product_ids.includes(line.productId)) return false;
  if (c.vendor_id && line.vendorId !== c.vendor_id) return false;
  return true;
}

// The saving on the covered lines (a fixed amount never more than they cost),
// split over them by value to the paisa - the last line takes the rounding.
export function splitCouponDiscount(c: CouponTerms, lines: CouponLine[]) {
  const covered = lines.filter((l) => couponCovers(c, l) && l.amount > 0);
  const coveredSubtotal = round2(covered.reduce((s, l) => s + l.amount, 0));
  const total =
    c.discount_type === "percentage"
      ? round2((coveredSubtotal * Math.min(Math.max(c.discount_value, 0), 100)) / 100)
      : round2(Math.min(Math.max(c.discount_value, 0), coveredSubtotal));
  const perLine = new Map<string, number>();
  let left = total;
  covered.forEach((l, i) => {
    const share = i === covered.length - 1 ? left : round2((total * l.amount) / coveredSubtotal);
    perLine.set(l.key, Math.min(share, l.amount));
    left = round2(left - share);
  });
  return { total, perLine, coveredSubtotal, coveredCount: covered.length };
}

// One boutique's share of an order's coupon: what checkout recorded on its
// lines, or - for an order from before that - the order's discount shared by
// value.
export function boutiqueDiscountShare(
  items: { price: number; quantity: number; discount_amount?: number | null }[],
  orderDiscount: number | null | undefined,
  orderSubtotal: number | null | undefined,
): number {
  if (!orderDiscount || orderDiscount <= 0) return 0;
  if (items.some((i) => i.discount_amount != null)) {
    return round2(items.reduce((s, i) => s + Number(i.discount_amount ?? 0), 0));
  }
  const gross = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  return orderSubtotal && orderSubtotal > 0 ? round2((orderDiscount * gross) / orderSubtotal) : 0;
}

// "Kurti, Lehenga and Sarees"
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
