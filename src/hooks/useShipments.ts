import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { EwayBillPreview } from "@/lib/ewayBill";

export interface CourierOption {
  courierId: number;
  courierName: string;
  freightCharge: number;
  codCharges: number;
  serviceFee: number;
  rate: number;
  rating: number | null;
  recommended: boolean;
  etd: string | null;
}

export interface ShipDestination {
  kind: "warehouse" | "customer";
  name?: string;
  city?: string;
  pincode: string;
}

export interface ServiceabilityResult {
  couriers: CourierOption[];
  isCod: boolean;
  // The parcel weight these fares are for (from the products' weights).
  weightKg?: number;
  destination?: ShipDestination;
  // Set when the part is over the e-way bill limit.
  ewayBill?: EwayBillPreview | null;
}

// "pending": not booked - the e-way bill was asked for (or is still being made).
export type ShipNowOutcome = { status: "booked" } | { status: "failed" } | { status: "pending"; ewayBill: EwayBillPreview };

export interface Shipment {
  id: string;
  vendor_order_id: string;
  return_request_id: string | null;
  dispatch_id: string | null;
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
  // returnRequestId: rates for an exchange's replacement (warehouse route).
  const checkServiceability = async (vendorOrderId: string, returnRequestId?: string): Promise<ServiceabilityResult | null> => {
    const { data, errorMessage: msg } = await invokeEdgeFunction<
      Omit<ServiceabilityResult, "ewayBill"> & { eway_bill?: EwayBillPreview | null }
    >("shiprocket-check-serviceability", { vendor_order_id: vendorOrderId, return_request_id: returnRequestId });
    if (msg || !data) {
      toast.error(msg ?? "Couldn't load couriers");
      return null;
    }
    const { eway_bill, ...rest } = data;
    return { ...rest, ewayBill: eway_bill ?? null };
  };

  // Step 2: actually book the pickup with the courier the vendor chose.
  // courierEtd is the exact etd already shown for that courier in step 1 -
  // passed through so the real promised date gets persisted instead of
  // discarded once booking succeeds. Over the e-way bill limit the first
  // press only asks for the e-way bill (status "pending").
  const shipNow = async (
    vendorOrderId: string,
    courierId?: number,
    courierEtd?: string | null,
    returnRequestId?: string,
    courierName?: string | null,
  ): Promise<ShipNowOutcome> => {
    setActioningId(vendorOrderId);
    const { data, errorMessage: msg } = await invokeEdgeFunction("shiprocket-create-shipment", {
      vendor_order_id: vendorOrderId,
      courier_id: courierId,
      courier_name: courierName,
      courier_etd: courierEtd,
      return_request_id: returnRequestId,
    });
    setActioningId(null);
    if (msg) {
      toast.error(msg);
      return { status: "failed" };
    }
    if (data?.eway_bill_pending && data.eway_bill) {
      toast.info(
        data.eway_bill.made_by === "boutique"
          ? "E-way bill needed - make it with the details shown and email us the number"
          : "E-way bill asked for - we'll tell you when it's ready to ship",
      );
      return { status: "pending", ewayBill: data.eway_bill };
    }
    toast.success(
      data?.already_shipped
        ? "This order was already shipped"
        : data?.via_warehouse
          ? "Booked to the AllBoutiqs warehouse - pickup requested"
          : "Shipment booked - pickup requested",
    );
    await fetchShipments();
    return { status: "booked" };
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

  // The boutique's own parcel: to the customer, or to the warehouse on the
  // warehouse route (the latest one, if an item had to be sent again).
  const forwardShipmentFor = (vendorOrderId: string) =>
    shipments
      .filter(
        (s) =>
          s.vendor_order_id === vendorOrderId &&
          !s.return_request_id &&
          (s.shipment_type === "forward" || s.shipment_type === "to_warehouse"),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

  // The warehouse's parcel to the customer that carries this boutique order.
  const customerParcelFor = (vendorOrderId: string) =>
    shipments
      .filter((s) => s.shipment_type === "warehouse_to_customer" && s.vendor_order_id === vendorOrderId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

  return {
    shipments,
    loading,
    actioningId,
    checkServiceability,
    shipNow,
    cancelShipment,
    forwardShipmentFor,
    customerParcelFor,
    refetch: fetchShipments,
  };
}
