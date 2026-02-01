import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export interface StockNotification {
  id: string;
  user_id: string | null;
  product_id: string;
  email: string;
  is_notified: boolean;
  created_at: string;
}

export function useStockNotifications(productId?: string) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<StockNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (productId) {
      checkSubscription();
    } else {
      setLoading(false);
    }
  }, [productId, user]);

  const checkSubscription = async () => {
    if (!productId) return;

    setLoading(true);
    try {
      let query = (supabase as any)
        .from("stock_notifications")
        .select("*")
        .eq("product_id", productId)
        .eq("is_notified", false);

      if (user) {
        query = query.eq("user_id", user.id);
      }

      const { data, error } = await query;

      if (error) {
        // Table might not exist yet
        console.error("Error checking subscription:", error);
        setNotifications([]);
        setIsSubscribed(false);
        return;
      }

      setNotifications((data || []) as StockNotification[]);
      setIsSubscribed((data || []).length > 0);
    } catch (error) {
      console.error("Error checking subscription:", error);
      setNotifications([]);
      setIsSubscribed(false);
    } finally {
      setLoading(false);
    }
  };

  const subscribe = async (email: string): Promise<boolean> => {
    if (!productId) return false;

    try {
      // Check if already subscribed
      const { data: existing } = await (supabase as any)
        .from("stock_notifications")
        .select("id")
        .eq("product_id", productId)
        .eq("email", email)
        .eq("is_notified", false)
        .single();

      if (existing) {
        toast.info("You're already subscribed for this product");
        return true;
      }

      const { error } = await (supabase as any)
        .from("stock_notifications")
        .insert({
          product_id: productId,
          user_id: user?.id || null,
          email,
          is_notified: false,
        });

      if (error) throw error;

      setIsSubscribed(true);
      toast.success("You'll be notified when this product is back in stock!");
      return true;
    } catch (error: any) {
      console.error("Error subscribing:", error);
      toast.error(error.message || "Failed to subscribe");
      return false;
    }
  };

  const unsubscribe = async (): Promise<boolean> => {
    if (!productId || !user) return false;

    try {
      const { error } = await (supabase as any)
        .from("stock_notifications")
        .delete()
        .eq("product_id", productId)
        .eq("user_id", user.id);

      if (error) throw error;

      setIsSubscribed(false);
      toast.success("Unsubscribed from stock notifications");
      return true;
    } catch (error: any) {
      console.error("Error unsubscribing:", error);
      toast.error(error.message || "Failed to unsubscribe");
      return false;
    }
  };

  return {
    notifications,
    loading,
    isSubscribed,
    subscribe,
    unsubscribe,
    refetch: checkSubscription,
  };
}

// Admin hook to get all pending notifications
export function useAdminStockNotifications() {
  const [notifications, setNotifications] = useState<(StockNotification & { product_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("stock_notifications")
        .select("*")
        .eq("is_notified", false)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching notifications:", error);
        setNotifications([]);
        setLoading(false);
        return;
      }

      // Fetch product names
      const productIdSet = new Set<string>();
      (data || []).forEach((n: any) => {
        if (n.product_id) productIdSet.add(n.product_id as string);
      });
      const productIds = Array.from(productIdSet);
      
      if (productIds.length === 0) {
        setNotifications([]);
        setLoading(false);
        return;
      }

      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .in("id", productIds);

      const productMap = new Map(products?.map(p => [p.id, p.name]) || []);

      const enriched = (data || []).map((n: any) => ({
        ...n,
        product_name: productMap.get(n.product_id) || "Unknown Product",
      }));

      setNotifications(enriched);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const markAsNotified = async (ids: string[]): Promise<boolean> => {
    try {
      const { error } = await (supabase as any)
        .from("stock_notifications")
        .update({ is_notified: true })
        .in("id", ids);

      if (error) throw error;

      await fetchNotifications();
      toast.success("Notifications marked as sent");
      return true;
    } catch (error) {
      console.error("Error marking notifications:", error);
      toast.error("Failed to update notifications");
      return false;
    }
  };

  return {
    notifications,
    loading,
    markAsNotified,
    refetch: fetchNotifications,
    pendingCount: notifications.length,
  };
}
