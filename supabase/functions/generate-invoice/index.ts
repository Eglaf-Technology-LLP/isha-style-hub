import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  getCallerUserId,
  isAdmin,
  isVendorMember,
  errorMessage,
} from "../_shared/auth.ts";
import { ensureInvoice, findInvoice, findPlatformInvoice, InvoiceError } from "../_shared/invoice.ts";
import { paymentModeName } from "../_shared/paidVia.ts";

// The customer's GST tax invoice for one boutique part of an order - see
// _shared/invoice.ts for how it's made. Normally issued when the boutique
// ships (Ship Now); otherwise on first request here, once it may be.
// Returned with the e-way bill numbers the goods travelled on under it: the
// boutique's parcel and, on the warehouse route, the warehouse's parcel on
// its delivery challan. Returns and send-backs go on their own documents.

async function withEwayBills(
  supabase: ReturnType<typeof serviceClient>,
  result: { invoice: any; lines: any[] },
  withPlatformInvoice = false,
) {
  const { data: ewayBills } = await supabase
    .from("eway_bills")
    .select("ewb_number, ewb_date, leg, document_type, document_number")
    .eq("invoice_id", result.invoice.id)
    .in("leg", ["boutique_to_customer", "boutique_to_warehouse", "warehouse_to_customer"])
    .is("return_request_id", null)
    .is("send_back_id", null)
    .eq("status", "active")
    .not("ewb_number", "is", null)
    .order("created_at");
  // AllBoutiqs' own invoice for the courier etc. - for the customer and admins.
  const platformInvoice = withPlatformInvoice ? await findPlatformInvoice(supabase, result.invoice.vendor_order_id) : null;
  return { invoice: result.invoice, lines: result.lines, eway_bills: ewayBills ?? [], platform_invoice: platformInvoice };
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
      // "*": paid_via exists only from migration 20261124100000 on.
      .select("*")
      .eq("id", vendorOrder.order_id)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) return jsonResponse({ error: "Order not found" }, 404);

    const isCustomer = order.user_id === userId;
    const isAdminUser = !isCustomer && (await isAdmin(supabase, userId));
    // AllBoutiqs' own invoice (courier etc.) is between AllBoutiqs and the
    // customer - the boutique and the warehouse get only the goods invoice.
    const showPlatformInvoice = isCustomer || isAdminUser;
    const authorized =
      isCustomer ||
      isAdminUser ||
      (await isVendorMember(supabase, userId, vendorOrder.vendor_id)) ||
      // Warehouse staff print each boutique's invoice to go in the parcel.
      (await supabase.rpc("can_operate_warehouse", { _user_id: userId })).data === true;
    if (!authorized) return jsonResponse({ error: "Forbidden" }, 403);

    const existing = await findInvoice(supabase, vendor_order_id);
    // How the customer paid, printed on the invoice ("UPI", "Cash on Delivery").
    const payment_mode = paymentModeName(order);
    if (existing) return jsonResponse({ ...(await withEwayBills(supabase, existing, showPlatformInvoice)), payment_mode });

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

    return jsonResponse({ ...(await withEwayBills(supabase, await ensureInvoice(supabase, vendor_order_id), showPlatformInvoice)), payment_mode });
  } catch (e) {
    console.error("generate-invoice error", e);
    if (e instanceof InvoiceError) return jsonResponse({ error: e.message }, e.status);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
