import { useEffect } from 'react';
import { customisationPrice, rechargeAt } from './customisation';
import {
  readSoldOutSetup,
  SoldOutTerms,
  soldOutTermsFor,
} from './soldOutMadeToOrder';
import { CartItem, cartLineKey, LinePrice, useCart } from './stores';
import { supabase } from './supabase';
import { toast } from './toast';

// The website's src/hooks/useSyncCartPrices.ts (c9475fd, 968958f), run when
// the bag or checkout opens.
//
// A bag keeps the price each piece had when it was added. Prices can change
// since then, so the bag and checkout pull today's price for each line and
// say so when one moved. A customised line keeps its customisation on top of
// the new base price - a % charge worked out again on it, an old ₹ one as it
// was.
//
// Stock moves too: a size that has sold out since it was added becomes made
// to order when its product takes sold-out orders (its extra charge and days
// on the line), and one back in stock goes back to a normal line - the
// customer is told either way, before checkout. The server applies the same
// rule when the order is placed (sold_out_made_to_order_trigger).
//
// A piece that is no longer for sale - deleted, switched off, not approved,
// its boutique not approved, or its size gone - leaves the bag with "1 item
// is no longer available and was removed." (client corrections Part 2,
// A23.3). Shoppers can only read live products, so a line whose product
// doesn't come back is one of these.
//
// The app shows one message at a time, so a website title and its
// description are one message here, on two lines.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sameTerms = (a: SoldOutTerms | null, b: SoldOutTerms | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.extra === b.extra &&
    a.days === b.days &&
    (a.pct ?? null) === (b.pct ?? null));

const lineName = (i: CartItem) => {
  const size = i.selectedOptions.find(
    o => o.name.toLowerCase() === 'size',
  )?.value;
  return `"${i.productName}"${size ? ` in size ${size}` : ''}`;
};

interface ProductRow {
  id: string;
  price: number | string;
  stock_quantity: number | null;
  is_active: boolean | null;
  approval_status: string | null;
  made_to_order: boolean | null;
  sold_out_action: string | null;
  sold_out_extra_amount: number | null;
  sold_out_extra_pct: number | null;
  sold_out_extra_days: number | null;
}

interface VariantRow {
  id: string;
  price: number | string | null;
  stock: number | null;
}

export function useSyncCartPrices(enabled = true) {
  const items = useCart(st => st.items);
  const setPrices = useCart(st => st.setPrices);
  const removeItem = useCart(st => st.removeItem);
  // Re-check when lines, their sizes or quantities change (a quantity above
  // the stock left makes a line made to order).
  const linesKey = items
    .map(i => `${cartLineKey(i)}:${i.variantId}:${i.quantity}`)
    .join(',');

  useEffect(() => {
    if (!enabled || items.length === 0) return;
    let alive = true;
    (async () => {
      const productIds = [...new Set(items.map(i => i.productId))];
      const variantIds = [
        ...new Set(items.map(i => i.variantId).filter(id => UUID_RE.test(id))),
      ];
      const [
        { data: products, error: productsError },
        { data: variants, error: variantsError },
      ] = await Promise.all([
        supabase
          .from('products')
          .select(
            'id, price, stock_quantity, is_active, approval_status, made_to_order, sold_out_action, sold_out_extra_amount, sold_out_extra_pct, sold_out_extra_days',
          )
          .in('id', productIds),
        variantIds.length
          ? supabase
              .from('product_variants')
              .select('id, price, stock')
              .in('id', variantIds)
          : Promise.resolve({ data: [] as VariantRow[], error: null }),
      ]);
      // Only a lookup that worked can say a piece is gone.
      if (!alive || !products || productsError || variantsError) return;
      const productById = new Map(
        (products as ProductRow[]).map(p => [p.id, p]),
      );
      const variantById = new Map(
        ((variants ?? []) as VariantRow[]).map(v => [v.id, v]),
      );

      const unavailable = items.filter(item => {
        const product = productById.get(item.productId);
        if (
          !product ||
          product.is_active === false ||
          product.approval_status !== 'approved'
        )
          return true;
        return UUID_RE.test(item.variantId) && !variantById.has(item.variantId);
      });
      if (unavailable.length) {
        unavailable.forEach(item => removeItem(cartLineKey(item)));
        const n = unavailable.length;
        toast(
          `${n} ${n === 1 ? 'item is' : 'items are'} no longer available and ${
            n === 1 ? 'was' : 'were'
          } removed.\n${unavailable.map(i => i.productName).join(', ')}`,
          { important: true },
        );
        // The bag changed: this runs again for what's left.
        return;
      }

      const updates: Record<string, LinePrice> = {};
      let priceMoved = false;
      const nowMadeToOrder: CartItem[] = [];
      const backInStock: CartItem[] = [];
      for (const item of items) {
        const product = productById.get(item.productId);
        const variant = variantById.get(item.variantId);
        const variantPrice =
          variant?.price == null ? null : Number(variant.price);
        const base = variantPrice ?? (product ? Number(product.price) : null);
        if (base == null || !Number.isFinite(base)) continue;
        const oldAmount = Number(item.price.amount);
        const oldBase =
          item.basePrice != null ? Number(item.basePrice) : oldAmount;
        const customisation = item.customisation?.pct
          ? rechargeAt(item.customisation, base)
          : null;
        const customExtra = customisation
          ? customisationPrice(customisation)
          : item.customisation
          ? oldAmount - oldBase - (item.soldOutTerms?.extra ?? 0)
          : 0;
        // The stock checkout takes from: the variant's, or the product's own.
        const stock = variant
          ? Number(variant.stock ?? 0)
          : Number(product?.stock_quantity ?? 0);
        const terms =
          stock < item.quantity
            ? soldOutTermsFor(readSoldOutSetup(product), base)
            : null;
        const amount =
          Math.round((base + customExtra + (terms?.extra ?? 0)) * 100) / 100;
        const termsChanged = !sameTerms(item.soldOutTerms ?? null, terms);
        if (Math.abs(amount - oldAmount) >= 0.01 || termsChanged) {
          updates[cartLineKey(item)] = {
            amount: String(amount),
            ...(item.basePrice != null || terms
              ? { basePrice: String(base) }
              : {}),
            ...(customisation ? { customisation } : {}),
            ...(termsChanged ? { soldOutTerms: terms } : {}),
          };
          if (!termsChanged) priceMoved = true;
          else if (terms && !item.soldOutTerms) nowMadeToOrder.push(item);
          else if (!terms && item.soldOutTerms) backInStock.push(item);
          else priceMoved = true;
        }
      }
      if (Object.keys(updates).length === 0) return;
      setPrices(updates);
      const names = (lines: CartItem[]) => lines.map(lineName).join(', ');
      const messages = [
        nowMadeToOrder.length > 0 &&
          `${names(nowMadeToOrder)} has sold out - it's now made to order\n` +
            'The boutique will make it for you. Check the extra charge and the longer delivery time in your cart.',
        backInStock.length > 0 &&
          `${names(backInStock)} is back in stock\n` +
            'It now ships from stock, without the made-to-order charge.',
        priceMoved &&
          'Prices in your cart were updated\n' +
            "Your cart now shows today's prices, GST included.",
      ].filter((m): m is string => !!m);
      toast(messages.join('\n\n'), { important: true });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, linesKey]);
}
