import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  getCallerUserId,
  isAdmin,
  isVendorMember,
  errorMessage,
} from "../_shared/auth.ts";

// One invoice per vendor_order (each vendor is the legal seller of their
// own goods here) - generated once, on first request, then cached and
// returned as-is on every later request. Seller/buyer details are
// snapshotted at generation time so the document never silently drifts if
// the vendor's GSTIN or the customer's address changes afterward.
//
// Structural v1: tax_amount is always 0 until real GST inputs (registration
// model, HSN codes, tax-inclusive pricing confirmation) are supplied - see
// the migration comment. Not yet a document to hand to a tax authority.
function financialYear(d: Date): string {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1; // 1-12
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
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

    const { data: existing, error: existingErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("vendor_order_id", vendor_order_id)
      .maybeSingle();
    if (existingErr) throw existingErr;

    const { data: vendorOrder, error: voErr } = await supabase
      .from("vendor_orders")
      .select("id, order_id, vendor_id, status, subtotal, shipping_cost")
      .eq("id", vendor_order_id)
      .maybeSingle();
    if (voErr) throw voErr;
    if (!vendorOrder) return jsonResponse({ error: "Order item not found" }, 404);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, user_id, payment_status, customer_name, shipping_address, discount_code, discount_amount")
      .eq("id", vendorOrder.order_id)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) return jsonResponse({ error: "Order not found" }, 404);

    const authorized =
      order.user_id === userId ||
      (await isVendorMember(supabase, userId, vendorOrder.vendor_id)) ||
      (await isAdmin(supabase, userId));
    if (!authorized) return jsonResponse({ error: "Forbidden" }, 403);

    if (existing) {
      return jsonResponse({ invoice: existing });
    }

    if (order.payment_status !== "paid") {
      return jsonResponse({ error: "An invoice can only be generated for a paid order" }, 400);
    }
    if (vendorOrder.status === "cancelled") {
      return jsonResponse({ error: "This item was cancelled - no invoice applies" }, 400);
    }

    const { data: vendor, error: vendorErr } = await supabase
      .from("vendors")
      .select("name, slug, gst_number, address")
      .eq("id", vendorOrder.vendor_id)
      .single();
    if (vendorErr) throw vendorErr;

    const { data: seq, error: seqErr } = await supabase.rpc("next_invoice_seq");
    if (seqErr) throw seqErr;

    const issuedAt = new Date();
    const invoiceNumber = `INV/${financialYear(issuedAt)}/${vendor.slug}/${String(seq).padStart(6, "0")}`;
    const subtotal = Number(vendorOrder.subtotal);
    const shippingCost = Number(vendorOrder.shipping_cost);
    const taxAmount = 0;

    const { data: invoice, error: insertErr } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        vendor_order_id: vendorOrder.id,
        order_id: order.id,
        vendor_id: vendorOrder.vendor_id,
        issued_at: issuedAt.toISOString(),
        subtotal,
        shipping_cost: shippingCost,
        tax_amount: taxAmount,
        total: subtotal + shippingCost + taxAmount,
        seller_name: vendor.name,
        seller_gstin: vendor.gst_number,
        seller_address: vendor.address,
        billing_name: order.customer_name,
        billing_address: order.shipping_address,
        // Order-level, not this vendor's share specifically - one coupon
        // applies to the whole cart, not per vendor. Snapshotted as-is
        // rather than prorated into this vendor's own total, which would
        // assert a vendor-funds-the-discount accounting policy that hasn't
        // actually been decided (see the migration comment).
        discount_code: order.discount_code,
        discount_amount: order.discount_amount,
      })
      .select("*")
      .single();
    if (insertErr) throw insertErr;

    return jsonResponse({ invoice });
  } catch (e) {
    console.error("generate-invoice error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
