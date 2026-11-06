import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { BulkSettings } from "@/lib/ewayBillJson";

export type EwayBillRow = Tables<"eway_bills">;
export type InvoiceRow = Tables<"invoices">;
export type InvoiceLineRow = Tables<"invoice_lines">;

export interface AdminEwayBill extends EwayBillRow {
  vendorName: string;
  boutiqueCode: string | null;
  invoice: InvoiceRow | null;
  lines: InvoiceLineRow[];
  partStatus: string | null; // the boutique part's own status (cancelled?)
  shipment: { awb_code: string | null; status: string } | null;
}

// Everything Admin > E-way bills shows: open requests and made-but-unused
// e-way bills (whatever their age), the rest from the last 30 days, with the
// invoice data the portal file needs, and AllBoutiqs' transporter settings.
export function useEwayBillsAdmin() {
  const [bills, setBills] = useState<AdminEwayBill[]>([]);
  const [settings, setSettings] = useState<BulkSettings>({ transporterId: null, transporterName: "AllBoutiqs", portalUserId: null });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: open, error }, { data: recent }, { data: platform }] = await Promise.all([
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
      supabase
        .from("platform_settings")
        .select("eway_bill_transporter_id, eway_bill_transporter_name, eway_bill_portal_user_id")
        .maybeSingle(),
    ]);
    if (error) console.error("eway bills load failed", error);
    const openIds = new Set((open ?? []).map((b) => b.id));
    const list = [...(open ?? []), ...(recent ?? []).reverse().filter((b) => !openIds.has(b.id))];

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

    setBills(
      list.map((b) => ({
        ...b,
        vendorName: vendorById.get(b.vendor_id)?.name ?? "Boutique",
        boutiqueCode: vendorById.get(b.vendor_id)?.boutique_code ?? null,
        invoice: b.invoice_id ? invoiceById.get(b.invoice_id) ?? null : null,
        lines: (lines ?? []).filter((l) => l.invoice_id === b.invoice_id),
        partStatus: partById.get(b.vendor_order_id) ?? null,
        shipment: b.shipment_id ? shipmentById.get(b.shipment_id) ?? null : null,
      })),
    );
    setSettings({
      transporterId: platform?.eway_bill_transporter_id ?? null,
      transporterName: platform?.eway_bill_transporter_name || "AllBoutiqs",
      portalUserId: platform?.eway_bill_portal_user_id ?? null,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { bills, settings, loading, refetch: load };
}
