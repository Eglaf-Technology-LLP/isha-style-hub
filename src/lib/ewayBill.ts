// E-way bills (goods over the limit, ₹50,000 by default) - see the eway_bills
// migrations and supabase/functions/_shared/ewayBill.ts. AllBoutiqs is the
// transporter on all of them and makes them on the portal.

import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export type EwayBillLeg =
  | "boutique_to_customer"
  | "boutique_to_warehouse"
  | "warehouse_to_customer"
  | "warehouse_to_boutique"
  | "customer_to_warehouse"
  | "customer_to_boutique";

export const EWAY_LEG_LABELS: Record<EwayBillLeg, string> = {
  boutique_to_customer: "Boutique to customer",
  boutique_to_warehouse: "Boutique to AllBoutiqs warehouse",
  warehouse_to_customer: "AllBoutiqs warehouse to customer",
  warehouse_to_boutique: "AllBoutiqs warehouse back to boutique",
  customer_to_warehouse: "Customer return to AllBoutiqs warehouse",
  customer_to_boutique: "Customer return to boutique",
};

export const EWAY_LEGS = Object.keys(EWAY_LEG_LABELS) as EwayBillLeg[];

export const ewayLegLabel = (leg: string) => EWAY_LEG_LABELS[leg as EwayBillLeg] ?? leg.replace(/_/g, " ");

// The legs a boutique ships itself (it waits for, and prints, these).
export const BOUTIQUE_LEGS: EwayBillLeg[] = ["boutique_to_customer", "boutique_to_warehouse"];

export const EWAY_DOCUMENT_LABELS: Record<string, string> = {
  tax_invoice: "Tax Invoice",
  delivery_challan: "Delivery Challan",
};

// What boutiques are told to expect.
export const EWAY_TURNAROUND = "1-2 hours";

type Address = Record<string, string | null | undefined> | null | undefined;

// A request as the booking screens get it (ewayBillSummary on the server).
export interface EwayBillRequest {
  id: string;
  vendor_order_id: string;
  leg: EwayBillLeg;
  status: "pending" | "active" | "cancelled";
  value: number;
  document_type: "tax_invoice" | "delivery_challan";
  document_number: string;
  document_date: string;
  from_name: string;
  from_address: Address;
  to_name: string;
  to_address: Address;
  ewb_number: string | null;
  valid_until: string | null;
  pdf_path: string | null;
  requested_at: string;
  // The courier picked for it and that partner's GST transporter ID
  // (E-way bills > Settings); null = not picked yet.
  courier_id?: number | null;
  courier_name?: string | null;
  transporter_id?: string | null;
  transporter_name?: string | null;
}

// What a booking dialog shows for one boutique part over the limit
// (ewayBillPreview on the server). bill is null while nothing has been asked
// for yet.
export interface EwayBillPreview {
  vendor_order_id: string;
  order_id: string;
  value: number;
  threshold: number;
  turnaround?: string;
  bill: EwayBillRequest | null;
  vendor_name?: string; // warehouse parcels hold several boutiques' parts
}

// Made, but its PDF isn't attached yet: Shiprocket won't take the number
// without it (ewaybill_url), so the parcel can't be booked until it is.
export const awaitingPdf = (bill: Pick<EwayBillRequest, "status" | "pdf_path"> | null | undefined) =>
  bill?.status === "active" && !bill.pdf_path;

// The bill a booking sends to Shiprocket: the first one made (a warehouse
// parcel with several sends one) - see ewayBillForShiprocket on the server.
export const firstMadeBill = (previews: EwayBillPreview[]) =>
  previews.map((p) => p.bill).find((b) => b?.status === "active" && b.ewb_number) ?? null;

// The courier already picked for these e-way bills (the first that has one).
export const chosenCourier = (previews: EwayBillPreview[]) =>
  previews.map((p) => p.bill).find((b) => b?.courier_name) ?? null;

// Booking with this courier would pick (or change) the courier of an e-way
// bill still being made - the button says so instead of waiting.
export const picksCourier = (previews: EwayBillPreview[], courierName: string | null | undefined) =>
  !!courierName && previews.some((p) => p.bill?.status === "pending" && p.bill.courier_name !== courierName);

// 1234 5678 9012 - how the portal prints it.
export const formatEwbNumber = (n: string | null | undefined) => (n ? n.replace(/(\d{4})(?=\d)/g, "$1 ") : "");

export const orderRefOf = (orderId: string) => `#${orderId.slice(0, 8).toUpperCase()}`;

export const addressText = (a: Address) =>
  a
    ? [a.address_line1, a.address_line2, [a.city, a.state].filter(Boolean).join(", "), a.pincode ? `PIN ${a.pincode}` : null]
        .filter((l) => l && String(l).trim())
        .join(", ")
    : "";

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
export const localInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const EWAY_BUCKET = "eway-bills";

// Rejects with `message` when the promise hasn't settled in `ms` (the request
// itself may still finish - saves here are safe to repeat).
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

// Admin: store the portal's PDF for a bill and link it (the boutique is told
// it can print it). Returns an error message, or null.
export async function uploadEwayBillPdf(bill: { id: string; vendor_id: string }, file: File): Promise<string | null> {
  if (file.type && file.type !== "application/pdf") return `${file.name} isn't a PDF`;
  if (file.size > 5 * 1024 * 1024) return `${file.name} is over 5 MB`;
  const path = `${bill.vendor_id}/${bill.id}.pdf`;
  try {
    // A Blob typed as PDF: some computers give a portal download no type,
    // and the bucket only takes application/pdf.
    const body = file.type === "application/pdf" ? file : new Blob([file], { type: "application/pdf" });
    const { error } = await supabase.storage
      .from(EWAY_BUCKET)
      .upload(path, body, { upsert: true, contentType: "application/pdf", cacheControl: "60" });
    if (error) return error.message;
    const { errorMessage } = await invokeEdgeFunction("eway-bill-actions", { action: "attach_pdf", eway_bill_id: bill.id, path });
    return errorMessage ?? null;
  } catch (e) {
    return e instanceof Error ? e.message : "The PDF couldn't be uploaded";
  }
}

// Opens the portal's PDF (private bucket) in a new tab to print / save.
export async function openEwayBillPdf(path: string): Promise<string | null> {
  // Opened first so the browser doesn't block it as a pop-up after the await.
  const tab = window.open("", "_blank");
  const { data, error } = await supabase.storage.from(EWAY_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    tab?.close();
    return error?.message ?? "Couldn't open the e-way bill";
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
  return null;
}
