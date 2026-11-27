import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import type { BankProofType, BusinessConstitution, DocumentType } from "@/lib/vendorKyc";
import { ACCESS_CHECK_QUERY, accessCheckState } from "@/lib/accessCheck";

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
  // Boutique-specific commission override; null = the platform rate in force.
  commission_rate: number | null;
  // Founding Boutique: badge, and 0% commission between these dates.
  is_founding: boolean;
  founding_from: string | null;
  founding_until: string | null;
  shipping_flat_rate: number;
  free_shipping_threshold: number | null;
  return_window_days: number;
  return_policy: string | null;
  // "Ready to ship in N days" - null means the platform default (2).
  default_prep_days: number | null;
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
  // No shipping rates: delivery is free for customers (submit_vendor_application
  // stores 0 / none).
  return_window_days: number;
  return_policy: string;
  business_constitution: BusinessConstitution;
  brand_same_as_legal: boolean;
  brand_legal_declaration: boolean;
  legal_business_name: string;
  instagram_url: string;
  website_url: string;
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

// The signed-in person's boutique, shared by every screen and kept for 5
// minutes (it used to be looked up again by each screen on every mount and
// tab switch - ~89k vendor_members calls on 27 Nov 2026). Saving the store's
// settings calls refresh(), which updates every screen at once.
const VENDOR_STALE_MS = 5 * 60_000;

async function fetchOwnVendor(userId: string): Promise<Vendor | null> {
  try {
    const { data: member, error: mErr } = await supabase
      .from("vendor_members")
      .select("vendor_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (mErr) throw mErr;
    if (!member) return null;

    const { data: v, error } = await supabase
      .from("vendors")
      .select("*")
      .eq("id", member.vendor_id)
      .maybeSingle();

    if (error) throw error;
    return (v as Vendor) ?? null;
  } catch (e) {
    console.error("Error fetching vendor:", e);
    throw e;
  }
}

export function useVendor() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["my-vendor", user?.id], [user?.id]);
  const query = useQuery({
    queryKey,
    enabled: !!user,
    staleTime: VENDOR_STALE_MS,
    ...ACCESS_CHECK_QUERY,
    queryFn: () => fetchOwnVendor(user!.id),
  });
  const vendor = user ? (query.data ?? null) : null;
  // `vendor` null means "no boutique" only when not loading and not failed.
  const { loading, failed } = accessCheckState(!!user, authLoading, query);
  const { refetch } = query;

  const fetchVendor = useCallback(async () => {
    if (user) await refetch();
  }, [user, refetch]);

  const setVendor = useCallback(
    (next: Vendor | null) => queryClient.setQueryData(queryKey, next),
    [queryClient, queryKey],
  );

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
    loading,
    failed,
    submitApplication,
    refresh: fetchVendor,
    setVendor,
  };
}
