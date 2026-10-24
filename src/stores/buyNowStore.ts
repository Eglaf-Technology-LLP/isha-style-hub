import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItem } from "@/stores/cartStore";

// "Buy Now" (Developer Corrections Part 8, 18): checkout with only this one
// item; whatever is already in the cart stays there for later. Kept for the
// browser tab, so a refresh on checkout still has it.
interface BuyNowStore {
  item: CartItem | null;
  setItem: (item: CartItem) => void;
  clear: () => void;
}

export const useBuyNowStore = create<BuyNowStore>()(
  persist(
    (set) => ({
      item: null,
      setItem: (item) => set({ item }),
      clear: () => set({ item: null }),
    }),
    { name: "allboutiqs-buy-now", storage: createJSONStorage(() => sessionStorage) },
  ),
);
