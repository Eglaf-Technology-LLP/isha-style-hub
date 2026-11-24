// The customer's order tracker - the website's src/lib/orderStatus.ts
// (Live-Vendor a4e8e67): our own vendor_orders.status progression mapped to
// friendly steps, each with its date and time (client, 24 Nov 2026). Until
// the boutique accepts, the order reads "Waiting for boutique confirmation".

export interface ShipmentTimestamps {
  created_at: string | null;
  pickup_scheduled_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  estimated_delivery_date: string | null;
}

export type TimelineStageState = 'complete' | 'current' | 'upcoming';

export interface TimelineStage {
  key:
    | 'placed'
    | 'confirmed'
    | 'preparing'
    | 'quality_check'
    | 'shipped'
    | 'out_for_delivery'
    | 'delivered';
  label: string;
  date: string | null;
  state: TimelineStageState;
}

export interface OrderTimeline {
  kind: 'progress' | 'cancelled' | 'returned';
  // Where the order is now, for the status pill: "Waiting for boutique
  // confirmation" until the boutique accepts, then the current step's label.
  currentLabel: string;
  stages: TimelineStage[];
  isNdr: boolean;
  estimatedDeliveryDate: string | null;
  terminalAt: string | null;
  // Shown under the timeline (e.g. "Part of your order has shipped").
  note?: string | null;
}

// Until the boutique accepts, the order is placed but not yet confirmed
// (client, 24 Nov 2026 - it used to read "Being prepared" straight after
// payment).
export const AWAITING_CONFIRMATION_LABEL = 'Waiting for boutique confirmation';

