import { create } from "zustand";

// Storefront UI that several places open: the shopping bag (after a quick
// add from a product card) and the search panel.
interface UiStore {
  bagOpen: boolean;
  setBagOpen: (open: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  bagOpen: false,
  setBagOpen: (bagOpen) => set({ bagOpen }),
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),
}));
