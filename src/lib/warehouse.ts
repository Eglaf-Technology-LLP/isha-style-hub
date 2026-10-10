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
