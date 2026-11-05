import {
  corsHeaders,
  errorMessage,
  getCallerUserId,
  isAdmin,
  jsonResponse,
  serviceClient,
  shiprocketRequest,
} from "../_shared/shiprocket.ts";

// Cash on Delivery money from Shiprocket (cron twice a day, or the admin's
// "Check Shiprocket now"): for every COD parcel to a customer, reads
// Shiprocket's order - its COD charge and whether the collected cash has
// been remitted to AllBoutiqs (status / UTR / date) - into shipments, then
// apply_shipment_cod() puts the charge on the boutique orders and marks
// their cash received. Shiprocket only reports remittance per order on
// /orders/show, so each open parcel is one call.

const MAX_PER_RUN = 200;
const LOOKBACK_DAYS = 120;

function isServiceRoleCall(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try {
    return JSON.parse(atob((token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
  } catch {
    return false;
  }
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

// Shiprocket writes dates several ways: "10-10-2026 14:28:00",
// "2026-10-10 09:57:58", "10 Oct 2026", "12nd Sep 2026 01:47 AM".
function parseDay(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{4})/);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase());
    if (month >= 0) return `${m[3]}-${pad(month + 1)}-${pad(Number(m[1]))}`;
  }
  return null;
}

function remitted(status: string | null, utr: string | null): boolean {
  if (utr) return true;
  if (!status) return false;
  return /remitted|paid|complete|success|settled/i.test(status) && !/not|un|pending|due|initiat/i.test(status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = serviceClient();
    if (!isServiceRoleCall(req)) {
      const userId = await getCallerUserId(req);
      if (!userId || !(await isAdmin(supabase, userId))) return jsonResponse({ error: "Forbidden" }, 403);
    }
    const body = await req.json().catch(() => ({}));
    const onlyShipmentId: string | undefined = body?.shipment_id;

    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    const { data: codOrders, error: ordersErr } = await supabase
      .from("orders")
      .select("id")
      .eq("payment_method", "cod")
      .gte("created_at", since);
    if (ordersErr) throw ordersErr;
    const orderIds = (codOrders ?? []).map((o) => o.id);

    const candidates: any[] = [];
    for (let i = 0; i < orderIds.length; i += 100) {
      let q = supabase
        .from("shipments")
        .select("id, status, shiprocket_order_id, cod_amount, cod_charge, cod_remittance_utr, cod_remitted_on, cod_synced_at")
        .in("shipment_type", ["forward", "warehouse_to_customer"])
        .neq("status", "cancelled")
        .not("shiprocket_order_id", "is", null)
        .in("order_id", orderIds.slice(i, i + 100));
      if (onlyShipmentId) q = q.eq("id", onlyShipmentId);
      const { data, error } = await q;
      if (error) throw error;
      candidates.push(...(data ?? []));
    }

    // Nothing more to learn once the cash is remitted and the charge known,
    // or once a parcel went back to the boutique (no cash collected).
    const open = candidates
      .filter((s) => {
        const done = (s.cod_remittance_utr || s.cod_remitted_on) && s.cod_charge !== null;
        const deadRto = s.status === "rto" && s.cod_synced_at;
        const notCod = s.cod_synced_at && s.cod_amount === null;
        return !done && !deadRto && !notCod;
      })
      .sort((a, b) => String(a.cod_synced_at ?? "").localeCompare(String(b.cod_synced_at ?? "")))
      .slice(0, MAX_PER_RUN);

    const summary = { checked: 0, cod_parcels: 0, charges_found: 0, remitted: 0, errors: [] as { shipment_id: string; error: string }[] };
    for (const s of open) {
      try {
        const res = await shiprocketRequest(supabase, `/orders/show/${s.shiprocket_order_id}`);
        const d = res?.data;
        if (!d) throw new Error("Shiprocket returned no order");
        summary.checked++;
        const now = new Date().toISOString();

        const isCod = Number(d.cod) === 1 || String(d.payment_method ?? "").toLowerCase() === "cod";
        if (!isCod) {
          await supabase.from("shipments").update({ cod_synced_at: now }).eq("id", s.id);
          continue;
        }
        summary.cod_parcels++;

        // The COD charge is real only once a courier is assigned (before
        // that Shiprocket shows 0.00).
        const sh = Array.isArray(d.shipments) ? d.shipments[0] : d.shipments;
        const hasAwb = Boolean(d.awb_data?.awb || sh?.awb);
        const codCharge = hasAwb ? num(d.awb_data?.charges?.cod_charges) ?? num(sh?.cod_charges) : null;
        if (codCharge !== null) summary.charges_found++;

        const utr = String(d.remittance_utr ?? "").trim() || null;
        const remStatus = String(d.remittance_status ?? "").trim() || null;
        const isRemitted = remitted(remStatus, utr);
        if (isRemitted) summary.remitted++;
        const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

        const { error: updErr } = await supabase
          .from("shipments")
          .update({
            cod_amount: num(d.total),
            cod_charge: codCharge ?? s.cod_charge,
            cod_remittance_status: remStatus,
            cod_remittance_utr: utr,
            cod_remitted_on: isRemitted ? parseDay(d.remittance_date) ?? today : null,
            cod_synced_at: now,
          })
          .eq("id", s.id);
        if (updErr) throw updErr;
        const { error: applyErr } = await supabase.rpc("apply_shipment_cod", { _shipment_id: s.id });
        if (applyErr) throw applyErr;
      } catch (e) {
        console.error("shiprocket-cod-sync", s.id, errorMessage(e));
        summary.errors.push({ shipment_id: s.id, error: errorMessage(e) });
      }
    }

    return jsonResponse({ ...summary, open: open.length });
  } catch (e) {
    console.error("shiprocket-cod-sync error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
