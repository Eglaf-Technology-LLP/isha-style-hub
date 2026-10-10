// Maps our own already-clean vendor_orders.status progression to a
// customer-facing timeline. Deliberately separate from
// supabase/functions/_shared/shiprocket.ts's STATUS_MAP - that one maps
// Shiprocket's raw, inconsistent status strings to our enum; this one maps
// our enum to a friendly label/date, a different job with a different
// input shape.

export interface ShipmentTimestamps {
  created_at: string | null;
  pickup_scheduled_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  estimated_delivery_date: string | null;
}

export type TimelineStageState = "complete" | "current" | "upcoming";

export interface TimelineStage {
  key: "placed" | "confirmed" | "preparing" | "quality_check" | "shipped" | "out_for_delivery" | "delivered";
  label: string;
  date: string | null;
  state: TimelineStageState;
}

export interface OrderTimeline {
  kind: "progress" | "cancelled" | "returned";
  stages: TimelineStage[];
  isNdr: boolean;
  estimatedDeliveryDate: string | null;
  terminalAt: string | null;
  // Shown under the timeline (e.g. "Part of your order has shipped").
  note?: string | null;
}

const STAGE_DEFS: { key: TimelineStage["key"]; label: string }[] = [
  { key: "placed", label: "Order Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "shipped", label: "Shipped" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

// "processing" collapses into the same visual stage as "confirmed" -
// vendor-side packing progress isn't something a customer needs its own
// milestone for. "ndr" sits at "out_for_delivery" with a warning flag
// rather than its own stage, since a failed delivery attempt is a hiccup
// at that stage, not a separate leg of the journey.
const STATUS_TO_STAGE_INDEX: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  processing: 1,
  shipped: 2,
  out_for_delivery: 3,
  ndr: 3,
  delivered: 4,
};

export interface BuildOrderTimelineInput {
  vendorOrderStatus: string;
  vendorOrderUpdatedAt: string;
  orderPlacedAt: string;
  shipment: ShipmentTimestamps | null;
}

export function buildOrderTimeline(input: BuildOrderTimelineInput): OrderTimeline {
  const { vendorOrderStatus, vendorOrderUpdatedAt, orderPlacedAt, shipment } = input;

  if (vendorOrderStatus === "cancelled" || vendorOrderStatus === "returned") {
    return {
      kind: vendorOrderStatus,
      stages: [],
      isNdr: false,
      estimatedDeliveryDate: null,
      terminalAt: vendorOrderUpdatedAt,
    };
  }

  const currentIndex = STATUS_TO_STAGE_INDEX[vendorOrderStatus] ?? 0;

  const dateForStage = (key: TimelineStage["key"]): string | null => {
    switch (key) {
      case "placed":
        return orderPlacedAt;
      case "shipped":
        return shipment?.picked_up_at ?? shipment?.pickup_scheduled_at ?? shipment?.created_at ?? null;
      case "delivered":
        return shipment?.delivered_at ?? null;
      default:
        // "confirmed"/"out_for_delivery" have no dedicated timestamp column
        // anywhere in this schema - shown as reached, not dated, rather
        // than guessing.
        return null;
    }
  };

  const stages: TimelineStage[] = STAGE_DEFS.map((def, i) => ({
    key: def.key,
    label: def.label,
    date: i <= currentIndex ? dateForStage(def.key) : null,
    state: i < currentIndex ? "complete" : i === currentIndex ? "current" : "upcoming",
  }));
  if (currentIndex === 4) stages[4].state = "complete";

  return {
    kind: "progress",
    stages,
    isNdr: vendorOrderStatus === "ndr",
    estimatedDeliveryDate: vendorOrderStatus === "delivered" ? null : shipment?.estimated_delivery_date ?? null,
    terminalAt: null,
  };
}

// ---------- warehouse route ----------
//
// The customer sees one parcel from AllBoutiqs, not one per boutique: a single
// timeline for the whole order - Being prepared by the boutique -> At our
// quality-check centre -> Packed and shipped -> Out for delivery -> Delivered.

const WAREHOUSE_STAGE_DEFS: { key: TimelineStage["key"]; label: string }[] = [
  { key: "preparing", label: "Being prepared by the boutique" },
  { key: "quality_check", label: "At our quality-check centre" },
  { key: "shipped", label: "Packed and shipped" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

const WAREHOUSE_STATUS_TO_STAGE_INDEX: Record<string, number> = {
  pending: 0,
  confirmed: 0,
  processing: 0,
  in_transit_to_warehouse: 0,
  at_warehouse: 1,
  qc_failed: 1,
  shipped: 2,
  out_for_delivery: 3,
  ndr: 3,
  delivered: 4,
};

export interface WarehouseTimelinePart {
  status: string;
  updated_at: string;
  arrived_at_warehouse_at: string | null;
  parcel: ShipmentTimestamps | null;
}

export interface BuildWarehouseTimelineInput {
  orderPlacedAt: string;
  orderEstimatedDeliveryDate: string | null;
  parts: WarehouseTimelinePart[];
}

export function buildWarehouseOrderTimeline(input: BuildWarehouseTimelineInput): OrderTimeline {
  const live = input.parts.filter((p) => p.status !== "cancelled");
  if (live.length === 0) {
    const last = input.parts.map((p) => p.updated_at).sort().pop() ?? null;
    return { kind: "cancelled", stages: [], isNdr: false, estimatedDeliveryDate: null, terminalAt: last };
  }
  if (live.every((p) => p.status === "returned")) {
    return {
      kind: "returned",
      stages: [],
      isNdr: false,
      estimatedDeliveryDate: null,
      terminalAt: live.map((p) => p.updated_at).sort().pop() ?? null,
      note: "The courier couldn't deliver your order and it's coming back to us. Our team will contact you.",
    };
  }

  // The order is as far along as its least advanced part.
  const indexes = live.filter((p) => p.status !== "returned").map((p) => WAREHOUSE_STATUS_TO_STAGE_INDEX[p.status] ?? 0);
  const currentIndex = Math.min(...indexes);
  const furthest = Math.max(...indexes);
  const parcels = live.map((p) => p.parcel).filter((s): s is ShipmentTimestamps => !!s);
  const latest = (values: (string | null | undefined)[]) =>
    values.filter((v): v is string => !!v).sort().pop() ?? null;

  const dateForStage = (key: TimelineStage["key"]): string | null => {
    switch (key) {
      case "preparing":
        return input.orderPlacedAt;
      case "quality_check":
        return latest(live.map((p) => p.arrived_at_warehouse_at));
      case "shipped":
        return latest(parcels.map((s) => s.picked_up_at ?? s.pickup_scheduled_at ?? s.created_at));
      case "delivered":
        return latest(parcels.map((s) => s.delivered_at));
      default:
        return null;
    }
  };

  const stages: TimelineStage[] = WAREHOUSE_STAGE_DEFS.map((def, i) => ({
    key: def.key,
    label: def.label,
    date: i <= currentIndex ? dateForStage(def.key) : null,
    state: i < currentIndex ? "complete" : i === currentIndex ? "current" : "upcoming",
  }));
  if (currentIndex === 4) stages[4].state = "complete";

  const parcelEtd = latest(parcels.map((s) => s.estimated_delivery_date));
  return {
    kind: "progress",
    stages,
    isNdr: live.some((p) => p.status === "ndr"),
    estimatedDeliveryDate: currentIndex === 4 ? null : parcelEtd ?? input.orderEstimatedDeliveryDate,
    terminalAt: null,
    note:
      furthest > currentIndex && furthest >= 2
        ? "Part of your order is already on its way - the rest will follow in a separate parcel."
        : null,
  };
}
