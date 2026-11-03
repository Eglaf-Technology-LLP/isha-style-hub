// E-way bills (parcels over the limit, ₹50,000 by default) - see the
// eway_bills migration and supabase/functions/_shared/ewayBill.ts.

export type EwayBillLeg =
  | "boutique_to_customer"
  | "boutique_to_warehouse"
  | "warehouse_to_customer"
  | "customer_to_warehouse"
  | "customer_to_boutique"
  | "warehouse_to_boutique";

export const EWAY_LEG_LABELS: Record<EwayBillLeg, string> = {
  boutique_to_customer: "Boutique to customer",
  boutique_to_warehouse: "Boutique to AllBoutiqs warehouse",
  warehouse_to_customer: "AllBoutiqs warehouse to customer",
  customer_to_warehouse: "Customer to AllBoutiqs warehouse",
  customer_to_boutique: "Customer to boutique",
  warehouse_to_boutique: "AllBoutiqs warehouse to boutique",
};

export const EWAY_DOCUMENT_LABELS: Record<string, string> = {
  tax_invoice: "Tax Invoice",
  delivery_challan: "Delivery Challan",
  return_invoice: "Return Invoice",
};

// Which journey of the part a request is for (eway_bills.movement).
export const movementLabel = (movement: string) =>
  movement.startsWith("return:")
    ? "Return"
    : movement.startsWith("exchange:")
      ? "Exchange"
      : movement.startsWith("sendback:")
        ? "Send-back"
        : movement.startsWith("rto:")
          ? "RTO (undelivered, coming back)"
          : "Order";

export const RETURN_INVOICE_REASON_LABELS: Record<string, string> = {
  customer_return: "Customer return",
  exchange_return: "Exchanged item returned",
  rto: "Undelivered (RTO)",
  qc_failed: "Failed inspection",
  order_cancelled: "Cancelled",
  replacement_returned: "Exchange replacement taken back",
};

type Address = Record<string, string | null | undefined> | null | undefined;

// A request as the booking screens get it (ewayBillSummary on the server).
export interface EwayBillRequest {
  id: string;
  vendor_order_id: string;
  leg: EwayBillLeg;
  status: "pending" | "active" | "cancelled";
  value: number;
  document_type: "tax_invoice" | "delivery_challan" | "return_invoice";
  document_number: string;
  document_date: string;
  from_name: string;
  from_address: Address;
  to_name: string;
  to_address: Address;
  courier_id: number | null;
  courier_name: string | null;
  ewb_number: string | null;
  valid_until: string | null;
  requested_at: string;
}

// What a booking dialog shows for one boutique part over the limit
// (ewayBillPreview on the server). bill is null until the first booking
// attempt asks for one.
export interface EwayBillPreview {
  vendor_order_id: string;
  order_id: string;
  value: number;
  threshold: number;
  made_by: "allboutiqs" | "boutique";
  email: string;
  bill: EwayBillRequest | null;
  transporter_id: string | null;
  vendor_name?: string; // warehouse parcels hold several boutiques' parts
}

// 1234 5678 9012 - how the portal prints it.
export const formatEwbNumber = (n: string | null | undefined) => (n ? n.replace(/(\d{4})(?=\d)/g, "$1 ") : "");

export const orderRefOf = (orderId: string) => `#${orderId.slice(0, 8).toUpperCase()}`;

export const addressText = (a: Address) =>
  a
    ? [a.address_line1, a.address_line2, [a.city, a.state].filter(Boolean).join(", "), a.pincode ? `PIN ${a.pincode}` : null]
        .filter((l) => l && String(l).trim())
        .join(", ")
    : "";

// The subject a boutique making its own uses when it emails the number.
export const ewayEmailSubject = (orderId: string, documentNumber: string) =>
  `EWB - Order ${orderRefOf(orderId)} - ${documentNumber}`;
