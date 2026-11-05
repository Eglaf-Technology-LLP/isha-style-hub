import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Bag and wishlist, kept on the phone. The bag line has exactly the website's
// CartItem shape (src/stores/cartStore.ts) so phase 2's checkout can send it
// to the same create-razorpay-order function.

export interface CartItem {
  productId: string;
  productName: string;
  productImage: string | null;
  vendorId: string | null;
  variantId: string;
  variantTitle: string;
  price: { amount: string; currencyCode: string };
  quantity: number;
  selectedOptions: { name: string; value: string }[];
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: item => {
        const existing = get().items.find(i => i.variantId === item.variantId);
        set({
          items: existing
            ? get().items.map(i =>
                i.variantId === item.variantId
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i,
              )
            : [...get().items, item],
        });
      },
      setQuantity: (variantId, quantity) =>
        set({
          items:
            quantity <= 0
              ? get().items.filter(i => i.variantId !== variantId)
              : get().items.map(i =>
                  i.variantId === variantId ? { ...i, quantity } : i,
                ),
        }),
      removeItem: variantId =>
        set({ items: get().items.filter(i => i.variantId !== variantId) }),
      clear: () => set({ items: [] }),
    }),
    { name: 'allboutiqs-cart', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export const cartCount = (items: CartItem[]) =>
  items.reduce((n, i) => n + i.quantity, 0);
export const cartTotal = (items: CartItem[]) =>
  items.reduce((n, i) => n + Number(i.price.amount) * i.quantity, 0);

interface WishlistState {
  ids: string[];
  toggle: (productId: string) => void;
}

// Phase 1: on this phone only. Phase 2 (sign-in) syncs it to the account's
// wishlists table, like the website.
export const useWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: id =>
        set({
          ids: get().ids.includes(id)
            ? get().ids.filter(x => x !== id)
            : [id, ...get().ids],
        }),
    }),
    {
      name: 'allboutiqs-wishlist',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
