import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import type { BankProofType, BusinessConstitution, DocumentType } from "@/lib/vendorKyc";

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
  is_verified: boolean;
  commission_rate: number;
  shipping_flat_rate: number;
  free_shipping_threshold: number | null;
  return_window_days: number;
  return_policy: string | null;
  boutique_code: string;
  cod_enabled: boolean;
  returns_enabled: boolean;
  payout_account_status: string;
  rating: number;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonDetails {
  name: string;
  designation: string;
  mobile: string;
  email: string;
}

export interface VendorApplicationInput {
  name: string;
  description: string;
  address: Record<string, string>;
  shipping_flat_rate: number;
  free_shipping_threshold: number | null;
  return_window_days: number;
  return_policy: string;
  business_constitution: BusinessConstitution;
  legal_business_name: string;
  pan: string;
  gstin: string;
  primary_mobile: string;
  alternate_mobile: string;
  business_email: string;
  authorized_person: PersonDetails;
  contact_same_as_authorized: boolean;
  contact_person: PersonDetails | null;
  bank: {
    account_holder_name: string;
    account_number: string;
    ifsc: string;
    bank_name: string;
    proof_type: BankProofType;
  };
}

export interface ApplicationDocument {
  type: DocumentType;
  file: File;
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

  // Uploads each PDF to the applicant's private folder, then submits the
  // whole application in one call - the server validates everything
  // (fields, the constitution's document checklist, that each file is a PDF
  // they uploaded) and creates the store, membership, KYC record, documents
  // and payout account together.
  const submitApplication = async (
    input: VendorApplicationInput,
    documents: ApplicationDocument[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ error: string | null }> => {
    if (!user) return { error: "You must be signed in to apply." };
    try {
      const uploaded = [];
      for (const [i, doc] of documents.entries()) {
        onProgress?.(i, documents.length);
        const path = `${user.id}/${crypto.randomUUID()}.pdf`;
        const { error } = await supabase.storage
          .from("vendor-documents")
          .upload(path, doc.file, { contentType: "application/pdf", upsert: false });
        if (error) throw new Error(`Couldn't upload "${doc.file.name}": ${error.message}`);
        uploaded.push({ doc_type: doc.type, file_path: path, file_name: doc.file.name, file_size: doc.file.size });
      }
      onProgress?.(documents.length, documents.length);

      const { error } = await supabase.rpc("submit_vendor_application", {
        _app: { ...input, documents: uploaded } as never,
      });
      if (error) throw error;

      await fetchVendor();
      toast.success("Application submitted! We'll review it shortly.");
      return { error: null };
    } catch (e: any) {
      console.error("submitApplication error:", e);
      return { error: e.message || "Failed to submit application" };
    }
  };

  return {
    vendor,
    loading: authLoading || loading,
    submitApplication,
    refresh: fetchVendor,
    setVendor,
  };
}
