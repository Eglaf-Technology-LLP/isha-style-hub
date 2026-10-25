import { useCallback, useEffect, useState } from "react";
import type { CustomisationChoice } from "@/lib/customisation";
import { supabase } from "@/integrations/supabase/client";

// Everything the warehouse screens work from: boutique parcels coming in and
// at the warehouse, the parcels packed for customers, returns coming back
// through the warehouse, and items going back to boutiques.

export interface WhItem {
  id: string;
  product_id: string;
  product_title: string;
  variant_title: string | null;
  size: string | null;
  color: string | null;
  sku: string | null;
  quantity: number;
  price: number;
  // This line's share of the order's coupon (null on older orders).
  discount_amount?: number | null;
  // Customised for the customer - QC checks the piece against this.
  customisation?: CustomisationChoice | null;
}

export interface WhShipment {
  id: string;
  shipment_type: string;
  status: string;
  status_raw: string | null;
  awb_code: string | null;
  courier_name: string | null;
  label_url: string | null;
  estimated_delivery_date: string | null;
  created_at: string;
  picked_up_at: string | null;
  delivered_at: string | null;
  vendor_order_id: string | null;
  return_request_id: string | null;
  dispatch_id: string | null;
  send_back_id: string | null;
  courier_cost: number | null;
}

export interface WhOrder {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  shipping_address: Record<string, string>;
  payment_method: string;
  payment_status: string;
  created_at: string;
  total: number;
  subtotal: number;
  discount_amount: number;
  estimated_delivery_date: string | null;
}

export interface WhVendorOrder {
  id: string;
  order_id: string;
  vendor_id: string;
  vendor_name: string;
  status: string;
  subtotal: number;
  shipping_cost: number;
  ready_by: string | null;
  expected_at_warehouse_on: string | null;
  arrived_at_warehouse_at: string | null;
  received_at_warehouse_at: string | null;
  warehouse_shelf: string | null;
  qc_status: string | null;
  qc_notes: string | null;
  dispatch_id: string | null;
  created_at: string;
  updated_at: string;
  items: WhItem[];
  // The boutique's latest parcel to the warehouse.
  inbound: WhShipment | null;
}

export interface WhDispatch {
  id: string;
  order_id: string;
  purpose: "order" | "exchange_replacement" | "return_send_back";
  return_request_id: string | null;
  status: string;
  weight_kg: number;
  length_cm: number;
  breadth_cm: number;
  height_cm: number;
  packed_at: string;
  rto_received_at: string | null;
  created_at: string;
  shipment: WhShipment | null;
}

export interface WhReturnItem {
  order_item_id: string;
  product_title: string;
  quantity: number;
  size?: string | null;
  color?: string | null;
  price?: number;
  exchange_to?: { size: string | null; color: string | null };
}

export interface WhReturn {
  id: string;
  order_id: string;
  request_type: "return" | "exchange";
  status: string;
  reason: string;
  items: WhReturnItem[];
  refund_amount: number | null;
  received_at_warehouse_at: string | null;
  warehouse_shelf: string | null;
  warehouse_qc_status: string | null;
  warehouse_qc_notes: string | null;
  replacement_received_at: string | null;
  replacement_qc_status: string | null;
  replacement_qc_notes: string | null;
  created_at: string;
  updated_at: string;
  vendorNames: string[];
  pickup: WhShipment | null;
  replacements: WhShipment[];
}

export interface WhSendBack {
  id: string;
  vendor_id: string;
  vendor_name: string;
  order_id: string;
  vendor_order_id: string | null;
  return_request_id: string | null;
  reason: string;
  items: { product_title: string; quantity: number; size?: string | null; color?: string | null; sku?: string | null }[];
  status: string;
  notes: string | null;
  created_at: string;
  shipment: WhShipment | null;
}

const SHIPMENT_COLUMNS =
  "id, shipment_type, status, status_raw, awb_code, courier_name, label_url, estimated_delivery_date, created_at, picked_up_at, delivered_at, vendor_order_id, return_request_id, dispatch_id, send_back_id, courier_cost";
const VO_COLUMNS =
  "id, order_id, vendor_id, status, subtotal, shipping_cost, ready_by, expected_at_warehouse_on, arrived_at_warehouse_at, received_at_warehouse_at, warehouse_shelf, qc_status, qc_notes, dispatch_id, created_at, updated_at";
const OPEN_VO_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "in_transit_to_warehouse",
  "at_warehouse",
  "qc_failed",
  "shipped",
  "out_for_delivery",
  "ndr",
  "returned",
];

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const latestFirst = (a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at);

