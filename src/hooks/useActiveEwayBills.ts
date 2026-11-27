import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

const COLUMNS =
  "id, vendor_order_id, leg, status, ewb_number, ewb_date, valid_until, document_type, document_number, shipment_id, pdf_path, return_request_id, send_back_id";

export type ActiveEwayBill = Pick<
  Tables<"eway_bills">,
  | "id"
  | "vendor_order_id"
  | "leg"
  | "status"
  | "ewb_number"
  | "ewb_date"
  | "valid_until"
  | "document_type"
  | "document_number"
  | "shipment_id"
  | "pdf_path"
  | "return_request_id"
  | "send_back_id"
>;

// The e-way bills an admin has saved a number on (status active), for these
// order parts, oldest first. Read straight from eway_bills: admins, the
// warehouse and the boutique's own team may read them (RLS).
export function useActiveEwayBills(vendorOrderIds: string[]) {
  const [bills, setBills] = useState<ActiveEwayBill[]>([]);
  const idsKey = [...new Set(vendorOrderIds)].sort().join(",");

  const load = useCallback(async () => {
    if (!idsKey) {
      setBills([]);
      return;
    }
    const { data } = await supabase
      .from("eway_bills")
      .select(COLUMNS)
      .in("vendor_order_id", idsKey.split(","))
      .eq("status", "active")
      .not("ewb_number", "is", null)
      .order("created_at");
    setBills((data ?? []) as ActiveEwayBill[]);
  }, [idsKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { bills, refetch: load };
}

// The bill one shipment was booked with (eway_bills.shipment_id).
export function useShipmentEwayBills(shipmentId: string | null, enabled = true) {
  const [bills, setBills] = useState<ActiveEwayBill[]>([]);

  useEffect(() => {
    if (!enabled || !shipmentId) {
      setBills([]);
      return;
    }
    let live = true;
    supabase
      .from("eway_bills")
      .select(COLUMNS)
      .eq("shipment_id", shipmentId)
      .eq("status", "active")
      .not("ewb_number", "is", null)
      .order("created_at")
      .then(({ data }) => {
        if (live) setBills((data ?? []) as ActiveEwayBill[]);
      });
    return () => {
      live = false;
    };
  }, [shipmentId, enabled]);

  return bills;
}
