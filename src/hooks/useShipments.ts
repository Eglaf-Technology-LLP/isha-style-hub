import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export interface CourierOption {
  courierId: number;
  courierName: string;
  rate: number;
  etd: string | null;
}

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
  estimated_delivery_date: string | null;
  created_at: string;
}

// Tracks the real courier shipment(s) behind a set of vendor_orders -
// "Ship Now" books the pickup via shiprocket-create-shipment, everything
// after that (in transit, delivered, NDR, RTO) updates automatically via
// the courier-tracking-webhook function, this hook just reads the result.
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

  // Step 1: real couriers + fares for this route, so the vendor picks one
  // instead of Shiprocket silently auto-assigning. Read-only.
  const checkServiceability = async (
    vendorOrderId: string,
  ): Promise<{ couriers: CourierOption[]; isCod: boolean } | null> => {
    const { data, errorMessage: msg } = await invokeEdgeFunction<{ couriers: CourierOption[]; isCod: boolean }>(
      "shiprocket-check-serviceability",
      { vendor_order_id: vendorOrderId },
    );
    if (msg) {
      toast.error(msg);
      return null;
    }
    return data;
  };

  // Step 2: actually book the pickup with the courier the vendor chose.
  // courierEtd is the exact etd already shown for that courier in step 1 -
  // passed through so the real promised date gets persisted instead of
  // discarded once booking succeeds.
  const shipNow = async (vendorOrderId: string, courierId?: number, courierEtd?: string | null): Promise<boolean> => {
    setActioningId(vendorOrderId);
    const { data, errorMessage: msg } = await invokeEdgeFunction("shiprocket-create-shipment", {
      vendor_order_id: vendorOrderId,
      courier_id: courierId,
      courier_etd: courierEtd,
    });
    setActioningId(null);
    if (msg) {
      toast.error(msg);
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

  return {
    shipments,
    loading,
    actioningId,
    checkServiceability,
    shipNow,
    cancelShipment,
    forwardShipmentFor,
    refetch: fetchShipments,
  };
}
