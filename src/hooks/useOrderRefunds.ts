import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Refund } from "@/hooks/useRefunds";

// Every refund on an order, wherever it went (client, 27 Nov 2026: a
// cancellation refunded to the AllBoutiqs Wallet showed nowhere for the
// boutique, and "Refund processing" for the customer though the wallet had
// it). Two sources, both readable by the customer, the boutique (its own
// sales) and admins:
// - refunds: money back through the payment gateway - "processing" until the
//   gateway says processed.
// - order_cancellations: what a cancelled part was owed and where it went.
//   The wallet share is credited in the same step as the cancellation, so it
//   is refunded at once; with a gateway refund the rest of what was owed went
//   to the wallet. (Customers' wallet rows are not readable by boutiques.)

export type RefundState = "processing" | "refunded" | "failed";
export type RefundDestination = "wallet" | "original";

export interface RefundEntry {
  id: string;
  orderId: string;
  vendorOrderId: string | null;
  amount: number;
  // null: owed but not sent anywhere yet (the refund step failed).
  destination: RefundDestination | null;
  state: RefundState;
  at: string;
  reason: string | null;
  gateway: Refund | null;
}

interface CancellationRefund {
  id: string;
  order_id: string;
  vendor_order_id: string;
  refund_amount: number | null;
  refund_method: string | null;
  refund_id: string | null;
  refund_fee: number;
  refund_fee_gst: number;
  reason: string | null;
  created_at: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const gatewayState = (status: string): RefundState =>
  status === "processed" ? "refunded" : status === "failed" ? "failed" : "processing";

const gatewayEntry = (r: Refund, vendorOrderId: string | null): RefundEntry => ({
  id: r.id,
  orderId: r.order_id,
  vendorOrderId,
  amount: Number(r.amount),
  destination: "original",
  state: gatewayState(r.status),
  at: r.initiated_at,
  reason: r.reason,
  gateway: r,
});

// One order's refunds. With vendorOrderId (a boutique's view) only that
// part's cancellation, plus gateway refunds no other part's cancellation
// owns (returns, admin refunds).
export function buildRefundEntries(
  refunds: Refund[],
  cancellations: CancellationRefund[],
  vendorOrderId?: string | null,
): RefundEntry[] {
  const byId = new Map(refunds.map((r) => [r.id, r]));
  const linked = new Set(cancellations.map((c) => c.refund_id).filter((id): id is string => !!id));
  const entries: RefundEntry[] = [];

  for (const c of cancellations) {
    if (vendorOrderId && c.vendor_order_id !== vendorOrderId) continue;
    const due = Number(c.refund_amount ?? 0);
    if (due <= 0) continue;
    const gw = c.refund_id ? byId.get(c.refund_id) : undefined;
    if (c.refund_method === null) {
      entries.push({
        id: `cancel-${c.id}`,
        orderId: c.order_id,
        vendorOrderId: c.vendor_order_id,
        amount: due,
        destination: null,
        state: "processing",
        at: c.created_at,
        reason: c.reason,
        gateway: null,
      });
      continue;
    }
    if (gw) entries.push(gatewayEntry(gw, c.vendor_order_id));
    else if (c.refund_id) {
      // A gateway refund this viewer can't read: still on its way.
      entries.push({
        id: c.refund_id,
        orderId: c.order_id,
        vendorOrderId: c.vendor_order_id,
        amount: due,
        destination: "original",
        state: "processing",
        at: c.created_at,
        reason: c.reason,
        gateway: null,
      });
      continue;
    }
    const toWallet = round2(due - (gw ? Number(gw.amount) + Number(c.refund_fee) + Number(c.refund_fee_gst) : 0));
    if (toWallet > 0.009) {
      entries.push({
        id: `wallet-${c.id}`,
        orderId: c.order_id,
        vendorOrderId: c.vendor_order_id,
        amount: toWallet,
        destination: "wallet",
        state: "refunded",
        at: c.created_at,
        reason: c.reason,
        gateway: null,
      });
    }
  }

  for (const r of refunds) {
    if (!linked.has(r.id)) entries.push(gatewayEntry(r, null));
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

export interface RefundSummary {
  amount: number;
  state: RefundState;
  destinations: RefundDestination[];
}

// The order-level picture: still on its way if any part is; failed if one
// failed and none is on its way; otherwise refunded.
export function summariseRefunds(entries: RefundEntry[]): RefundSummary | null {
  if (entries.length === 0) return null;
  const state: RefundState = entries.some((e) => e.state === "processing")
    ? "processing"
    : entries.some((e) => e.state === "failed")
      ? "failed"
      : "refunded";
  const destinations = [...new Set(entries.map((e) => e.destination).filter((d): d is RefundDestination => !!d))];
  return { amount: round2(entries.reduce((s, e) => s + e.amount, 0)), state, destinations };
}

export const REFUND_STATE_STYLE: Record<RefundState, { label: string; className: string }> = {
  processing: { label: "Refund processing", className: "bg-amber-100 text-amber-800 border-amber-200" },
  refunded: { label: "Refunded", className: "bg-green-100 text-green-800 border-green-200" },
  failed: { label: "Refund failed", className: "bg-red-100 text-red-800 border-red-200" },
};

// "to the AllBoutiqs Wallet" / "to the original payment". `whose` is "your"
// for the customer, "the customer's" for the boutique and admins.
export function refundDestinationText(destinations: RefundDestination[], whose: "your" | "the customer's"): string {
  const wallet = whose === "your" ? "your AllBoutiqs Wallet" : "the customer's AllBoutiqs Wallet";
  const original = whose === "your" ? "your original payment method" : "the customer's original payment method";
  if (destinations.length === 2) return `to ${wallet} and ${original}`;
  if (destinations[0] === "wallet") return `to ${wallet}`;
  if (destinations[0] === "original") return `to ${original}`;
  return "";
}

// Refunds for several orders at once (one query per table). `version`: any
// string that changes when the orders do (e.g. their statuses), to read the
// refunds again after a cancellation.
export function useOrderRefunds(orderIds: string[], vendorOrderId?: string | null, version = "") {
  const key = [...new Set(orderIds)].sort().join(",");
  const [data, setData] = useState<{ refunds: Refund[]; cancellations: CancellationRefund[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setData({ refunds: [], cancellations: [] });
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([
      supabase.from("refunds").select("*").in("order_id", ids),
      supabase
        .from("order_cancellations")
        .select("id, order_id, vendor_order_id, refund_amount, refund_method, refund_id, refund_fee, refund_fee_gst, reason, created_at")
        .in("order_id", ids),
    ]).then(([refundsRes, cancelRes]) => {
      if (!active) return;
      if (refundsRes.error) console.error("Error fetching refunds:", refundsRes.error);
      if (cancelRes.error) console.error("Error fetching cancellations:", cancelRes.error);
      setData({
        refunds: (refundsRes.data ?? []) as Refund[],
        cancellations: (cancelRes.data ?? []) as CancellationRefund[],
      });
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [key, version]);

  const byOrder = useMemo(() => {
    const map = new Map<string, RefundEntry[]>();
    if (!data) return map;
    for (const id of key ? key.split(",") : []) {
      map.set(
        id,
        buildRefundEntries(
          data.refunds.filter((r) => r.order_id === id),
          data.cancellations.filter((c) => c.order_id === id),
          vendorOrderId,
        ),
      );
    }
    return map;
  }, [data, key, vendorOrderId]);

  return { byOrder, loading };
}
