import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { toast } from "sonner";

export interface AdminVendorPayout {
  id: string;
  vendorId: string;
  vendorName: string;
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  commissionAmount: number;
  netPayable: number;
  status: string;
  paidAt: string | null;
  paymentReference: string | null;
  createdAt: string;
}

const unwrapOne = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

// The admin side of the payout ledger - generating a run and marking one
// paid both write through here. RLS on vendor_payouts already restricts
// writes to admins ("Admins manage payouts"), so the mark-paid update goes
// straight through the regular client rather than needing its own function.
export function useAdminVendorPayouts(isAdmin: boolean) {
  const [payouts, setPayouts] = useState<AdminVendorPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      fetchPayouts();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  const fetchPayouts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vendor_payouts")
        .select("*, vendor:vendors(name)")
        .order("period_start", { ascending: false });
      if (error) throw error;

      setPayouts(
        (data ?? []).map((p) => ({
          id: p.id,
          vendorId: p.vendor_id,
          vendorName: unwrapOne(p.vendor)?.name ?? "Unknown vendor",
          periodStart: p.period_start,
          periodEnd: p.period_end,
          grossSales: Number(p.gross_sales),
          commissionAmount: Number(p.commission_amount),
          netPayable: Number(p.net_payable),
          status: p.status,
          paidAt: p.paid_at,
          paymentReference: p.payment_reference,
          createdAt: p.created_at,
        })),
      );
    } catch (error) {
      console.error("Error fetching vendor payouts:", error);
      toast.error("Failed to load vendor payouts");
    } finally {
      setLoading(false);
    }
  };

  const generatePayouts = async () => {
    setGenerating(true);
    const { data, errorMessage } = await invokeEdgeFunction<{
      created: { vendor_name: string; net_payable: number }[];
      skipped: { vendor_name: string; reason: string }[];
    }>("generate-vendor-payouts", {});
    setGenerating(false);

    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    const createdCount = data?.created.length ?? 0;
    if (createdCount === 0) {
      toast.info("Nothing new to pay out for this period.");
    } else {
      toast.success(`Generated ${createdCount} vendor payout${createdCount > 1 ? "s" : ""}.`);
    }
    await fetchPayouts();
  };

  const markPaid = async (payoutId: string, paymentReference: string) => {
    const { error } = await supabase
      .from("vendor_payouts")
      .update({ status: "paid", paid_at: new Date().toISOString(), payment_reference: paymentReference || null })
      .eq("id", payoutId);

    if (error) {
      toast.error("Failed to mark payout as paid");
      return false;
    }
    toast.success("Payout marked as paid");
    await fetchPayouts();
    return true;
  };

  return { payouts, loading, generating, generatePayouts, markPaid, refetch: fetchPayouts };
}
