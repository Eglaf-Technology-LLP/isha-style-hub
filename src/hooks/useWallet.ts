import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_REFUND_CHARGE, RefundCharge } from "@/lib/wallet";

export interface WalletTransaction {
  id: string;
  amount: number;
  kind: string;
  order_id: string | null;
  note: string | null;
  created_at: string;
}

// The signed-in customer's wallet balance (and, if asked, its history).
// Balance is null until loaded, and stays null when signed out.
export function useWallet(userId: string | null | undefined, { withHistory = false } = {}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setBalance(null);
      setTransactions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: bal, error }, history] = await Promise.all([
      supabase.rpc("my_wallet_balance"),
      withHistory
        ? supabase
            .from("wallet_transactions")
            .select("id, amount, kind, order_id, note, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: null }),
    ]);
    if (error) console.error("Couldn't load the wallet balance:", error.message);
    setBalance(error ? null : Number(bal ?? 0));
    if (withHistory) setTransactions((history.data as WalletTransaction[] | null) ?? []);
    setLoading(false);
  }, [userId, withHistory]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balance, transactions, loading, refresh };
}

// The admin's refund charge on refunds to the bank / original payment.
export function useRefundCharge() {
  const [charge, setCharge] = useState<RefundCharge>(DEFAULT_REFUND_CHARGE);
  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("refund_charge_pct, refund_charge_gst_pct")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCharge({ pct: Number(data.refund_charge_pct), gstPct: Number(data.refund_charge_gst_pct) });
      });
  }, []);
  return charge;
}
