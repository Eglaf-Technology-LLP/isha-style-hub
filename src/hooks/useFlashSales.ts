import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdmin } from "./useAdmin";

export interface FlashSale {
  id: string;
  name: string;
  description: string | null;
  discount_percentage: number;
  product_ids: string[];
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FlashSaleFormData {
  name: string;
  description?: string;
  discount_percentage: number;
  product_ids: string[];
  starts_at: string;
  ends_at: string;
  is_active?: boolean;
}

export function useFlashSales(isAdmin: boolean = false) {
  const [flashSales, setFlashSales] = useState<FlashSale[]>([]);
  const [activeFlashSales, setActiveFlashSales] = useState<FlashSale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFlashSales();
  }, [isAdmin]);

  const fetchFlashSales = async () => {
    try {
      const { data, error } = await supabase
        .from('flash_sales')
        .select('*')
        .order('starts_at', { ascending: false });

      if (error) throw error;
      
      const now = new Date();
      const all = (data || []) as FlashSale[];
      setFlashSales(all);
      
      const active = all.filter(sale => 
        sale.is_active && 
        new Date(sale.starts_at) <= now && 
        new Date(sale.ends_at) > now
      );
      setActiveFlashSales(active);
    } catch (error) {
      console.error('Error fetching flash sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const createFlashSale = async (saleData: FlashSaleFormData) => {
    try {
      const { data, error } = await supabase
        .from('flash_sales')
        .insert({
          ...saleData,
          is_active: saleData.is_active ?? true,
        })
        .select()
        .single();

      if (error) throw error;

      setFlashSales(prev => [data as FlashSale, ...prev]);
      toast.success('Flash sale created!');
      return data as FlashSale;
    } catch (error) {
      console.error('Error creating flash sale:', error);
      toast.error('Failed to create flash sale');
      return null;
    }
  };

  const updateFlashSale = async (id: string, saleData: Partial<FlashSaleFormData>) => {
    try {
      const { error } = await supabase
        .from('flash_sales')
        .update(saleData)
        .eq('id', id);

      if (error) throw error;

      await fetchFlashSales();
      toast.success('Flash sale updated!');
      return true;
    } catch (error) {
      console.error('Error updating flash sale:', error);
      toast.error('Failed to update flash sale');
      return false;
    }
  };

  const deleteFlashSale = async (id: string) => {
    try {
      const { error } = await supabase
        .from('flash_sales')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setFlashSales(prev => prev.filter(s => s.id !== id));
      toast.success('Flash sale deleted');
      return true;
    } catch (error) {
      console.error('Error deleting flash sale:', error);
      toast.error('Failed to delete flash sale');
      return false;
    }
  };

  const getFlashSaleForProduct = (productId: string) => {
    return activeFlashSales.find(sale => sale.product_ids.includes(productId));
  };

  const getTimeRemaining = (endsAt: string) => {
    const end = new Date(endsAt).getTime();
    const now = Date.now();
    const diff = end - now;

    if (diff <= 0) return null;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return { hours, minutes, seconds, total: diff };
  };

  return {
    flashSales,
    activeFlashSales,
    loading,
    createFlashSale,
    updateFlashSale,
    deleteFlashSale,
    getFlashSaleForProduct,
    getTimeRemaining,
    refetch: fetchFlashSales,
  };
}