export function useWarehouseData(enabled: boolean) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Map<string, WhOrder>>(new Map());
  const [vendorOrders, setVendorOrders] = useState<WhVendorOrder[]>([]);
  const [dispatches, setDispatches] = useState<WhDispatch[]>([]);
  const [returns, setReturns] = useState<WhReturn[]>([]);
  const [sendBacks, setSendBacks] = useState<WhSendBack[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setError(null);
    try {
      // Orders the warehouse is (or was recently) handling.
      const [{ data: openVos, error: openErr }, { data: recentVos }, { data: rrRows }, { data: sbRows }] = await Promise.all([
        supabase
          .from("vendor_orders")
          .select("order_id, orders!inner(fulfilment_route)")
          .eq("orders.fulfilment_route", "warehouse")
          .in("status", OPEN_VO_STATUSES),
        supabase
          .from("vendor_orders")
          .select("order_id, orders!inner(fulfilment_route)")
          .eq("orders.fulfilment_route", "warehouse")
          .in("status", ["delivered", "cancelled"])
          .gte("updated_at", daysAgo(14)),
        supabase
          .from("return_requests")
          .select("*")
          .eq("return_destination", "warehouse")
          .not("status", "in", "(pending,rejected,cancelled)")
          .gte("updated_at", daysAgo(60))
          .order("created_at", { ascending: false }),
        supabase
          .from("boutique_send_backs")
          .select("*")
          .or(`status.in.(required,booked),updated_at.gte.${daysAgo(14)}`)
          .order("created_at", { ascending: false }),
      ]);
      if (openErr) throw openErr;

      const returnRows = (rrRows ?? []) as any[];
      const sendBackRows = (sbRows ?? []) as any[];
      const orderIds = [
        ...new Set([
          ...(openVos ?? []).map((v) => v.order_id),
          ...(recentVos ?? []).map((v) => v.order_id),
          ...returnRows.map((r) => r.order_id),
          ...sendBackRows.map((s) => s.order_id),
        ]),
      ];
      if (orderIds.length === 0) {
        setOrders(new Map());
        setVendorOrders([]);
        setDispatches([]);
        setReturns([]);
        setSendBacks([]);
        return;
      }

      const [{ data: orderRows }, { data: voRows }, { data: shipmentRows }, { data: dispatchRows }] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, customer_name, customer_phone, customer_email, shipping_address, payment_method, payment_status, created_at, total, subtotal, discount_amount, estimated_delivery_date",
          )
          .in("id", orderIds),
        supabase.from("vendor_orders").select(VO_COLUMNS).in("order_id", orderIds),
        supabase.from("shipments").select(SHIPMENT_COLUMNS).in("order_id", orderIds),
        supabase.from("warehouse_dispatches").select("*").in("order_id", orderIds).neq("status", "cancelled"),
      ]);

      const allVos = (voRows ?? []) as any[];
      const vendorIds = [...new Set([...allVos.map((v) => v.vendor_id), ...sendBackRows.map((s) => s.vendor_id)])];
      const [{ data: itemRows }, { data: vendorRows }] = await Promise.all([
        supabase
          .from("order_items")
          .select("id, order_id, vendor_order_id, product_id, product_title, variant_title, size, color, sku, quantity, price, discount_amount, customisation")
          .in("order_id", orderIds),
        vendorIds.length
          ? supabase.from("vendors").select("id, name").in("id", vendorIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);

      const vendorName = new Map((vendorRows ?? []).map((v) => [v.id, v.name]));
      const shipments = ((shipmentRows ?? []) as WhShipment[]).sort(latestFirst);
      const items = (itemRows ?? []) as any[];

      setOrders(new Map(((orderRows ?? []) as any[]).map((o) => [o.id, o as WhOrder])));
      setVendorOrders(
        allVos.map((vo) => ({
          ...vo,
          vendor_name: vendorName.get(vo.vendor_id) ?? "Boutique",
          items: items.filter((i) => i.vendor_order_id === vo.id),
          inbound:
            shipments.find(
              (s) => s.vendor_order_id === vo.id && s.shipment_type === "to_warehouse" && !s.return_request_id,
            ) ?? null,
        })),
      );
      setDispatches(
        ((dispatchRows ?? []) as any[])
          .map((d) => ({
            ...d,
            shipment: shipments.find((s) => s.dispatch_id === d.id && s.shipment_type === "warehouse_to_customer") ?? null,
          }))
          .sort(latestFirst),
      );

      const vendorByItem = new Map(items.map((i) => [i.id, vendorName.get(allVos.find((v) => v.id === i.vendor_order_id)?.vendor_id) ?? null]));
      setReturns(
        returnRows.map((rr) => ({
          ...rr,
          items: (rr.items ?? []) as WhReturnItem[],
          vendorNames: [
            ...new Set(((rr.items ?? []) as WhReturnItem[]).map((i) => vendorByItem.get(i.order_item_id)).filter(Boolean)),
          ] as string[],
          pickup:
            shipments.find((s) => s.return_request_id === rr.id && ["return_to_warehouse", "return"].includes(s.shipment_type)) ??
            null,
          replacements: shipments.filter((s) => s.return_request_id === rr.id && s.shipment_type === "to_warehouse"),
        })),
      );
      setSendBacks(
        sendBackRows.map((sb) => ({
          ...sb,
          vendor_name: vendorName.get(sb.vendor_id) ?? "Boutique",
          items: (sb.items ?? []) as WhSendBack["items"],
          shipment: shipments.find((s) => s.send_back_id === sb.id) ?? null,
        })),
      );
    } catch (e: any) {
      console.error("useWarehouseData", e);
      setError(e?.message ?? "Couldn't load the warehouse queue");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { loading, error, orders, vendorOrders, dispatches, returns, sendBacks, refetch };
}
