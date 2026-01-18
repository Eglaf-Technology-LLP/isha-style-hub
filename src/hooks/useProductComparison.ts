import { useState, useEffect } from "react";
import { toast } from "sonner";

const MAX_COMPARE_ITEMS = 4;
const LOCAL_STORAGE_KEY = 'product_comparison';

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

export function useProductComparison() {
  const [compareProducts, setCompareProducts] = useState<CompareProduct[]>([]);

  useEffect(() => {
    loadFromLocalStorage();
  }, []);

  const loadFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        setCompareProducts(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading comparison from localStorage:', error);
    }
  };

  const saveToLocalStorage = (products: CompareProduct[]) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(products));
    } catch (error) {
      console.error('Error saving comparison to localStorage:', error);
    }
  };

  const addToComparison = (product: CompareProduct) => {
    if (compareProducts.length >= MAX_COMPARE_ITEMS) {
      toast.error(`You can only compare up to ${MAX_COMPARE_ITEMS} products`);
      return false;
    }

    if (compareProducts.some(p => p.id === product.id)) {
      toast.info('Product already in comparison');
      return false;
    }

    const updated = [...compareProducts, product];
    setCompareProducts(updated);
    saveToLocalStorage(updated);
    toast.success('Added to comparison');
    return true;
  };

  const removeFromComparison = (productId: string) => {
    const updated = compareProducts.filter(p => p.id !== productId);
    setCompareProducts(updated);
    saveToLocalStorage(updated);
    toast.success('Removed from comparison');
  };

  const clearComparison = () => {
    setCompareProducts([]);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    toast.success('Comparison cleared');
  };

  const isInComparison = (productId: string) => {
    return compareProducts.some(p => p.id === productId);
  };

  return {
    compareProducts,
    addToComparison,
    removeFromComparison,
    clearComparison,
    isInComparison,
    maxItems: MAX_COMPARE_ITEMS,
  };
}
