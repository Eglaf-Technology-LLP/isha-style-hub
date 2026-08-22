import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export interface Shipment {
  id: string;
  vendor_order_id: string;
  return_request_id: string | null;
  shipment_type: string;
  awb_code: string | null;
  courier_name: string | null;
  status: string;
  status_raw: string | null;
  label_url: string | null;
  manifest_url: string | null;
  pickup_scheduled_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  rto_initiated_at: string | null;
  created_at: string;
}

// Tracks the real courier shipment(s) behind a set of vendor_orders -
// "Ship Now" books the pickup via shiprocket-create-shipment, everything
// after that (in transit, delivered, NDR, RTO) updates automatically via
// the shiprocket-webhook function, this hook just reads the result.
export function useShipments(vendorOrderIds: string[]) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const idsKey = [...vendorOrderIds].sort().join(",");

  const fetchShipments = useCallback(async () => {
    if (vendorOrderIds.length === 0) {
      setShipments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("shipments")
      .select("*")
      .in("vendor_order_id", vendorOrderIds);
    if (error) {
      console.error("Failed to load shipments", error);
    } else {
      setShipments((data ?? []) as Shipment[]);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  const shipNow = async (vendorOrderId: string): Promise<boolean> => {
    setActioningId(vendorOrderId);
    const { data, errorMessage } = await invokeEdgeFunction("shiprocket-create-shipment", {
      vendor_order_id: vendorOrderId,
    });
    setActioningId(null);
    if (errorMessage) {
      toast.error(errorMessage);
      return false;
    }
    toast.success(
      data?.already_shipped ? "This order was already shipped" : "Shipment booked - pickup requested",
    );
    await fetchShipments();
    return true;
  };

  const cancelShipment = async (vendorOrderId: string): Promise<boolean> => {
    setActioningId(vendorOrderId);
    const { errorMessage } = await invokeEdgeFunction("shiprocket-cancel-shipment", {
      vendor_order_id: vendorOrderId,
    });
    setActioningId(null);
    if (errorMessage) {
      toast.error(errorMessage);
      return false;
    }
    toast.success("Shipment cancelled");
    await fetchShipments();
    return true;
  };

  const forwardShipmentFor = (vendorOrderId: string) =>
    shipments.find((s) => s.vendor_order_id === vendorOrderId && s.shipment_type === "forward") ?? null;

  return { shipments, loading, actioningId, shipNow, cancelShipment, forwardShipmentFor, refetch: fetchShipments };
}
