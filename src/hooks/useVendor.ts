import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface Vendor {
  id: string;
  owner_user_id: string | null;
  name: string;
  slug: string;
  logo_url: string | null;
  banner_url: string | null;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  gst_number: string | null;
  pan_number: string | null;
  address: Record<string, string> | null;
  shiprocket_pickup_location: string | null;
  shiprocket_pickup_registered_at: string | null;
  status: string;
  is_trusted: boolean;
  commission_rate: number;
  shipping_flat_rate: number;
  free_shipping_threshold: number | null;
  return_window_days: number;
  return_policy: string | null;
  payout_account_status: string;
  rating: number;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorRegistrationInput {
  name: string;
  description: string;
  contact_email: string;
  contact_phone: string;
  gst_number: string;
  pan_number: string;
  address: Record<string, string>;
  shipping_flat_rate: number;
  free_shipping_threshold: number | null;
  return_window_days: number;
  return_policy: string;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function useVendor() {
  const { user, loading: authLoading } = useAuth();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchVendor = useCallback(async () => {
    if (!user) {
      setVendor(null);
      setLoading(false);
      return;
    }
    try {
      const { data: member, error: mErr } = await supabase
        .from("vendor_members")
        .select("vendor_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (mErr) throw mErr;
      if (!member) {
        setVendor(null);
        setLoading(false);
        return;
      }

      const { data: v, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("id", member.vendor_id)
        .maybeSingle();

      if (error) throw error;
      setVendor(v as Vendor);
    } catch (e) {
      console.error("Error fetching vendor:", e);
      setVendor(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    fetchVendor();
  }, [authLoading, fetchVendor]);

  const registerVendor = async (
    input: VendorRegistrationInput
  ): Promise<{ vendor: Vendor | null; error: string | null }> => {
    if (!user) {
      return { vendor: null, error: "You must be signed in to register a store." };
    }
    try {
      let slug = slugify(input.name);
      if (!slug) slug = `store-${Date.now().toString(36)}`;

      // ensure slug uniqueness
      let finalSlug = slug;
      for (let attempt = 1; attempt <= 5; attempt++) {
        const { data: existing } = await supabase
          .from("vendors")
          .select("id")
          .eq("slug", finalSlug)
          .maybeSingle();
        if (!existing) break;
        finalSlug = `${slug}-${attempt}`;
      }

      const { data: v, error } = await supabase
        .from("vendors")
        .insert({
          owner_user_id: user.id,
          name: input.name.trim(),
          slug: finalSlug,
          description: input.description?.trim() || null,
          contact_email: input.contact_email?.trim() || null,
          contact_phone: input.contact_phone?.trim() || null,
          gst_number: input.gst_number?.trim() || null,
          pan_number: input.pan_number?.trim() || null,
          address: input.address,
          shipping_flat_rate: input.shipping_flat_rate ?? 0,
          free_shipping_threshold: input.free_shipping_threshold ?? null,
          return_window_days: input.return_window_days ?? 7,
          return_policy: input.return_policy?.trim() || null,
          status: "pending",
          commission_rate: 10,
          payout_account_status: "not_setup",
          rating: 0,
        })
        .select()
        .single();

      if (error) throw error;

      const { error: mErr } = await supabase
        .from("vendor_members")
        .insert({ user_id: user.id, vendor_id: v.id, role: "owner" });

      if (mErr) throw mErr;

      const newVendor = v as Vendor;
      setVendor(newVendor);
      toast.success("Application submitted! We'll review it shortly.");
      return { vendor: newVendor, error: null };
    } catch (e: any) {
      console.error("registerVendor error:", e);
      return { vendor: null, error: e.message || "Failed to submit application" };
    }
  };

  return {
    vendor,
    loading: authLoading || loading,
    registerVendor,
    refresh: fetchVendor,
    setVendor,
  };
}
