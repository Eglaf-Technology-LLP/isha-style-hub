import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CustomisationChoice } from '@/lib/customisation';

export interface CartItem {
  productId: string;
  productName: string;
  productImage: string | null;
  vendorId: string | null;
  variantId: string;
  variantTitle: string;
  price: {
    amount: string;
    currencyCode: string;
  };
  quantity: number;
  selectedOptions: Array<{
    name: string;
    value: string;
  }>;
  // A customised piece is its own cart line (never merged with the same
  // variant): lineId identifies it, price.amount already includes the
  // customisation, basePrice is the product's own price.
  lineId?: string;
  customisation?: CustomisationChoice | null;
  basePrice?: string;
  // The boutique's own product code, shown on the cart line (lines added
  // before it was kept don't show one).
  sku?: string | null;
}

// The id cart actions use for a line.
export const cartLineKey = (item: Pick<CartItem, 'lineId' | 'variantId'>) => item.lineId ?? item.variantId;

// What changes when a line moves to another size of the same piece.
export type VariantChange = Pick<CartItem, 'variantId' | 'variantTitle' | 'selectedOptions' | 'price' | 'productImage' | 'basePrice' | 'customisation'>;
// A line's new price; a % customisation charge moves with it (see rechargeAt).
export type LinePrice = { amount: string; basePrice?: string; customisation?: CustomisationChoice | null };

interface CartStore {
  items: CartItem[];

  // Actions
  addItem: (item: CartItem) => void;
  addItems: (items: CartItem[]) => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  changeVariant: (lineKey: string, next: VariantChange, maxQuantity?: number) => void;
  removeItem: (lineKey: string) => void;
  clearCart: () => void;
  // Today's prices for some lines (line key -> price, and base price for a
  // customised line) - see useSyncCartPrices.
  setPrices: (prices: Record<string, LinePrice>) => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        const { items } = get();
        const existingItem = items.find(i => cartLineKey(i) === cartLineKey(item));

        if (existingItem) {
          set({
            items: items.map(i =>
              cartLineKey(i) === cartLineKey(item)
                ? { ...i, quantity: i.quantity + item.quantity }
                : i
            )
          });
        } else {
          set({ items: [...items, item] });
        }
      },

      // Same merge-by-variantId rule as addItem, applied once over a batch
      // (Reorder) instead of one set() call per item.
      addItems: (newItems) => {
        let items = get().items;
        for (const item of newItems) {
          const existingItem = items.find((i) => cartLineKey(i) === cartLineKey(item));
          items = existingItem
            ? items.map((i) =>
                cartLineKey(i) === cartLineKey(item) ? { ...i, quantity: i.quantity + item.quantity } : i,
              )
            : [...items, item];
        }
        set({ items });
      },

      updateQuantity: (lineKey, quantity) => {
        if (quantity <= 0) {
          get().removeItem(lineKey);
          return;
        }

        set({
          items: get().items.map(item =>
            cartLineKey(item) === lineKey ? { ...item, quantity } : item
          )
        });
      },

      // Another size of the same piece, from the cart (client corrections,
      // 15 Nov 2026, 2.8.2 b). The line takes the new variant's id, size,
      // price and photo, keeping its place in the cart. A plain line joins
      // one already there for that size; a customised line stays its own.
      // maxQuantity: what the new size has in stock.
      changeVariant: (lineKey, next, maxQuantity) => {
        const items = get().items;
        const line = items.find((i) => cartLineKey(i) === lineKey);
        if (!line) return;
        const cap = (q: number) => (maxQuantity != null ? Math.max(1, Math.min(q, maxQuantity)) : q);
        if (!line.lineId) {
          const twin = items.find((i) => i !== line && !i.lineId && i.variantId === next.variantId);
          if (twin) {
            set({
              items: items
                .filter((i) => i !== line)
                .map((i) => (i === twin ? { ...i, quantity: cap(i.quantity + line.quantity) } : i)),
            });
            return;
          }
        }
        set({ items: items.map((i) => (i === line ? { ...line, ...next, quantity: cap(line.quantity) } : i)) });
      },

      removeItem: (lineKey) => {
        set({
          items: get().items.filter(item => cartLineKey(item) !== lineKey)
        });
      },

      clearCart: () => {
        set({ items: [] });
      },

      setPrices: (prices) => {
        set({
          items: get().items.map((item) => {
            const p = prices[cartLineKey(item)];
            if (!p) return item;
            return {
              ...item,
              price: { ...item.price, amount: p.amount },
              ...(p.basePrice ? { basePrice: p.basePrice } : {}),
              ...(p.customisation ? { customisation: p.customisation } : {}),
            };
          }),
        });
      },

      getTotalItems: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      getTotalPrice: () => {
        return get().items.reduce((sum, item) => sum + (parseFloat(item.price.amount) * item.quantity), 0);
      }
    }),
    {
      name: 'allboutiqs-cart',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
