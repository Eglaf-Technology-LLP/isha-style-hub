import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  bookedCourierCost,
  DEFAULT_ITEM_WEIGHT_GRAMS,
  ensurePickupLocation,
  errorMessage,
  shiprocketRequest,
  toIntOrNull,
} from "./shiprocket.ts";
import { getWarehouse, PARCEL_DEFAULTS } from "./warehouse.ts";
import { ensureInvoice, InvoiceError, issueReturnInvoice } from "./invoice.ts";
import { ewayBillForBooking, releaseHeldReturnPickup, returnInvoiceDocument } from "./ewayBill.ts";

export class ReversePickupError extends Error {}

function formatShiprocketDate(iso: string): string {
  return iso.slice(0, 19).replace("T", " ");
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Books the courier pickup FROM the customer for a return (or the old item of
// an exchange that goes through the warehouse): to the AllBoutiqs warehouse
// when return_destination = 'warehouse' (items may then span several
// boutiques), otherwise straight to the one boutique. Three Shiprocket calls in
// sequence - their return API, unlike the Forward wrapper, doesn't bundle AWB
// assignment or pickup scheduling: create the return order, assign a
// courier/AWB, then request the pickup.
//
// The goods go back on each boutique's return invoice (issued here, whatever
// the value). A boutique's part over the e-way bill limit holds the pickup
// until its e-way bill is in (eway-bill-actions then requests it); calling
// again re-checks a held pickup.
export async function bookReversePickup(supabase: SupabaseClient, returnRequestId: string, requestedBy: string | null = null) {
  const { data: returnRequest, error: rrErr } = await supabase
    .from("return_requests")
    .select("id, order_id, request_type, items, refund_amount, created_at, return_destination")
    .eq("id", returnRequestId)
    .maybeSingle();
  if (rrErr) throw rrErr;
  if (!returnRequest) throw new ReversePickupError("Return request not found");

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, customer_name, customer_email, customer_phone, shipping_address, warehouse_id")
    .eq("id", returnRequest.order_id)
    .single();
  if (orderErr) throw orderErr;

  const items = returnRequest.items as any[];
  const orderItemIds = items.map((i) => i.order_item_id).filter(Boolean);
  const { data: orderItems, error: oiErr } = await supabase
    .from("order_items")
    .select("id, vendor_id, vendor_order_id, product_id, sku")
    .in("id", orderItemIds);
  if (oiErr) throw oiErr;

  const vendorIds = [...new Set((orderItems ?? []).map((i) => i.vendor_id).filter(Boolean))];
  if (vendorIds.length === 0) throw new ReversePickupError("Could not resolve a boutique for this return");

  const toWarehouse = returnRequest.return_destination === "warehouse" && !!order.warehouse_id;
  if (!toWarehouse && vendorIds.length > 1) {
    throw new ReversePickupError("This return spans multiple boutiques - send it to the warehouse instead");
  }
  const vendorOrderIds = [...new Set((orderItems ?? []).map((i) => i.vendor_order_id).filter(Boolean))];
  const vendorOrderId = vendorOrderIds.length === 1 ? vendorOrderIds[0] : null;

  const { data: existingShipment } = await supabase
    .from("shipments")
    .select("id, awb_code, shipment_type, status, courier_id, courier_name")
    .eq("return_request_id", returnRequestId)
    .in("shipment_type", ["return", "return_to_warehouse"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let destination: { name: string; address: Record<string, string>; email: string | null; phone: string | null };
  let warehouseId: string | null = null;
  if (toWarehouse) {
    const warehouse = await getWarehouse(supabase, order.warehouse_id);
    warehouseId = warehouse.id;
    destination = {
      name: `${warehouse.name} (${warehouse.contact_name})`,
      address: warehouse.address as Record<string, string>,
      email: warehouse.contact_email,
      phone: warehouse.contact_phone,
    };
  } else {
    const { data: vendor, error: vendorErr } = await supabase
      .from("vendors")
      .select("id, slug, name, contact_email, contact_phone, address, shiprocket_pickup_location")
      .eq("id", vendorIds[0])
      .single();
    if (vendorErr) throw vendorErr;
    // Return orders address the vendor destination via explicit
    // shipping_* fields below, not a pickup_location name - this call is
    // only to guarantee the vendor is registered with Shiprocket at all.
    if (!existingShipment) await ensurePickupLocation(supabase, vendor as any);
    destination = {
      name: vendor.name,
      address: (vendor.address ?? {}) as Record<string, string>,
      email: vendor.contact_email,
      phone: vendor.contact_phone,
    };
  }

  const customerAddress = order.shipping_address as Record<string, string>;

  // Return invoices + e-way bills per boutique part; true while the pickup
  // has to wait for an e-way bill.
  const holdForEwayBills = async (shipment: { id: string; courier_id: number | null; courier_name: string | null }) => {
    let held = false;
    for (const partId of vendorOrderIds) {
      const partItems = items.filter((i) => (orderItems ?? []).find((oi) => oi.id === i.order_item_id)?.vendor_order_id === partId);
      const estimate = round2(partItems.reduce((s, i) => s + Number(i.price ?? 0) * Number(i.quantity ?? 1), 0));
      let returnInvoice: any = null;
      let invoiceProblem: unknown = null;
      try {
        const { invoice } = await ensureInvoice(supabase, partId);
        returnInvoice = (
          await issueReturnInvoice(supabase, {
            invoiceId: invoice.id,
            reason: returnRequest.request_type === "exchange" ? "exchange_return" : "customer_return",
            returnRequestId,
            items: partItems.map((i) => ({ orderItemId: String(i.order_item_id), quantity: Number(i.quantity ?? 1) })),
          })
        ).returnInvoice;
      } catch (e) {
        // Below the e-way bill limit a missing return invoice mustn't stop the
        // customer's return; above it the e-way bill can't be made without it.
        invoiceProblem = e;
        console.error("bookReversePickup: return invoice not issued", errorMessage(e));
      }
      const check = await ewayBillForBooking(supabase, {
        vendorOrderId: partId,
        leg: toWarehouse ? "customer_to_warehouse" : "customer_to_boutique",
        movement: `return:${returnRequestId}`,
        courierId: shipment.courier_id,
        courierName: shipment.courier_name,
        from: { name: order.customer_name, address: customerAddress },
        to: { name: destination.name, address: destination.address },
        value: returnInvoice ? Number(returnInvoice.total) : estimate,
        document: async () => {
          if (!returnInvoice) throw invoiceProblem ?? new InvoiceError("The return invoice couldn't be issued");
          return returnInvoiceDocument(returnInvoice);
        },
        shipmentId: shipment.id,
        returnRequestId,
        requireCourier: false,
        requestedBy,
      });
      if (check.required && !check.ready) held = true;
    }
    return held;
  };

  if (existingShipment) {
    // A pickup held for e-way bills: check again (the number may be in now).
    if (existingShipment.status === "awb_assigned") {
      const held = await holdForEwayBills(existingShipment);
      if (!held) await releaseHeldReturnPickup(supabase, existingShipment.id).catch((e) =>
        console.error("bookReversePickup: pickup request failed", errorMessage(e)),
      );
      return { shipment: existingShipment, alreadyScheduled: true, ewayBillPending: held };
    }
    return { shipment: existingShipment, alreadyScheduled: true, ewayBillPending: false };
  }

  const skuByOrderItemId = new Map((orderItems ?? []).map((i) => [i.id, i.sku]));
  const subTotal = items.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);
  const weightKg = Math.max(items.reduce((sum, i) => sum + DEFAULT_ITEM_WEIGHT_GRAMS * i.quantity, 0) / 1000, 0.1);

  const createResult = await shiprocketRequest(supabase, "/orders/create/return", {
    method: "POST",
    body: {
      order_id: returnRequest.id,
      order_date: formatShiprocketDate(returnRequest.created_at),
      // Reverse pickup: Shiprocket collects FROM the customer, delivers
      // TO the warehouse/boutique - the opposite of a forward shipment.
      pickup_customer_name: order.customer_name,
      pickup_address: customerAddress.address_line1,
      pickup_address_2: customerAddress.address_line2 || "",
      pickup_city: customerAddress.city,
      pickup_state: customerAddress.state,
      pickup_country: customerAddress.country || "India",
      pickup_pincode: customerAddress.pincode,
      pickup_email: order.customer_email,
      pickup_phone: order.customer_phone,
      shipping_customer_name: destination.name,
      shipping_address: destination.address.address_line1,
      shipping_address_2: destination.address.address_line2 || "",
      shipping_city: destination.address.city,
      shipping_state: destination.address.state,
      shipping_country: destination.address.country || "India",
      shipping_pincode: destination.address.pincode,
      shipping_email: destination.email,
      shipping_phone: destination.phone,
      order_items: items.map((i) => ({
        name: i.product_title,
        sku: skuByOrderItemId.get(i.order_item_id) || i.order_item_id,
        units: i.quantity,
        selling_price: i.price ?? 0,
        discount: 0,
        hsn: "",
      })),
      payment_method: "PREPAID",
      sub_total: returnRequest.refund_amount || subTotal,
      length: PARCEL_DEFAULTS.lengthCm,
      breadth: PARCEL_DEFAULTS.breadthCm,
      height: PARCEL_DEFAULTS.heightCm,
      weight: weightKg,
    },
  });

  const { data: shipment, error: insertErr } = await supabase
    .from("shipments")
    .insert({
      vendor_order_id: vendorOrderId,
      order_id: order.id,
      warehouse_id: warehouseId,
      return_request_id: returnRequestId,
      shipment_type: toWarehouse ? "return_to_warehouse" : "return",
      shiprocket_order_id: toIntOrNull(createResult.order_id),
      shiprocket_shipment_id: toIntOrNull(createResult.shipment_id),
      status: "pending",
      status_raw: createResult.status ?? null,
    })
    .select()
    .single();
  if (insertErr) throw insertErr;

  // Best-effort from here - the return order genuinely exists in
  // Shiprocket even if AWB assignment or pickup scheduling fails; the
  // admin can retry those from the shipment's tracking state rather
  // than the whole booking failing atomically.
  let courier: { id: string; courier_id: number | null; courier_name: string | null } = {
    id: shipment.id,
    courier_id: null,
    courier_name: null,
  };
  try {
    const awbResult = await shiprocketRequest(supabase, "/courier/assign/awb", {
      method: "POST",
      body: { shipment_id: createResult.shipment_id },
    });
    const awbData = awbResult?.response?.data;
    if (awbData?.awb_code) {
      const courierId = toIntOrNull(awbData.courier_company_id);
      const courierCost = await bookedCourierCost(supabase, {
        pickupPincode: customerAddress.pincode,
        deliveryPincode: destination.address.pincode,
        cod: false,
        weightKg,
        courierId,
      });
      await supabase
        .from("shipments")
        .update({
          awb_code: awbData.awb_code,
          courier_id: courierId,
          courier_name: awbData.courier_name ?? null,
          status: "awb_assigned",
          courier_cost: courierCost,
        })
        .eq("id", shipment.id);
      courier = { id: shipment.id, courier_id: courierId, courier_name: awbData.courier_name ?? null };
    }
  } catch (followUpErr) {
    console.error("bookReversePickup: AWB follow-up failed", followUpErr);
  }

  // The e-way bill is made out to the courier Shiprocket just assigned.
  const held = await holdForEwayBills(courier);
  if (!held) {
    try {
      await releaseHeldReturnPickup(supabase, shipment.id);
    } catch (pickupErr) {
      console.error("bookReversePickup: pickup request failed", pickupErr);
    }
  }

  return { shipment, alreadyScheduled: false, ewayBillPending: held };
}
