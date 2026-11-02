import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type EwayBillRow = Tables<"eway_bills">;
export type VendorEwayBillSetup = Tables<"vendor_eway_bill_setup">;
export type CourierTransporter = Tables<"courier_transporters">;
export type InvoiceRow = Tables<"invoices">;
export type InvoiceLineRow = Tables<"invoice_lines">;

export interface AdminEwayBill extends EwayBillRow {
  vendorName: string;
  boutiqueCode: string | null;
  invoice: InvoiceRow | null;
  lines: InvoiceLineRow[];
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
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: rows, error }, { data: setupRows }, { data: courierRows }] = await Promise.all([
      supabase
        .from("eway_bills")
        .select("*")
        .or(`status.neq.cancelled,created_at.gte."${since}"`)
        .order("created_at", { ascending: true })
        .limit(500),
      supabase.from("vendor_eway_bill_setup").select("*"),
      supabase.from("courier_transporters").select("*").order("courier_name"),
    ]);
    if (error) console.error("eway bills load failed", error);
    const list = rows ?? [];

    const ids = <K extends keyof EwayBillRow>(key: K) =>
      [...new Set(list.map((b) => b[key]).filter((v): v is NonNullable<EwayBillRow[K]> => v != null))] as string[];
    const invoiceIds = ids("invoice_id");
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
      list.map((b) => ({
        ...b,
        vendorName: vendorById.get(b.vendor_id)?.name ?? "Boutique",
        boutiqueCode: vendorById.get(b.vendor_id)?.boutique_code ?? null,
        invoice: b.invoice_id ? invoiceById.get(b.invoice_id) ?? null : null,
        lines: (lines ?? []).filter((l) => l.invoice_id === b.invoice_id),
        partStatus: partById.get(b.vendor_order_id) ?? null,
        shipment: b.shipment_id ? shipmentById.get(b.shipment_id) ?? null : null,
        transporterId: b.courier_id != null ? transporterByCourier.get(b.courier_id) ?? null : null,
      })),
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