const STAGE_DEFS: { key: TimelineStage['key']; label: string }[] = [
  { key: 'placed', label: 'Order placed' },
  { key: 'confirmed', label: 'Confirmed by boutique' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

const CANCELLED_LABEL = 'Cancelled';

// "processing" is the same step as "confirmed" for the customer; "ndr" (a
// failed delivery attempt) stays at "out_for_delivery" with a warning.
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
  // When the boutique accepted / the courier took it out for delivery
  // (vendor_orders.confirmed_at / out_for_delivery_at, from 24 Nov 2026).
  confirmedAt?: string | null;
  outForDeliveryAt?: string | null;
  deliveredAt?: string | null;
}

// Direct route: one boutique part, shipped by the boutique's courier.
export function buildOrderTimeline(
  input: BuildOrderTimelineInput,
): OrderTimeline {
  const { vendorOrderStatus, vendorOrderUpdatedAt, orderPlacedAt, shipment } =
    input;

  if (vendorOrderStatus === 'cancelled' || vendorOrderStatus === 'returned') {
    return {
      kind: vendorOrderStatus,
      currentLabel:
        vendorOrderStatus === 'cancelled' ? CANCELLED_LABEL : 'Returned',
      stages: [],
      isNdr: false,
      estimatedDeliveryDate: null,
      terminalAt: vendorOrderUpdatedAt,
    };
  }

  const currentIndex = STATUS_TO_STAGE_INDEX[vendorOrderStatus] ?? 0;

  const dateForStage = (key: TimelineStage['key']): string | null => {
    switch (key) {
      case 'placed':
        return orderPlacedAt;
      case 'confirmed':
        return input.confirmedAt ?? null;
      case 'shipped':
        return (
          shipment?.picked_up_at ??
          shipment?.pickup_scheduled_at ??
          shipment?.created_at ??
          null
        );
      case 'out_for_delivery':
        return input.outForDeliveryAt ?? null;
      case 'delivered':
        return shipment?.delivered_at ?? input.deliveredAt ?? null;
      default:
        // A part from before 24 Nov 2026 has no time for some steps - shown
        // as reached, not dated, rather than guessing.
        return null;
    }
  };

  const stages: TimelineStage[] = STAGE_DEFS.map((def, i) => ({
    key: def.key,
    label: def.label,
    date: i <= currentIndex ? dateForStage(def.key) : null,
    state:
      i < currentIndex
        ? 'complete'
        : i === currentIndex
        ? 'current'
        : 'upcoming',
  }));
  if (currentIndex === 4) stages[4].state = 'complete';

  return {
    kind: 'progress',
    currentLabel:
      currentIndex === 0
        ? AWAITING_CONFIRMATION_LABEL
        : stages[currentIndex].label,
    stages,
    isNdr: vendorOrderStatus === 'ndr',
    estimatedDeliveryDate:
      vendorOrderStatus === 'delivered'
        ? null
        : shipment?.estimated_delivery_date ?? null,
    terminalAt: null,
  };
}

// ---------- warehouse route ----------
//
// The customer sees one parcel from AllBoutiqs, not one per boutique: a single
// timeline for the whole order - Order placed -> Confirmed by boutique ->
// Being prepared by the boutique -> At our quality-check centre -> Packed and
// shipped -> Out for delivery -> Delivered, each with its date and time
// (client, 24 Nov 2026). "Being prepared" starts when the boutique has
// packed it and booked the courier to our centre (Ship Now).

const WAREHOUSE_STAGE_DEFS: { key: TimelineStage['key']; label: string }[] = [
  { key: 'placed', label: 'Order placed' },
  { key: 'confirmed', label: 'Confirmed by boutique' },
  { key: 'preparing', label: 'Being prepared by the boutique' },
  { key: 'quality_check', label: 'At our quality-check centre' },
  { key: 'shipped', label: 'Packed and shipped' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];
const LAST_WAREHOUSE_STAGE = WAREHOUSE_STAGE_DEFS.length - 1;

const WAREHOUSE_STATUS_TO_STAGE_INDEX: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  processing: 2,
  in_transit_to_warehouse: 2,
  at_warehouse: 3,
  qc_failed: 3,
  shipped: 4,
  out_for_delivery: 5,
  ndr: 5,
  delivered: 6,
};

export interface WarehouseTimelinePart {
  status: string;
  updated_at: string;
  arrived_at_warehouse_at: string | null;
  parcel: ShipmentTimestamps | null;
  // vendor_orders.confirmed_at / out_for_delivery_at / delivered_at.
  confirmed_at?: string | null;
  out_for_delivery_at?: string | null;
  delivered_at?: string | null;
  // When the boutique booked the courier to our centre (its shipment).
  inbound_booked_at?: string | null;
}

// When the boutique booked the courier to our centre (Ship Now): its own
// shipment there, not an exchange replacement's.
export function inboundBookedAt(
  shipments:
    | {
        shipment_type: string;
        return_request_id?: string | null;
        created_at: string | null;
      }[]
    | null
    | undefined,
): string | null {
  return (
    (shipments ?? [])
      .filter(
        s =>
          s.shipment_type === 'to_warehouse' &&
          !s.return_request_id &&
          s.created_at,
      )
      .map(s => s.created_at as string)
      .sort()[0] ?? null
  );
}

// A confirmed part whose courier to our centre is booked is being prepared.
function warehouseStageIndex(p: WarehouseTimelinePart): number {
  const index = WAREHOUSE_STATUS_TO_STAGE_INDEX[p.status] ?? 0;
  return p.status === 'confirmed' && p.inbound_booked_at ? 2 : index;
}

export interface BuildWarehouseTimelineInput {
  orderPlacedAt: string;
  orderEstimatedDeliveryDate: string | null;
  parts: WarehouseTimelinePart[];
}

export function buildWarehouseOrderTimeline(
  input: BuildWarehouseTimelineInput,
): OrderTimeline {
  const live = input.parts.filter(p => p.status !== 'cancelled');
  if (live.length === 0) {
    const last =
      input.parts
        .map(p => p.updated_at)
        .sort()
        .pop() ?? null;
    return {
      kind: 'cancelled',
      currentLabel: CANCELLED_LABEL,
      stages: [],
      isNdr: false,
      estimatedDeliveryDate: null,
      terminalAt: last,
    };
  }
  if (live.every(p => p.status === 'returned')) {
    return {
      kind: 'returned',
      currentLabel: 'Delivery unsuccessful',
      stages: [],
      isNdr: false,
      estimatedDeliveryDate: null,
      terminalAt:
        live
          .map(p => p.updated_at)
          .sort()
          .pop() ?? null,
      note: "The courier couldn't deliver your order and it's coming back to us. Our team will contact you.",
    };
  }

  // The order is as far along as its least advanced part.
  const indexes = live
    .filter(p => p.status !== 'returned')
    .map(warehouseStageIndex);
  const currentIndex = Math.min(...indexes);
  const furthest = Math.max(...indexes);
  const parcels = live
    .map(p => p.parcel)
    .filter((s): s is ShipmentTimestamps => !!s);
  const latest = (values: (string | null | undefined)[]) =>
    values
      .filter((v): v is string => !!v)
      .sort()
      .pop() ?? null;

  const dateForStage = (key: TimelineStage['key']): string | null => {
    switch (key) {
      case 'placed':
        return input.orderPlacedAt;
      // The order is as far as its last part: the latest time of each step.
      case 'confirmed':
        return latest(live.map(p => p.confirmed_at));
      case 'preparing':
        return latest(live.map(p => p.inbound_booked_at));
      case 'quality_check':
        return latest(live.map(p => p.arrived_at_warehouse_at));
      case 'shipped':
        return latest(
          parcels.map(
            s => s.picked_up_at ?? s.pickup_scheduled_at ?? s.created_at,
          ),
        );
      case 'out_for_delivery':
        return latest(live.map(p => p.out_for_delivery_at));
      case 'delivered':
        return latest([
          ...parcels.map(s => s.delivered_at),
          ...live.map(p => p.delivered_at),
        ]);
      default:
        return null;
    }
  };

  const stages: TimelineStage[] = WAREHOUSE_STAGE_DEFS.map((def, i) => ({
    key: def.key,
    label: def.label,
    date: i <= currentIndex ? dateForStage(def.key) : null,
    state:
      i < currentIndex
        ? 'complete'
        : i === currentIndex
        ? 'current'
        : 'upcoming',
  }));
  if (currentIndex === LAST_WAREHOUSE_STAGE)
    stages[LAST_WAREHOUSE_STAGE].state = 'complete';

  const parcelEtd = latest(parcels.map(s => s.estimated_delivery_date));
  return {
    kind: 'progress',
    currentLabel:
      currentIndex === 0
        ? AWAITING_CONFIRMATION_LABEL
        : stages[currentIndex].label,
    stages,
    isNdr: live.some(p => p.status === 'ndr'),
    estimatedDeliveryDate:
      currentIndex === LAST_WAREHOUSE_STAGE
        ? null
        : parcelEtd ?? input.orderEstimatedDeliveryDate,
    terminalAt: null,
    note:
      furthest > currentIndex && furthest >= 4
        ? 'Part of your order is already on its way - the rest will follow in a separate parcel.'
        : null,
  };
}
