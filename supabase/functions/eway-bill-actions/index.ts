import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  getCallerUserId,
  isAdmin,
  errorMessage,
} from "../_shared/auth.ts";
import { InvoiceError } from "../_shared/invoice.ts";
import { announceReady, EwayBill, resendRequestEmail } from "../_shared/ewayBill.ts";

// Admin > E-way bills: an admin makes the e-way bill on the government portal
// (or the boutique emails one it made) and records it here.
//
//   record          type in the 12-digit number (and, when it differs from
//                   the request, the courier or document it was made on);
//                   the boutique / warehouse is told it can book
//   cancel          close a request or a number that won't be used (the
//                   number itself is cancelled on the portal)
//   resend_request  email a boutique that makes its own the details again

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();
    if (!(await isAdmin(supabase, userId))) return jsonResponse({ error: "Only an admin can do this" }, 403);

    const { data: found, error: findErr } = await supabase.from("eway_bills").select("*").eq("id", body.eway_bill_id).maybeSingle();
    if (findErr) throw findErr;
    if (!found) throw new ActionError("E-way bill request not found", 404);
    const bill = found as EwayBill;

    switch (body.action) {
      case "record": {
        const number = String(body.ewb_number ?? "").replace(/\s/g, "");
        if (!/^\d{12}$/.test(number)) throw new ActionError("An e-way bill number has 12 digits");
        if (bill.status === "cancelled") throw new ActionError("This request was cancelled");
        // Once booked, only its dates can still be filled in (validity starts
        // when the courier fills Part B).
        const changesTheBill =
          number !== bill.ewb_number ||
          (body.courier_id != null && Number(body.courier_id) !== bill.courier_id) ||
          (body.document_number != null && String(body.document_number).trim() !== bill.document_number);
        if (bill.shipment_id && changesTheBill) {
          throw new ActionError("The parcel is already booked with this e-way bill - only its dates can change now");
        }

        const ewbDate = parseMoment(body.ewb_date, "Generated on") ?? new Date().toISOString();
        const validUntil = parseMoment(body.valid_until, "Valid until");
        if (validUntil && validUntil <= ewbDate) throw new ActionError("Valid until must be after the date it was generated");

        const update: Record<string, unknown> = {
          status: "active",
          ewb_number: number,
          ewb_date: ewbDate,
          valid_until: validUntil,
          ...(changesTheBill ? { entered_by: userId, entered_at: new Date().toISOString() } : {}),
        };
        // Made out to another courier than requested (the boutique's choice
        // changed, or the portal entry was corrected).
        if (body.courier_id != null && Number(body.courier_id) !== bill.courier_id) {
          if (!Number.isInteger(Number(body.courier_id))) throw new ActionError("Pick the courier from the list");
          update.courier_id = Number(body.courier_id);
          update.courier_name = String(body.courier_name ?? "").trim() || null;
        }
        // Made on another document (e.g. a boutique that issues its own).
        if (body.document_number != null && String(body.document_number).trim() !== bill.document_number) {
          const docNumber = String(body.document_number).trim();
          if (!DOC_NUMBER_RE.test(docNumber)) {
            throw new ActionError("A document number is up to 16 letters, digits, / or -");
          }
          update.document_number = docNumber;
        }
        if (body.document_date != null && body.document_date !== bill.document_date) {
          if (!DATE_RE.test(String(body.document_date))) throw new ActionError("Document date isn't a valid date");
          update.document_date = body.document_date;
        }

        const { data: saved, error } = await supabase.from("eway_bills").update(update).eq("id", bill.id).select("*").single();
        if (error) {
          if ((error as { code?: string }).code === "23505") {
            throw new ActionError(`E-way bill ${number} is already recorded on another parcel`);
          }
          throw error;
        }
        // Dates filled in later don't need telling anyone.
        if (changesTheBill) await announceReady(supabase, saved as EwayBill);
        return jsonResponse({ eway_bill: saved });
      }

      case "cancel": {
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

      case "resend_request": {
        if (bill.status !== "pending") throw new ActionError("This e-way bill isn't waiting for a number");
        const sentTo = await resendRequestEmail(supabase, bill);
        return jsonResponse({ sent_to: sentTo });
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
