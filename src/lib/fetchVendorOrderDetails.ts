import { supabase } from "@/integrations/supabase/client";
import type { VendorOrderDetailsData } from "@/components/admin/VendorOrderDetailsDialog";

// Single source of truth for "everything about one vendor_order" - used by
// every order-ish list (cancelled orders, returns/exchanges, payments) that
// only loads a handful of summary columns per row and needs the full
// breakdown fetched lazily, on demand, when a specific row's View is
// clicked - not up front for every row in a list that could be thousands
// long.
export async function fetchVendorOrderDetails(vendorOrderId: string): Promise<VendorOrderDetailsData | null> {
  const { data: vo, error } = await supabase
    .from("vendor_orders")
    .select(
      "id, order_id, subtotal, shipping_cost, status, vendor:vendors(name), order:orders(created_at, payment_method, payment_status, customer_name, customer_phone, customer_email, shipping_address, discount_code, discount_amount)"
    )
    .eq("id", vendorOrderId)
    .maybeSingle();
  if (error || !vo) return null;

  const order = Array.isArray(vo.order) ? vo.order[0] : vo.order;
  const vendor = Array.isArray(vo.vendor) ? vo.vendor[0] : vo.vendor;
  if (!order) return null;

  const [{ data: items }, { data: shipment }] = await Promise.all([
    supabase
      .from("order_items")
      .select("product_title, variant_title, size, color, sku, quantity, price")
      .eq("vendor_order_id", vendorOrderId),
    supabase
      .from("shipments")
      .select("*")
      .eq("vendor_order_id", vendorOrderId)
      .eq("shipment_type", "forward")
      .maybeSingle(),
  ]);

  return {
    orderId: vo.order_id,
    createdAt: order.created_at,
    vendorName: vendor?.name || "Vendor",
    status: vo.status,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    customerEmail: order.customer_email,
    shippingAddress: order.shipping_address as VendorOrderDetailsData["shippingAddress"],
    items: items ?? [],
    subtotal: Number(vo.subtotal),
    shippingCost: Number(vo.shipping_cost),
    discountCode: order.discount_code,
    discountAmount: order.discount_amount,
    shipment: shipment ?? null,
  };
}
