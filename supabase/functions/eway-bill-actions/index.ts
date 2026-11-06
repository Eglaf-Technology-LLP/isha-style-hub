import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  getCallerUserId,
  isAdmin,
  errorMessage,
} from "../_shared/auth.ts";
import { InvoiceError } from "../_shared/invoice.ts";
import {
  announcePdf,
  announceReady,
  EwayBill,
  EwayBillLeg,
  LEGS,
  movementFor,
  requestEwayBill,
  watchEwayBills,
} from "../_shared/ewayBill.ts";

// Admin > E-way bills. AllBoutiqs makes the e-way bills on the government
// portal (bulk JSON upload) and records them here:
//
//   record          one number (and dates; the document when it was made on
//                   another one); the boutique / warehouse is told to ship
//   record_bulk     many numbers at once (pasted from the portal's result)
//   attach_pdf      the portal's PDF, uploaded to the eway-bills bucket by
//                   the page, linked here so the boutique can print it
//   extend          validity extended on the portal - the new end
//   cancel          close a request / a number cancelled on the portal
//   mark_exported   these went into a bulk JSON download
//   create          a request by hand (a return, a send-back, anything the
//                   automatic ones missed)
//   watch           the watcher (cron / database triggers, or an admin)

class ActionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const DOC_NUMBER_RE = /^[A-Za-z0-9/-]{1,16}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseMoment(raw: unknown, label: string): string | null {
  if (raw == null || raw === "") return null;
  const d = new Date(String(raw));
  if (isNaN(d.getTime())) throw new ActionError(`${label} isn't a valid date`);
  return d.toISOString();
}

