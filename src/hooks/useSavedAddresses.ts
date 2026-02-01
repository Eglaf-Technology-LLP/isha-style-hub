import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export interface SavedAddress {
  id: string;
  user_id: string;
  label: string;
  full_name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
  created_at: string;
}

export interface AddressFormData {
  label: string;
  full_name: string;
  phone: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
}

export function useSavedAddresses() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchAddresses();
    } else {
      setAddresses([]);
      setLoading(false);
    }
  }, [user]);

  const fetchAddresses = async () => {
    if (!user) return;

    try {
      // Use rpc or raw query for new tables not yet in types
      const { data, error } = await supabase
        .rpc('get_user_addresses' as any, { p_user_id: user.id })
        .select('*');

      // Fallback: direct query with type assertion
      if (error) {
        const { data: rawData, error: rawError } = await (supabase as any)
          .from("saved_addresses")
          .select("*")
          .eq("user_id", user.id)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: false });

        if (rawError) throw rawError;
        setAddresses((rawData || []) as SavedAddress[]);
      } else {
        setAddresses((data || []) as SavedAddress[]);
      }
    } catch (error) {
      console.error("Error fetching addresses:", error);
      // Table might not exist yet, silently fail
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  };

  const addAddress = async (addressData: AddressFormData): Promise<SavedAddress | null> => {
    if (!user) {
      toast.error("Please sign in to save addresses");
      return null;
    }

    try {
      // If this is set as default, unset other defaults first
      if (addressData.is_default) {
        await (supabase as any)
          .from("saved_addresses")
          .update({ is_default: false })
          .eq("user_id", user.id);
      }

      const { data, error } = await (supabase as any)
        .from("saved_addresses")
        .insert({
          user_id: user.id,
          ...addressData,
        })
        .select()
        .single();

      if (error) throw error;

      await fetchAddresses();
      toast.success("Address saved successfully");
      return data as SavedAddress;
    } catch (error: any) {
      console.error("Error adding address:", error);
      toast.error(error.message || "Failed to save address");
      return null;
    }
  };

  const updateAddress = async (id: string, addressData: Partial<AddressFormData>): Promise<boolean> => {
    if (!user) return false;

    try {
      // If setting as default, unset other defaults first
      if (addressData.is_default) {
        await (supabase as any)
          .from("saved_addresses")
          .update({ is_default: false })
          .eq("user_id", user.id)
          .neq("id", id);
      }

      const { error } = await (supabase as any)
        .from("saved_addresses")
        .update(addressData)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      await fetchAddresses();
      toast.success("Address updated");
      return true;
    } catch (error: any) {
      console.error("Error updating address:", error);
      toast.error(error.message || "Failed to update address");
      return false;
    }
  };

  const deleteAddress = async (id: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await (supabase as any)
        .from("saved_addresses")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      await fetchAddresses();
      toast.success("Address deleted");
      return true;
    } catch (error: any) {
      console.error("Error deleting address:", error);
      toast.error(error.message || "Failed to delete address");
      return false;
    }
  };

  const setDefaultAddress = async (id: string): Promise<boolean> => {
    return updateAddress(id, { is_default: true });
  };

  const defaultAddress = addresses.find(a => a.is_default) || addresses[0] || null;

  return {
    addresses,
    loading,
    defaultAddress,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    refetch: fetchAddresses,
  };
}
