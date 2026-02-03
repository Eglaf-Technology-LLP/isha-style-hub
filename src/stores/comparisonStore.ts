import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "sonner";

const MAX_COMPARE_ITEMS = 4;

export interface CompareProduct {
  id: string;
  name: string;
  price: number;
  compare_at_price: number | null;
  images: string[] | null;
  description: string | null;
  category_id: string | null;
  variants: unknown;
}

interface ComparisonStore {
  compareProducts: CompareProduct[];
  addToComparison: (product: CompareProduct) => boolean;
  removeFromComparison: (productId: string) => void;
  clearComparison: () => void;
  isInComparison: (productId: string) => boolean;
  maxItems: number;
}

export const useComparisonStore = create<ComparisonStore>()(
  persist(
    (set, get) => ({
      compareProducts: [],
      maxItems: MAX_COMPARE_ITEMS,

      addToComparison: (product: CompareProduct) => {
        const { compareProducts } = get();
        
        if (compareProducts.length >= MAX_COMPARE_ITEMS) {
          toast.error(`You can only compare up to ${MAX_COMPARE_ITEMS} products`);
          return false;
        }

        if (compareProducts.some((p) => p.id === product.id)) {
          toast.info("Product already in comparison");
          return false;
        }

        set({ compareProducts: [...compareProducts, product] });
        toast.success("Added to comparison");
        return true;
      },

      removeFromComparison: (productId: string) => {
        set({
          compareProducts: get().compareProducts.filter((p) => p.id !== productId),
        });
        toast.success("Removed from comparison");
      },

      clearComparison: () => {
        set({ compareProducts: [] });
        toast.success("Comparison cleared");
      },

      isInComparison: (productId: string) => {
        return get().compareProducts.some((p) => p.id === productId);
      },
    }),
    {
      name: "product-comparison",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
