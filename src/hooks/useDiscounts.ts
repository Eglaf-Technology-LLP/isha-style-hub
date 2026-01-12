import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Discount {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  used_count: number;
  product_ids: string[] | null;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscountFormData {
  code: string;
  name: string;
  description: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  product_ids: string[] | null;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
}

export function useDiscounts() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDiscounts();
  }, []);

  const fetchDiscounts = async () => {
    try {
      const { data, error } = await supabase
        .from("discounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      const typedDiscounts: Discount[] = (data || []).map(d => ({
        ...d,
        discount_type: d.discount_type as "percentage" | "fixed_amount",
        product_ids: d.product_ids as string[] | null,
      }));
      
      setDiscounts(typedDiscounts);
    } catch (error: any) {
      console.error("Error fetching discounts:", error);
      toast.error("Failed to fetch discounts");
    } finally {
      setLoading(false);
    }
  };

  const addDiscount = async (discountData: DiscountFormData): Promise<Discount | null> => {
    try {
      const { data, error } = await supabase
        .from("discounts")
        .insert({
          code: discountData.code.toUpperCase(),
          name: discountData.name,
          description: discountData.description || null,
          discount_type: discountData.discount_type,
          discount_value: discountData.discount_value,
          min_order_amount: discountData.min_order_amount,
          max_uses: discountData.max_uses || null,
          product_ids: discountData.product_ids || null,
          is_active: discountData.is_active,
          starts_at: discountData.starts_at || null,
          expires_at: discountData.expires_at || null,
        })
        .select()
        .single();

      if (error) throw error;

      const newDiscount: Discount = {
        ...data,
        discount_type: data.discount_type as "percentage" | "fixed_amount",
        product_ids: data.product_ids as string[] | null,
      };

      setDiscounts((prev) => [newDiscount, ...prev]);
      toast.success("Discount created successfully");
      return newDiscount;
    } catch (error: any) {
      console.error("Error adding discount:", error);
      if (error.message?.includes("duplicate key")) {
        toast.error("A discount with this code already exists");
      } else {
        toast.error(error.message || "Failed to create discount");
      }
      return null;
    }
  };

  const updateDiscount = async (
    id: string,
    discountData: Partial<DiscountFormData>
  ): Promise<boolean> => {
    try {
      const updateData: any = {};
      
      if (discountData.code !== undefined) updateData.code = discountData.code.toUpperCase();
      if (discountData.name !== undefined) updateData.name = discountData.name;
      if (discountData.description !== undefined) updateData.description = discountData.description;
      if (discountData.discount_type !== undefined) updateData.discount_type = discountData.discount_type;
      if (discountData.discount_value !== undefined) updateData.discount_value = discountData.discount_value;
      if (discountData.min_order_amount !== undefined) updateData.min_order_amount = discountData.min_order_amount;
      if (discountData.max_uses !== undefined) updateData.max_uses = discountData.max_uses;
      if (discountData.product_ids !== undefined) updateData.product_ids = discountData.product_ids;
      if (discountData.is_active !== undefined) updateData.is_active = discountData.is_active;
      if (discountData.starts_at !== undefined) updateData.starts_at = discountData.starts_at;
      if (discountData.expires_at !== undefined) updateData.expires_at = discountData.expires_at;

      const { error } = await supabase
        .from("discounts")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      await fetchDiscounts();
      toast.success("Discount updated successfully");
      return true;
    } catch (error: any) {
      console.error("Error updating discount:", error);
      toast.error(error.message || "Failed to update discount");
      return false;
    }
  };

  const deleteDiscount = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("discounts")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setDiscounts((prev) => prev.filter((d) => d.id !== id));
      toast.success("Discount deleted successfully");
      return true;
    } catch (error: any) {
      console.error("Error deleting discount:", error);
      toast.error(error.message || "Failed to delete discount");
      return false;
    }
  };

  const toggleDiscountStatus = async (id: string, isActive: boolean): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("discounts")
        .update({ is_active: isActive })
        .eq("id", id);

      if (error) throw error;

      setDiscounts((prev) =>
        prev.map((d) => (d.id === id ? { ...d, is_active: isActive } : d))
      );
      toast.success(`Discount ${isActive ? "activated" : "deactivated"}`);
      return true;
    } catch (error: any) {
      console.error("Error toggling discount status:", error);
      toast.error(error.message || "Failed to update discount status");
      return false;
    }
  };

  const validateDiscount = async (
    code: string,
    orderTotal: number,
    productIds?: string[]
  ): Promise<Discount | null> => {
    try {
      const { data, error } = await supabase
        .from("discounts")
        .select("*")
        .eq("code", code.toUpperCase())
        .eq("is_active", true)
        .single();

      if (error) {
        toast.error("Invalid discount code");
        return null;
      }

      const discount = data as Discount;

      // Check if expired
      if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
        toast.error("This discount code has expired");
        return null;
      }

      // Check if not yet started
      if (discount.starts_at && new Date(discount.starts_at) > new Date()) {
        toast.error("This discount code is not yet active");
        return null;
      }

      // Check min order amount
      if (orderTotal < discount.min_order_amount) {
        toast.error(`Minimum order amount of ₹${discount.min_order_amount} required`);
        return null;
      }

      // Check usage limit
      if (discount.max_uses && discount.used_count >= discount.max_uses) {
        toast.error("This discount code has reached its usage limit");
        return null;
      }

      // Check product applicability
      if (discount.product_ids && discount.product_ids.length > 0 && productIds) {
        const hasApplicableProduct = productIds.some(id => 
          discount.product_ids?.includes(id)
        );
        if (!hasApplicableProduct) {
          toast.error("This discount code doesn't apply to items in your cart");
          return null;
        }
      }

      return discount;
    } catch (error: any) {
      console.error("Error validating discount:", error);
      toast.error("Failed to validate discount code");
      return null;
    }
  };

  const incrementUsageCount = async (id: string): Promise<boolean> => {
    try {
      const discount = discounts.find(d => d.id === id);
      if (!discount) return false;

      const { error } = await supabase
        .from("discounts")
        .update({ used_count: discount.used_count + 1 })
        .eq("id", id);

      if (error) throw error;

      setDiscounts(prev =>
        prev.map(d => d.id === id ? { ...d, used_count: d.used_count + 1 } : d)
      );
      return true;
    } catch (error) {
      console.error("Error incrementing usage count:", error);
      return false;
    }
  };

  return {
    discounts,
    loading,
    addDiscount,
    updateDiscount,
    deleteDiscount,
    toggleDiscountStatus,
    validateDiscount,
    incrementUsageCount,
    refetch: fetchDiscounts,
  };
}
