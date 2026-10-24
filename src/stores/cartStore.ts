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
}

// The id cart actions use for a line.
export const cartLineKey = (item: Pick<CartItem, 'lineId' | 'variantId'>) => item.lineId ?? item.variantId;

interface CartStore {
  items: CartItem[];

  // Actions
  addItem: (item: CartItem) => void;
  addItems: (items: CartItem[]) => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  removeItem: (lineKey: string) => void;
  clearCart: () => void;
  // Today's prices for some lines (line key -> price, and base price for a
  // customised line) - see useSyncCartPrices.
  setPrices: (prices: Record<string, { amount: string; basePrice?: string }>) => void;
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
            return { ...item, price: { ...item.price, amount: p.amount }, ...(p.basePrice ? { basePrice: p.basePrice } : {}) };
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