// Cron and database triggers call with the service role key (the gateway's
// verify_jwt has already checked its signature).
function isServiceRoleCall(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try {
    return JSON.parse(atob((token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
  } catch {
    return false;
  }
}

type Db = ReturnType<typeof serviceClient>;

async function loadBill(supabase: Db, id: unknown): Promise<EwayBill> {
  const { data, error } = await supabase.from("eway_bills").select("*").eq("id", String(id ?? "")).maybeSingle();
  if (error) throw error;
  if (!data) throw new ActionError("E-way bill request not found", 404);
  return data as EwayBill;
}

interface RecordInput {
  ewb_number?: unknown;
  ewb_date?: unknown;
  valid_until?: unknown;
  document_number?: unknown;
  document_date?: unknown;
}

// Save a number; tells the boutique / warehouse when the number is new.
async function recordNumber(supabase: Db, bill: EwayBill, input: RecordInput, userId: string): Promise<EwayBill> {
  const number = String(input.ewb_number ?? "").replace(/\s/g, "");
  if (!/^\d{12}$/.test(number)) throw new ActionError("An e-way bill number has 12 digits");
  if (bill.status === "cancelled") throw new ActionError("This request was cancelled");
  const docNumber = input.document_number != null ? String(input.document_number).trim() : null;
  // Once booked, only its dates can still be filled in (validity starts when
  // Part B is filled).
  const changesTheBill = number !== bill.ewb_number || (docNumber != null && docNumber !== bill.document_number);
  if (bill.shipment_id && changesTheBill) {
    throw new ActionError("The parcel is already booked with this e-way bill - only its dates can change now");
  }

  const ewbDate = parseMoment(input.ewb_date, "Generated on") ?? bill.ewb_date ?? new Date().toISOString();
  const validUntil = parseMoment(input.valid_until, "Valid until") ?? (changesTheBill ? null : bill.valid_until);
  if (validUntil && validUntil <= ewbDate) throw new ActionError("Valid until must be after the date it was generated");

  const update: Record<string, unknown> = {
    status: "active",
    ewb_number: number,
    ewb_date: ewbDate,
    valid_until: validUntil,
    ...(changesTheBill ? { entered_by: userId, entered_at: new Date().toISOString() } : {}),
  };
  // Made on another document (corrected on the portal).
  if (docNumber != null && docNumber !== bill.document_number) {
    if (!DOC_NUMBER_RE.test(docNumber)) throw new ActionError("A document number is up to 16 letters, digits, / or -");
    update.document_number = docNumber;
  }
  if (input.document_date != null && input.document_date !== bill.document_date) {
    if (!DATE_RE.test(String(input.document_date))) throw new ActionError("Document date isn't a valid date");
    update.document_date = input.document_date;
  }

  const { data: saved, error } = await supabase.from("eway_bills").update(update).eq("id", bill.id).select("*").single();
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new ActionError(`E-way bill ${number} is already recorded on another parcel`);
    throw error;
  }
  // Dates filled in later don't need telling anyone.
  if (changesTheBill) await announceReady(supabase, saved as EwayBill);
  return saved as EwayBill;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const supabase = serviceClient();

    if (body.action === "watch" && isServiceRoleCall(req)) {
      return jsonResponse(await watchEwayBills(supabase));
    }

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
    if (!(await isAdmin(supabase, userId))) return jsonResponse({ error: "Only an admin can do this" }, 403);

    switch (body.action) {
      case "watch":
        return jsonResponse(await watchEwayBills(supabase));

      case "record": {
        const bill = await loadBill(supabase, body.eway_bill_id);
        return jsonResponse({ eway_bill: await recordNumber(supabase, bill, body, userId) });
      }

      case "record_bulk": {
        const entries = Array.isArray(body.entries) ? (body.entries as (RecordInput & { eway_bill_id: string })[]) : [];
        if (!entries.length) throw new ActionError("Nothing to save");
        if (entries.length > 200) throw new ActionError("Save up to 200 at a time");
        const numbers = entries.map((e) => String(e.ewb_number ?? "").replace(/\s/g, ""));
        if (new Set(numbers).size !== numbers.length) throw new ActionError("The same e-way bill number is entered twice");
        const results: { eway_bill_id: string; ok: boolean; error?: string }[] = [];
        for (const entry of entries) {
          try {
            const bill = await loadBill(supabase, entry.eway_bill_id);
            await recordNumber(supabase, bill, entry, userId);
            results.push({ eway_bill_id: entry.eway_bill_id, ok: true });
          } catch (e) {
            results.push({ eway_bill_id: entry.eway_bill_id, ok: false, error: errorMessage(e) });
          }
        }
        return jsonResponse({ results });
      }

      case "attach_pdf": {
        const bill = await loadBill(supabase, body.eway_bill_id);
        const path = String(body.path ?? "");
        if (!path.startsWith(`${bill.vendor_id}/`) || !path.toLowerCase().endsWith(".pdf")) {
          throw new ActionError("Upload the PDF to this boutique's folder first");
        }
        const hadPdf = !!bill.pdf_path;
        const { data: saved, error } = await supabase
          .from("eway_bills")
          .update({ pdf_path: path, pdf_uploaded_at: new Date().toISOString() })
          .eq("id", bill.id)
          .select("*")
          .single();
        if (error) throw error;
        // The number was already announced without a copy - say it's there now.
        if (!hadPdf && bill.status === "active") await announcePdf(supabase, saved as EwayBill);
        return jsonResponse({ eway_bill: saved });
      }

      case "extend": {
        const bill = await loadBill(supabase, body.eway_bill_id);
        if (bill.status !== "active") throw new ActionError("Only an e-way bill that's been made can be extended");
        const validUntil = parseMoment(body.valid_until, "New valid until");
        if (!validUntil) throw new ActionError("Enter the new valid-until date from the portal");
        if (bill.valid_until && validUntil <= bill.valid_until) throw new ActionError("The new date must be after the current one");
        const { data: saved, error } = await supabase
          .from("eway_bills")
          .update({
            valid_until: validUntil,
            extended_count: ((bill as unknown as { extended_count?: number }).extended_count ?? 0) + 1,
            last_extended_at: new Date().toISOString(),
          })
          .eq("id", bill.id)
          .select("*")
          .single();
        if (error) throw error;
        return jsonResponse({ eway_bill: saved });
      }

      case "cancel": {
        const bill = await loadBill(supabase, body.eway_bill_id);
        if (bill.status === "cancelled") return jsonResponse({ eway_bill: bill });
        const reason = String(body.reason ?? "").trim();
        if (!reason) throw new ActionError("Say why it's cancelled");
        if (bill.shipment_id) {
          const { data: shipment } = await supabase.from("shipments").select("status, awb_code").eq("id", bill.shipment_id).maybeSingle();
          if (shipment && shipment.status !== "cancelled") {
            throw new ActionError(
              `This e-way bill is on a booked parcel${shipment.awb_code ? ` (AWB ${shipment.awb_code})` : ""} - cancel the booking first`,
            );
          }
        }
        const { data: saved, error } = await supabase
          .from("eway_bills")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: userId, cancel_reason: reason })
          .eq("id", bill.id)
          .select("*")
          .single();
        if (error) throw error;
        return jsonResponse({ eway_bill: saved });
      }

      case "mark_exported": {
        const ids = Array.isArray(body.eway_bill_ids) ? (body.eway_bill_ids as string[]).map(String) : [];
        if (!ids.length) return jsonResponse({ updated: 0 });
        const { error } = await supabase
          .from("eway_bills")
          .update({ exported_at: new Date().toISOString(), exported_by: userId })
          .in("id", ids)
          .eq("status", "pending");
        if (error) throw error;
        return jsonResponse({ updated: ids.length });
      }

      case "create": {
        const leg = String(body.leg ?? "") as EwayBillLeg;
        if (!LEGS.includes(leg)) throw new ActionError("Pick the movement");
        const vendorOrderId = String(body.vendor_order_id ?? "");
        if (!vendorOrderId) throw new ActionError("Pick the boutique's part of the order");
        const returnRequestId = body.return_request_id ? String(body.return_request_id) : null;
        const sendBackId = body.send_back_id ? String(body.send_back_id) : null;

        // Only the items of the return / send-back move; otherwise the whole part.
        let items: { order_item_id: string; quantity: number }[] | null = null;
        if (sendBackId) {
          const { data: sb } = await supabase.from("boutique_send_backs").select("vendor_order_id, items").eq("id", sendBackId).maybeSingle();
          if (!sb || sb.vendor_order_id !== vendorOrderId) throw new ActionError("That send-back isn't for this boutique's part");
          items = ((sb.items ?? []) as any[]).map((i) => ({ order_item_id: i.order_item_id, quantity: Number(i.quantity ?? 1) }));
        } else if (returnRequestId) {
          const { data: rr } = await supabase.from("return_requests").select("items").eq("id", returnRequestId).maybeSingle();
          if (!rr) throw new ActionError("Return not found", 404);
          const { data: mine } = await supabase.from("order_items").select("id").eq("vendor_order_id", vendorOrderId);
          const ids = new Set((mine ?? []).map((l) => l.id));
          items = ((rr.items ?? []) as any[])
            .filter((i) => ids.has(i.order_item_id))
            .map((i) => ({ order_item_id: i.order_item_id, quantity: Number(i.quantity ?? 1) }));
          if (!items.length) throw new ActionError("None of that return's items are from this boutique");
        }

        const movement = await movementFor(supabase, vendorOrderId, leg, {
          returnRequestId,
          sendBackId,
          items,
          requestedBy: userId,
        });
        const check = await requestEwayBill(supabase, movement, { announce: false });
        if (!check.required) {
          throw new ActionError("These goods are under the e-way bill limit - none is needed");
        }
        return jsonResponse({ eway_bill: check.bill, created: check.created });
      }

      default:
        throw new ActionError(`Unknown action ${body.action}`);
    }
  } catch (e) {
    console.error("eway-bill-actions error", e);
    const status = e instanceof ActionError || e instanceof InvoiceError ? e.status : 500;
    return jsonResponse({ error: errorMessage(e) }, status);
  }
});
