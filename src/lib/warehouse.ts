// Labels for the warehouse route (boutique -> AllBoutiqs warehouse ->
// customer), shared by the boutique, admin and warehouse screens.

export const WAREHOUSE_VENDOR_ORDER_STATUSES = ["in_transit_to_warehouse", "at_warehouse", "qc_failed"] as const;

const LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  in_transit_to_warehouse: "On the way to warehouse",
  at_warehouse: "Received at warehouse",
  qc_failed: "Failed inspection",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  ndr: "Delivery failed",
};

// What a boutique / admin sees for one boutique order. On the warehouse route
// the later steps are the warehouse's parcel, so they say "to customer".
export function vendorOrderStatusLabel(status: string, viaWarehouse: boolean): string {
  if (viaWarehouse) {
    if (status === "shipped") return "Shipped to customer";
    if (status === "out_for_delivery") return "Out for delivery to customer";
    if (status === "delivered") return "Delivered to customer";
    if (status === "returned") return "Undelivered - back to warehouse";
  }
  return LABELS[status] ?? status.replace(/_/g, " ");
}

export const vendorOrderStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  processing: "bg-purple-100 text-purple-800",
  in_transit_to_warehouse: "bg-purple-100 text-purple-800",
  at_warehouse: "bg-teal-100 text-teal-800",
  qc_failed: "bg-red-100 text-red-800",
  shipped: "bg-indigo-100 text-indigo-800",
  out_for_delivery: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  returned: "bg-gray-100 text-gray-800",
  ndr: "bg-orange-100 text-orange-800",
};

export const returnStatusLabels: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  pickup_scheduled: "Pickup scheduled",
  picked_up: "Picked up",
  pickup_failed: "Pickup failed - needs attention",
  at_warehouse: "At warehouse - awaiting inspection",
  qc_passed: "Passed inspection",
  qc_failed: "Failed inspection - going back to customer",
  replacement_shipped: "Replacement shipped",
  returned_to_customer: "Sent back to customer",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const sendBackReasonLabels: Record<string, string> = {
  order_cancelled: "Order cancelled",
  qc_failed: "Failed inspection (cancelled)",
  qc_failed_replacement: "Failed inspection (replacement requested)",
  return_forward: "Customer return",
  exchange_forward: "Exchanged item",
  replacement_qc_failed: "Replacement failed inspection",
  replacement_unused: "Replacement not needed",
  rto_cancelled: "Undelivered order cancelled",
};

export function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

// ---------- warehouse working days (same rules as the database) ----------
// Sundays and listed holidays don't count; a parcel received after the
// cut-off hour counts from the next day.

export interface WarehouseTiming {
  handlingDays: number;
  cutoffHour: number;
  maxWaitDays: number;
  holidays: Set<string>;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istParts(iso: string): { date: string; hour: number } {
  const shifted = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return { date: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

export function istToday(): string {
  return istParts(new Date().toISOString()).date;
}

export function addCalendarDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addWarehouseWorkingDays(isoDate: string, n: number, holidays: Set<string>): string {
  let d = isoDate;
  let added = 0;
  while (added < n) {
    d = addCalendarDays(d, 1);
    if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0 && !holidays.has(d)) added++;
  }
  return d;
}

// When a parcel received at this moment must leave the warehouse.
export function dispatchByDate(receivedAtIso: string, timing: WarehouseTiming): string {
  const { date, hour } = istParts(receivedAtIso);
  const start = hour >= timing.cutoffHour ? addCalendarDays(date, 1) : date;
  return addWarehouseWorkingDays(start, timing.handlingDays, timing.holidays);
}

export const purposeLabels: Record<string, string> = {
  order: "Order",
  exchange_replacement: "Exchange replacement",
  return_send_back: "Return sent back (failed inspection)",
};

export const inr = (n: number | null | undefined) => `₹${Math.round(Number(n ?? 0)).toLocaleString("en-IN")}`;
