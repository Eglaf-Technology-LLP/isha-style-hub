import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface RecentlyViewedItem {
  id: string;
  user_id: string;
  product_id: string;
  viewed_at: string;
  product?: {
    id: string;
    name: string;
    price: number;
    compare_at_price: number | null;
    images: string[] | null;
  };
}

const MAX_RECENT_ITEMS = 10;
const LOCAL_STORAGE_KEY = 'recently_viewed_products';

export function useRecentlyViewed() {
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const loadFromLocalStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        setRecentlyViewed(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error);
    }
    setLoading(false);
  }, []);

  const fetchRecentlyViewed = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('recently_viewed')
        .select(`
          *,
          product:products (
            id,
            name,
            price,
            compare_at_price,
            images
          )
        `)
        .eq('user_id', user.id)
        .order('viewed_at', { ascending: false })
        .limit(MAX_RECENT_ITEMS);

      if (error) throw error;
      setRecentlyViewed(data || []);
    } catch (error) {
      console.error('Error fetching recently viewed:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchRecentlyViewed();
    } else {
      loadFromLocalStorage();
    }
  }, [user, fetchRecentlyViewed, loadFromLocalStorage]);

  const saveToLocalStorage = (items: RecentlyViewedItem[]) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENT_ITEMS)));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  const trackProductView = useCallback(async (productId: string, product?: RecentlyViewedItem['product']) => {
    if (user) {
      try {
        const { error } = await supabase
          .from('recently_viewed')
          .upsert(
            {
              user_id: user.id,
              product_id: productId,
              viewed_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,product_id' }
          );

        if (error) throw error;
        await fetchRecentlyViewed();
      } catch (error) {
        console.error('Error tracking product view:', error);
      }
    } else {
      // For non-authenticated users, store in localStorage
      const newItem: RecentlyViewedItem = {
        id: crypto.randomUUID(),
        user_id: '',
        product_id: productId,
        viewed_at: new Date().toISOString(),
        product,
      };

      setRecentlyViewed(prev => {
        const filtered = prev.filter(item => item.product_id !== productId);
        const updated = [newItem, ...filtered].slice(0, MAX_RECENT_ITEMS);
        saveToLocalStorage(updated);
        return updated;
      });
    }
  }, [user, fetchRecentlyViewed]);

  const clearRecentlyViewed = useCallback(async () => {
    if (user) {
      try {
        const { error } = await supabase
          .from('recently_viewed')
          .delete()
          .eq('user_id', user.id);

        if (error) throw error;
        setRecentlyViewed([]);
      } catch (error) {
        console.error('Error clearing recently viewed:', error);
      }
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      setRecentlyViewed([]);
    }
  }, [user]);

  return {
    recentlyViewed,
    loading,
    trackProductView,
    clearRecentlyViewed,
    refetch: user ? fetchRecentlyViewed : loadFromLocalStorage,
  };
}
