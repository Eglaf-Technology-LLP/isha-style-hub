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
  key: "placed" | "confirmed" | "shipped" | "out_for_delivery" | "delivered";
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
