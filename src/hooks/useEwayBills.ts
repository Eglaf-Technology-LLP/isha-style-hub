import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { BOUTIQUE_LEGS, EwayBillLeg } from "@/lib/ewayBill";

export type EwayBillRow = Tables<"eway_bills">;

// E-way bills behind a boutique's order list: which parts are over the limit
// and the requests / numbers for them.
export function useEwayBills(vendorOrderIds: string[]) {
  const [requiredValue, setRequiredValue] = useState<Map<string, number>>(new Map());
  const [bills, setBills] = useState<EwayBillRow[]>([]);
  const idsKey = [...vendorOrderIds].sort().join(",");

  const load = useCallback(async () => {
    if (!idsKey) {
      setRequiredValue(new Map());
      setBills([]);
      return;
    }
    const ids = idsKey.split(",");
    const [{ data: requirements }, { data: rows }] = await Promise.all([
      supabase.rpc("eway_bill_requirements", { _vendor_order_ids: ids }),
      supabase.from("eway_bills").select("*").in("vendor_order_id", ids).neq("status", "cancelled").order("created_at"),
    ]);
    setRequiredValue(new Map((requirements ?? []).filter((r) => r.required).map((r) => [r.vendor_order_id, Number(r.invoice_value)])));
    setBills(rows ?? []);
  }, [idsKey]);

  useEffect(() => {
    load();
  }, [load]);

  // The boutique's own leg of the order (to the customer or to the
  // warehouse): the latest request not used by a booking yet.
  const openForwardBill = (vendorOrderId: string) =>
    [...bills]
      .reverse()
      .find(
        (b) =>
          b.vendor_order_id === vendorOrderId &&
          BOUTIQUE_LEGS.includes(b.leg as EwayBillLeg) &&
          !b.return_request_id &&
          !b.shipment_id,
      ) ?? null;

  const billForShipment = (shipmentId: string) => bills.find((b) => b.shipment_id === shipmentId) ?? null;

  return { requiredValue, bills, openForwardBill, billForShipment, refetch: load };
}
