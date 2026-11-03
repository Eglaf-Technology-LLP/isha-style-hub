import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type EwayBillRow = Tables<"eway_bills">;
export type VendorEwayBillSetup = Tables<"vendor_eway_bill_setup">;
export type CourierTransporter = Tables<"courier_transporters">;
export type InvoiceRow = Tables<"invoices">;
export type InvoiceLineRow = Tables<"invoice_lines">;
export type ReturnInvoiceRow = Tables<"return_invoices">;
// The goods on the document: a tax invoice's lines or a return invoice's.
export type DocumentLine = Pick<
  InvoiceLineRow,
  "line_no" | "description" | "hsn_code" | "quantity" | "taxable_value" | "gst_rate" | "cgst_amount" | "sgst_amount" | "igst_amount" | "total"
>;

export interface AdminEwayBill extends EwayBillRow {
  vendorName: string;
  boutiqueCode: string | null;
  invoice: InvoiceRow | null;
  // The return invoice it travels on, or its challan refers to.
  returnInvoice: ReturnInvoiceRow | null;
  challanPurpose: string | null;
  lines: DocumentLine[];
  partStatus: string | null; // the boutique part's own status (cancelled?)
  shipment: { awb_code: string | null; status: string } | null;
  transporterId: string | null;
}

// Everything Admin > E-way bills shows: open and recent requests with what
// the portal form needs, each boutique's sub-user set-up, couriers' IDs.
export function useEwayBillsAdmin() {
  const [bills, setBills] = useState<AdminEwayBill[]>([]);
  const [setups, setSetups] = useState<Map<string, VendorEwayBillSetup>>(new Map());
  const [transporters, setTransporters] = useState<CourierTransporter[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Everything still open (waiting for a number, or made but not booked);
    // the rest only from the last 30 days.
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: open, error }, { data: recent }, { data: setupRows }, { data: courierRows }] = await Promise.all([
      supabase
        .from("eway_bills")
        .select("*")
        .or("status.eq.pending,and(status.eq.active,shipment_id.is.null)")
        .order("created_at"),
      supabase
        .from("eway_bills")
        .select("*")
        .neq("status", "pending")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("vendor_eway_bill_setup").select("*"),
      supabase.from("courier_transporters").select("*").order("courier_name"),
    ]);
    if (error) console.error("eway bills load failed", error);
    const openIds = new Set((open ?? []).map((b) => b.id));
    const list = [...(open ?? []), ...(recent ?? []).reverse().filter((b) => !openIds.has(b.id))];

    const ids = <K extends keyof EwayBillRow>(key: K) =>
      [...new Set(list.map((b) => b[key]).filter((v): v is NonNullable<EwayBillRow[K]> => v != null))] as string[];
    const invoiceIds = ids("invoice_id");
    const challanIds = ids("challan_id");
    const { data: challans } = challanIds.length
      ? await supabase.from("delivery_challans").select("id, purpose, return_invoice_id").in("id", challanIds)
      : { data: [] as { id: string; purpose: string; return_invoice_id: string | null }[] };
    const challanById = new Map((challans ?? []).map((c) => [c.id, c]));
    const returnInvoiceIds = [
      ...new Set([...ids("return_invoice_id"), ...(challans ?? []).map((c) => c.return_invoice_id).filter((v): v is string => !!v)]),
    ];
    const [{ data: returnInvoices }, { data: returnLines }] = await Promise.all([
      returnInvoiceIds.length
        ? supabase.from("return_invoices").select("*").in("id", returnInvoiceIds)
        : Promise.resolve({ data: [] as ReturnInvoiceRow[] }),
      returnInvoiceIds.length
        ? supabase.from("return_invoice_lines").select("*").in("return_invoice_id", returnInvoiceIds).order("line_no")
        : Promise.resolve({ data: [] as Tables<"return_invoice_lines">[] }),
    ]);
    const returnInvoiceById = new Map((returnInvoices ?? []).map((r) => [r.id, r]));
    const [{ data: vendors }, { data: invoices }, { data: lines }, { data: parts }, { data: shipments }] = await Promise.all([
      ids("vendor_id").length
        ? supabase.from("vendors").select("id, name, boutique_code").in("id", ids("vendor_id"))
        : Promise.resolve({ data: [] as { id: string; name: string; boutique_code: string | null }[] }),
      invoiceIds.length ? supabase.from("invoices").select("*").in("id", invoiceIds) : Promise.resolve({ data: [] as InvoiceRow[] }),
      invoiceIds.length
        ? supabase.from("invoice_lines").select("*").in("invoice_id", invoiceIds).order("line_no")
        : Promise.resolve({ data: [] as InvoiceLineRow[] }),
      ids("vendor_order_id").length
        ? supabase.from("vendor_orders").select("id, status").in("id", ids("vendor_order_id"))
        : Promise.resolve({ data: [] as { id: string; status: string }[] }),
      ids("shipment_id").length
        ? supabase.from("shipments").select("id, awb_code, status").in("id", ids("shipment_id"))
        : Promise.resolve({ data: [] as { id: string; awb_code: string | null; status: string }[] }),
    ]);
    const vendorById = new Map((vendors ?? []).map((v) => [v.id, v]));
    const invoiceById = new Map((invoices ?? []).map((i) => [i.id, i]));
    const partById = new Map((parts ?? []).map((p) => [p.id, p.status as string]));
    const shipmentById = new Map((shipments ?? []).map((s) => [s.id, s]));
    const transporterByCourier = new Map((courierRows ?? []).map((c) => [c.courier_id, c.transporter_id]));

    setBills(
      list.map((b) => {
        const challan = b.challan_id ? challanById.get(b.challan_id) : undefined;
        const returnInvoiceId = b.return_invoice_id ?? challan?.return_invoice_id ?? null;
        const returnInvoice = returnInvoiceId ? returnInvoiceById.get(returnInvoiceId) ?? null : null;
        return {
          ...b,
          vendorName: vendorById.get(b.vendor_id)?.name ?? "Boutique",
          boutiqueCode: vendorById.get(b.vendor_id)?.boutique_code ?? null,
          invoice: b.invoice_id ? invoiceById.get(b.invoice_id) ?? null : null,
          returnInvoice,
          challanPurpose: challan?.purpose ?? null,
          lines: returnInvoice
            ? (returnLines ?? []).filter((l) => l.return_invoice_id === returnInvoice.id)
            : (lines ?? []).filter((l) => l.invoice_id === b.invoice_id),
          partStatus: partById.get(b.vendor_order_id) ?? null,
          shipment: b.shipment_id ? shipmentById.get(b.shipment_id) ?? null : null,
          transporterId: b.courier_id != null ? transporterByCourier.get(b.courier_id) ?? null : null,
        };
      }),
    );
    setSetups(new Map((setupRows ?? []).map((s) => [s.vendor_id, s])));
    setTransporters(courierRows ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { bills, setups, transporters, loading, refetch: load };
}
