import type { CartItem } from "@/stores/cartStore";

// Meta (Facebook) Pixel events for Ads Manager (client, 28 Nov 2026).
//
// The base code (fbevents.js, init, the first PageView) goes into
// index.html's <head> at build time, and only on a build that has
// VITE_META_PIXEL_ID - the live site, set in netlify.toml (see
// vite.config.ts). Localhost and stage have no ID, so window.fbq doesn't
// exist there and every call below does nothing: test clicks never reach
// the client's Ads Manager.
//
// Standard events sent from the shop:
// - PageView          every page (the next ones in MetaPixelPageViews)
// - ViewContent       a product page
// - AddToCart         Add to Cart (product page, quick add on a card, reorder)
// - InitiateCheckout  the checkout page, with what is being bought
// - Purchase          "Your order is placed", once per order
// Amounts are in rupees (INR), as the customer saw them.

type FbqParams = Record<string, unknown>;
type Fbq = (command: "track", event: string, params?: FbqParams, options?: { eventID: string }) => void;

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

function track(event: string, params?: FbqParams, eventID?: string) {
  const fbq = window.fbq;
  if (!fbq) return;
  try {
    if (eventID) fbq("track", event, params, { eventID });
    else if (params) fbq("track", event, params);
    else fbq("track", event);
  } catch {
    // Tracking must never break the shop.
  }
}

const rupees = (n: number) => Math.round(n * 100) / 100;

interface Line {
  id: string;
  quantity: number;
  item_price: number;
}

// content_ids / contents / value in Meta's standard shape.
function lineParams(lines: Line[]) {
  return {
    content_ids: [...new Set(lines.map((l) => l.id))],
    contents: lines,
    content_type: "product",
    num_items: lines.reduce((n, l) => n + l.quantity, 0),
    value: rupees(lines.reduce((sum, l) => sum + l.item_price * l.quantity, 0)),
    currency: "INR",
  };
}

const cartLines = (items: CartItem[]): Line[] =>
  items.map((i) => ({ id: i.productId, quantity: i.quantity, item_price: rupees(Number(i.price.amount) || 0) }));

export function pixelPageView() {
  track("PageView");
}

export function pixelViewContent(product: { id: string; name: string; price: number }) {
  track("ViewContent", {
    content_ids: [product.id],
    content_name: product.name,
    content_type: "product",
    value: rupees(Number(product.price) || 0),
    currency: "INR",
  });
}

export function pixelAddToCart(items: CartItem[]) {
  if (items.length === 0) return;
  track("AddToCart", {
    ...lineParams(cartLines(items)),
    ...(items.length === 1 ? { content_name: items[0].productName } : {}),
  });
}

export function pixelInitiateCheckout(items: CartItem[]) {
  if (items.length === 0) return;
  track("InitiateCheckout", lineParams(cartLines(items)));
}

// Orders already reported from this browser, so a refresh of the "Your
// order is placed" page doesn't count the sale twice. The order id also goes
// as the eventID, Meta's own key for dropping a repeat.
const PURCHASES_KEY = "allboutiqs-pixel-purchases";
// An order older than this is an old confirmation link opened again, not a
// new sale.
const PURCHASE_FRESH_MS = 24 * 60 * 60 * 1000;

export function pixelPurchase(order: {
  id: string;
  total: number;
  created_at?: string | null;
  order_items: { product_id: string; quantity: number; price: number }[];
}) {
  if (!window.fbq) return;
  if (order.created_at && Date.now() - new Date(order.created_at).getTime() > PURCHASE_FRESH_MS) return;
  let sent: string[] = [];
  try {
    sent = JSON.parse(localStorage.getItem(PURCHASES_KEY) || "[]");
    if (!Array.isArray(sent)) sent = [];
  } catch {
    sent = [];
  }
  if (sent.includes(order.id)) return;
  const lines = order.order_items.map((i) => ({
    id: i.product_id,
    quantity: i.quantity,
    item_price: rupees(Number(i.price) || 0),
  }));
  // value: what the order came to (goods, delivery, COD fee, less any
  // discount), including any part paid from the wallet.
  track("Purchase", { ...lineParams(lines), value: rupees(Number(order.total) || 0) }, order.id);
  try {
    localStorage.setItem(PURCHASES_KEY, JSON.stringify([...sent, order.id].slice(-50)));
  } catch {
    // Private window / storage off: Meta still drops a repeat by eventID.
  }
}
