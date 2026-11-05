import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  getCallerUserId,
  isAdmin,
  isVendorMember,
  errorMessage,
} from "../_shared/auth.ts";
import { ensureInvoice, findInvoice, InvoiceError } from "../_shared/invoice.ts";

// The customer's GST tax invoice for one boutique part of an order - see
// _shared/invoice.ts for how it's made. Normally issued when the boutique
// ships (Ship Now); otherwise on first request here, once it may be.
// Returned with the e-way bill numbers the goods travelled on under it.

async function withEwayBills(supabase: ReturnType<typeof serviceClient>, result: { invoice: any; lines: any[] }) {
  const { data: ewayBills } = await supabase
    .from("eway_bills")
    .select("ewb_number, ewb_date, leg")
    .eq("invoice_id", result.invoice.id)
    .eq("document_type", "tax_invoice")
    .eq("status", "active")
    .order("created_at");
  return { invoice: result.invoice, lines: result.lines, eway_bills: ewayBills ?? [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { vendor_order_id } = await req.json();
    if (!vendor_order_id || typeof vendor_order_id !== "string") {
      return jsonResponse({ error: "vendor_order_id is required" }, 400);
    }

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();

    const { data: vendorOrder, error: voErr } = await supabase
      .from("vendor_orders")
      .select("id, order_id, vendor_id, status, qc_status, dispatch_id")
      .eq("id", vendor_order_id)
      .maybeSingle();
    if (voErr) throw voErr;
    if (!vendorOrder) return jsonResponse({ error: "Order item not found" }, 404);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, user_id, payment_method, payment_status")
      .eq("id", vendorOrder.order_id)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) return jsonResponse({ error: "Order not found" }, 404);

    // Warehouse staff print each boutique's invoice to go in the parcel.
    const authorized =
      order.user_id === userId ||
      (await isVendorMember(supabase, userId, vendorOrder.vendor_id)) ||
      (await isAdmin(supabase, userId)) ||
      (await supabase.rpc("can_operate_warehouse", { _user_id: userId })).data === true;
    if (!authorized) return jsonResponse({ error: "Forbidden" }, 403);

    const existing = await findInvoice(supabase, vendor_order_id);
    if (existing) return jsonResponse(await withEwayBills(supabase, existing));

    if (vendorOrder.status === "cancelled" || vendorOrder.status === "qc_failed" || vendorOrder.qc_status === "failed") {
      return jsonResponse({ error: "This item was cancelled - no invoice applies" }, 400);
    }
    // Online orders: once paid. Cash on Delivery: once the goods are on their
    // way to the customer (shipped, or passed the warehouse quality check and
    // being packed - warehouse staff put the invoice in the parcel).
    const goodsGoing =
      ["shipped", "out_for_delivery", "delivered", "ndr"].includes(vendorOrder.status) ||
      (vendorOrder.status === "at_warehouse" && vendorOrder.qc_status === "passed") ||
      !!vendorOrder.dispatch_id;
    if (order.payment_status !== "paid" && !(order.payment_method === "cod" && goodsGoing)) {
      return jsonResponse(
        {
          error:
            order.payment_method === "cod"
              ? "The invoice will be ready when this item is shipped"
              : "An invoice can only be generated for a paid order",
        },
        400,
      );
    }

    return jsonResponse(await withEwayBills(supabase, await ensureInvoice(supabase, vendor_order_id)));
  } catch (e) {
    console.error("generate-invoice error", e);
    if (e instanceof InvoiceError) return jsonResponse({ error: e.message }, e.status);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
