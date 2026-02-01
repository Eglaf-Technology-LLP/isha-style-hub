import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface LowStockProduct {
  id: string;
  name: string;
  sku: string | null;
  stock_quantity: number;
  low_stock_threshold: number;
  images: string[];
}

export function useLowStockAlerts() {
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
  const [outOfStockProducts, setOutOfStockProducts] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLowStockProducts();
  }, []);

  const fetchLowStockProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, stock_quantity, images")
        .eq("is_active", true)
        .order("stock_quantity", { ascending: true });

      if (error) throw error;

      // Default threshold of 10 since column may not exist yet
      const products: LowStockProduct[] = (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stock_quantity: p.stock_quantity,
        low_stock_threshold: p.low_stock_threshold || 10,
        images: (p.images as string[]) || [],
      }));

      // Separate out-of-stock and low stock
      const outOfStock = products.filter(p => p.stock_quantity === 0);
      const lowStock = products.filter(
        p => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold
      );

      setOutOfStockProducts(outOfStock);
      setLowStockProducts(lowStock);
    } catch (error) {
      console.error("Error fetching low stock products:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateThreshold = async (productId: string, threshold: number): Promise<boolean> => {
    try {
      // Use raw query to update the threshold column
      const { error } = await supabase
        .from("products")
        .update({ low_stock_threshold: threshold } as any)
        .eq("id", productId);

      if (error) throw error;

      await fetchLowStockProducts();
      toast.success("Stock threshold updated");
      return true;
    } catch (error) {
      console.error("Error updating threshold:", error);
      toast.error("Failed to update threshold");
      return false;
    }
  };

  const updateStock = async (productId: string, quantity: number): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("products")
        .update({ stock_quantity: quantity })
        .eq("id", productId);

      if (error) throw error;

      await fetchLowStockProducts();
      toast.success("Stock quantity updated");
      return true;
    } catch (error) {
      console.error("Error updating stock:", error);
      toast.error("Failed to update stock");
      return false;
    }
  };

  return {
    lowStockProducts,
    outOfStockProducts,
    loading,
    updateThreshold,
    updateStock,
    refetch: fetchLowStockProducts,
    totalAlerts: lowStockProducts.length + outOfStockProducts.length,
  };
}
