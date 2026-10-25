import { useCallback, useEffect, useState } from "react";
import { CustomisationDetails } from "@/components/CustomisationDetails";
import type { CustomisationChoice } from "@/lib/customisation";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, Package, ShoppingBag, RotateCcw, ArrowLeftRight, Ban, RefreshCw, Heart, User, Truck } from "lucide-react";
import { ReturnRequestForm } from "@/components/ReturnRequestForm";
import { useReturnRequests, ReturnRequest, returnItemPhotos } from "@/hooks/useReturnRequests";
import { RefundHistory } from "@/components/RefundHistory";
import { OrderCancellationDialog, CancellableOrderItem } from "@/components/OrderCancellationDialog";
import { ReorderDialog } from "@/components/ReorderDialog";
import { InvoiceDownloadButton } from "@/components/InvoiceDownloadButton";
import { OrderStatusTimeline } from "@/components/OrderStatusTimeline";
import { buildOrderTimeline, buildWarehouseOrderTimeline, ShipmentTimestamps } from "@/lib/orderStatus";
import { resolveOrderItemImages } from "@/lib/orderItemImage";
import { useFocusTarget } from "@/hooks/useDeepLink";
import { formatShortDate, istToday } from "@/lib/warehouse";
import { AccountAction, AccountHero, SignInCard, StatusPill } from "@/components/storefront/account/AccountKit";
import { FreeDeliveryBadge } from "@/components/storefront/FreeDeliveryBadge";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/format";

// Matches cancel-order-items' own BLOCKED_VENDOR_ORDER_STATUSES - kept here
// purely to decide whether to show the Cancel action at all; the edge
// function is still the real authority and re-checks this itself.
const NOT_CANCELLABLE_STATUSES = ["delivered", "cancelled", "returned"];

interface OrderItem {
  id: string;
  product_id: string;
  variant_id: string;
  product_title: string;
  variant_title: string | null;
  quantity: number;
  price: number;
  size: string | null;
  color: string | null;
  vendor_id: string | null;
  vendor_order_id: string | null;
  is_returnable: boolean;
  image: string | null;
  // Customised for the customer: no return or exchange.
  customisation?: CustomisationChoice | null;
}

// Every field here is an internal fulfillment/grouping detail - never
// rendered as "which vendor," only used to derive a status timeline and to
// know which items ship together.
interface VendorOrderInfo {
  id: string;
  status: string;
  updated_at: string;
  tracking_number: string | null;
  carrier: string | null;
  shipment: (ShipmentTimestamps & { awb_code: string | null; courier_name: string | null }) | null;
  // Warehouse route: when this part reached the warehouse, and the
  // warehouse's parcel to the customer that carries it.
  arrived_at_warehouse_at: string | null;
  parcel: (ShipmentTimestamps & { awb_code: string | null; courier_name: string | null }) | null;
  // Last day this part can be returned/exchanged (its boutique's window
  // from the day it was delivered). Set on delivery.
  return_window_ends_on: string | null;
  delivered_at?: string | null;
}

interface Order {
  id: string;
  created_at: string;
  order_status: string;
  payment_status: string;
  payment_method: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  discount_code: string | null;
  discount_amount: number;
  // Cash on Delivery charge paid by the customer (Extra list M).
  cod_charge?: number;
  customer_name: string;
  fulfilment_route: string;
  estimated_delivery_date: string | null;
  shipping_address: {
    address_line1: string;
    address_line2?: string;
    city: string;
    state: string;
    pincode: string;
  };
  order_items: OrderItem[];
  vendor_orders: VendorOrderInfo[];
}

const returnStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending Review", className: "bg-yellow-100 text-yellow-800" },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-800" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
  picked_up: { label: "Items Picked Up", className: "bg-indigo-100 text-indigo-800" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800" },
  pickup_failed: { label: "Pickup Issue - We're On It", className: "bg-amber-100 text-amber-800" },
  pickup_scheduled: { label: "Pickup Scheduled", className: "bg-blue-100 text-blue-800" },
  at_warehouse: { label: "Received - Being Inspected", className: "bg-indigo-100 text-indigo-800" },
  qc_passed: { label: "Passed Inspection", className: "bg-green-100 text-green-800" },
  qc_failed: { label: "Didn't Pass Inspection - Sending Back", className: "bg-red-100 text-red-800" },
  replacement_shipped: { label: "Replacement Shipped", className: "bg-indigo-100 text-indigo-800" },
  returned_to_customer: { label: "Items Sent Back to You", className: "bg-gray-100 text-gray-800" },
};

const paymentStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-800",
};

// Once an order is cancelled, "Payment: Pending" reads as if we're still
// waiting on the customer to pay a COD order that's never going to be
// fulfilled - and "Payment: Paid" reads as if nothing happened, even
// while a real refund is (or should be) in progress. Neither is wrong
// data, just a confusing label for a cancelled order specifically.
function paymentStatusDisplay(order: {
  payment_status: string;
  payment_method: string;
  order_status: string;
}): { label: string; className: string } {
  if (order.order_status === "cancelled" && order.payment_status !== "refunded") {
    if (order.payment_method === "cod") {
      return { label: "Payment: Not Required", className: "bg-gray-100 text-gray-800" };
    }
    if (order.payment_status === "paid") {
      return { label: "Payment: Refund Processing", className: "bg-amber-100 text-amber-800" };
    }
  }
  return {
    label: `Payment: ${order.payment_status.charAt(0).toUpperCase() + order.payment_status.slice(1)}`,
    className: paymentStatusColors[order.payment_status] || "bg-muted",
  };
}

// Used only for the single-shipment summary badge in the collapsed card
// header - the expanded timeline is the detailed view, this is just a
// glance without expanding.
const shipmentStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  processing: "bg-purple-100 text-purple-800",
  shipped: "bg-indigo-100 text-indigo-800",
  out_for_delivery: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  returned: "bg-gray-100 text-gray-800",
  ndr: "bg-orange-100 text-orange-800",
};

// Each boutique's part can be returned or exchanged from the day it is
// delivered until its return window ends - the server enforces the same rule.
function returnWindowFor(order: Order): { items: OrderItem[]; note: string | null; closedOn: string | null } {
  const today = istToday();
  const delivered = order.vendor_orders.filter((vo) => vo.status === "delivered");
  const open = delivered.filter((vo) => !vo.return_window_ends_on || vo.return_window_ends_on >= today);
  const openIds = new Set(open.map((vo) => vo.id));
  // A customised piece can come back (damaged / wrong item) for 24 hours
  // after its part was delivered.
  const customisedOpen = new Set(
    delivered
      .filter((vo) => Date.now() - new Date(vo.delivered_at ?? 0).getTime() < 24 * 3600_000)
      .map((vo) => vo.id),
  );
  const items = order.order_items.filter(
    (i) => i.vendor_order_id && (i.customisation ? customisedOpen.has(i.vendor_order_id) : openIds.has(i.vendor_order_id)),
  );
  const deadlines = [...new Set(open.map((vo) => vo.return_window_ends_on).filter((d): d is string => !!d))].sort();
  const note =
    deadlines.length === 0
      ? null
      : deadlines.length === 1
        ? `Available until ${formatShortDate(deadlines[0])}`
        : `Available until ${formatShortDate(deadlines[0])} for some items, ${formatShortDate(deadlines[deadlines.length - 1])} for others`;
  // (A customised piece never had a return window to close.)
  const closedOn =
    items.length === 0 && order.order_items.some((i) => !i.customisation)
      ? delivered.map((vo) => vo.return_window_ends_on).filter((d): d is string => !!d).sort().pop() ?? null
      : null;
  return { items, note, closedOn };
}

export default function OrderHistory() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);
  const [returnOrderItems, setReturnOrderItems] = useState<OrderItem[]>([]);
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [reorderingOrder, setReorderingOrder] = useState<Order | null>(null);
  // Which orders have their items/tracking section open, by order id.
  const [openOrders, setOpenOrders] = useState<Record<string, string>>({});
  const { returnRequests, cancelReturnRequest } = useReturnRequests();

  const returnsByOrder = returnRequests.reduce<Record<string, ReturnRequest[]>>((acc, rr) => {
    if (!acc[rr.order_id]) acc[rr.order_id] = [];
    acc[rr.order_id].push(rr);
    return acc;
  }, {});

  const checkAuthAndFetchOrders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    setIsAuthenticated(true);

    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", session.user.id)
        // An online checkout that was never paid isn't an order.
        .or("payment_method.eq.cod,payment_status.in.(paid,refunded)")
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;

      // Fetch order items and each shipment's own fulfillment status for
      // each order - a multi-item order can have more than one shipment
      // (each with its own status/dates) even though vendor identity is
      // never surfaced to the customer.
      const ordersWithItems = await Promise.all(
        (ordersData || []).map(async (order) => {
          const [{ data: itemsData }, { data: vendorOrdersData }, { data: parcelData }] = await Promise.all([
            supabase.from("order_items").select("*").eq("order_id", order.id),
            supabase
              .from("vendor_orders")
              .select(
                "id, status, updated_at, tracking_number, carrier, arrived_at_warehouse_at, dispatch_id, return_window_ends_on, delivered_at, shipments(awb_code, courier_name, shipment_type, created_at, pickup_scheduled_at, picked_up_at, delivered_at, estimated_delivery_date)"
              )
              .eq("order_id", order.id),
            // The warehouse's own parcels to the customer (warehouse route).
            order.fulfilment_route === "warehouse"
              ? supabase
                  .from("shipments")
                  .select("dispatch_id, awb_code, courier_name, created_at, pickup_scheduled_at, picked_up_at, delivered_at, estimated_delivery_date")
                  .eq("order_id", order.id)
                  .eq("shipment_type", "warehouse_to_customer")
                  .neq("status", "cancelled")
                  .order("created_at", { ascending: true })
              : Promise.resolve({ data: [] as any[] }),
          ]);
          const parcelByDispatch = new Map((parcelData || []).map((p: any) => [p.dispatch_id, p]));

          const imageByItemId = await resolveOrderItemImages(
            (itemsData || []).map((i) => ({ id: i.id, product_id: i.product_id, variant_id: i.variant_id })),
          );

          return {
            ...order,
            shipping_address: order.shipping_address as Order["shipping_address"],
            order_items: (itemsData || []).map((item) => ({
              ...item,
              image: imageByItemId.get(item.id) ?? null,
            })),
            vendor_orders: (vendorOrdersData || []).map((vo: any) => {
              const forwardShipment = (vo.shipments || []).find((s: any) => s.shipment_type === "forward");
              const parcel = vo.dispatch_id ? parcelByDispatch.get(vo.dispatch_id) ?? null : null;
              return {
                id: vo.id,
                status: vo.status,
                updated_at: vo.updated_at,
                tracking_number: vo.tracking_number,
                carrier: vo.carrier,
                arrived_at_warehouse_at: vo.arrived_at_warehouse_at,
                parcel,
                return_window_ends_on: vo.return_window_ends_on,
                delivered_at: vo.delivered_at,
                shipment: forwardShipment
                  ? {
                      awb_code: forwardShipment.awb_code,
                      courier_name: forwardShipment.courier_name,
                      created_at: forwardShipment.created_at,
                      pickup_scheduled_at: forwardShipment.pickup_scheduled_at,
                      picked_up_at: forwardShipment.picked_up_at,
                      delivered_at: forwardShipment.delivered_at,
                      estimated_delivery_date: forwardShipment.estimated_delivery_date,
                    }
                  : null,
              };
            }),
          };
        })
      );

      // A vendor-wide "returns off" switch sits on top of the existing
      // per-product is_returnable flag - an item is only actually
      // returnable if both are true. One batched lookup across every
      // vendor represented in these orders, not a query per item.
      const vendorIds = [
        ...new Set(
          ordersWithItems.flatMap((o) => o.order_items.map((i: any) => i.vendor_id).filter((v: any): v is string => !!v))
        ),
      ];
      const returnsEnabledByVendor = new Map<string, boolean>();
      if (vendorIds.length > 0) {
        const { data: vendorRows } = await supabase.from("vendors").select("id, returns_enabled").in("id", vendorIds);
        (vendorRows || []).forEach((v) => returnsEnabledByVendor.set(v.id, v.returns_enabled));
      }
      const ordersWithReturnEligibility = ordersWithItems.map((o) => ({
        ...o,
        order_items: o.order_items.map((item: any) => ({
          ...item,
          is_returnable: item.is_returnable && (item.vendor_id ? returnsEnabledByVendor.get(item.vendor_id) !== false : true),
        })),
      }));

      setOrders(ordersWithReturnEligibility);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthAndFetchOrders();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setIsAuthenticated(false);
        setOrders([]);
      } else if (session) {
        checkAuthAndFetchOrders();
      }
    });

    return () => subscription.unsubscribe();
  }, [checkAuthAndFetchOrders]);

  // A notification about an order opens it with its tracking expanded.
  useFocusTarget({
    items: orders,
    ready: !loading,
    getId: (o) => o.id,
    matches: (o, id) => o.id === id || o.vendor_orders.some((vo) => vo.id === id),
    onFocus: (o) => setOpenOrders((prev) => ({ ...prev, [o.id]: "items" })),
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex justify-center items-center py-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <SignInCard
          icon={Package}
          title="Sign in to view your orders"
          text="Please sign in to access your order history and track your purchases."
        />
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        <AccountHero
          crumb="My orders"
          eyebrow="Order history"
          title="Your"
          accent="orders"
          subtitle="Track and manage your orders"
          actions={
            <>
              <AccountAction to="/account" icon={User}>
                My account
              </AccountAction>
              <AccountAction to="/wishlist" icon={Heart}>
                Wishlist
              </AccountAction>
            </>
          }
        />

        <div className="store-container pb-24 pt-10 md:pt-14">
          {orders.length === 0 ? (
            <div className="mx-auto max-w-lg border border-dashed border-foreground/15 px-6 py-16 text-center">
              <ShoppingBag className="mx-auto mb-4 h-8 w-8 text-gold" strokeWidth={1.5} />
              <h2 className="font-serif text-3xl">No orders yet</h2>
              <p className="mt-2 text-muted-foreground">
                Start shopping to see your orders here!
              </p>
              <Link
                to="/category/all"
                className="mt-8 inline-flex h-12 items-center bg-primary px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground hover:bg-maroon-deep"
              >
                Start shopping
              </Link>
            </div>
          ) : (
            <div className="mx-auto max-w-5xl space-y-5">
              {orders.map((order) => {
                const vendorOrderById = new Map(order.vendor_orders.map((vo) => [vo.id, vo]));
                const itemsByVendorOrder = new Map<string, OrderItem[]>();
                for (const item of order.order_items) {
                  const key = item.vendor_order_id ?? "";
                  itemsByVendorOrder.set(key, [...(itemsByVendorOrder.get(key) ?? []), item]);
                }
                const shipmentGroups = [...itemsByVendorOrder.entries()]
                  .map(([vendorOrderId, groupItems]) => ({
                    vendorOrderId,
                    items: groupItems,
                    vendorOrder: vendorOrderById.get(vendorOrderId) ?? null,
                  }))
                  .filter((g) => g.vendorOrder);
                // Warehouse route: the customer gets AllBoutiqs' own parcel(s),
                // so one timeline for the whole order instead of one per part.
                const viaWarehouse = order.fulfilment_route === "warehouse";
                const warehouseTimeline = viaWarehouse
                  ? buildWarehouseOrderTimeline({
                      orderPlacedAt: order.created_at,
                      orderEstimatedDeliveryDate: order.estimated_delivery_date,
                      parts: order.vendor_orders.map((vo) => ({
                        status: vo.status,
                        updated_at: vo.updated_at,
                        arrived_at_warehouse_at: vo.arrived_at_warehouse_at,
                        parcel: vo.parcel,
                      })),
                    })
                  : null;
                const warehouseParcels = viaWarehouse
                  ? [...new Map(order.vendor_orders.filter((vo) => vo.parcel?.awb_code).map((vo) => [vo.parcel!.awb_code, vo.parcel!])).values()]
                  : [];
                const headerStatusLabel = warehouseTimeline
                  ? warehouseTimeline.kind === "progress"
                    ? warehouseTimeline.stages.find((s) => s.state === "current")?.label ?? "Delivered"
                    : warehouseTimeline.kind === "cancelled"
                      ? "Cancelled"
                      : "Delivery unsuccessful"
                  : null;
                const showGroupLabels = !viaWarehouse && shipmentGroups.length > 1;

                const hasCancellableItems = order.vendor_orders.some(
                  // Warehouse route: a part already in the warehouse's booked
                  // parcel can only come back as a return.
                  (vo) => !NOT_CANCELLABLE_STATUSES.includes(vo.status) && !vo.parcel,
                );
                const isPaidOnline = order.payment_method === "razorpay" && order.payment_status === "paid";
                const paymentDisplay = paymentStatusDisplay(order);
                const returnWindow = returnWindowFor(order);
                // A glance at what's inside, before the order is opened.
                const previews = order.order_items.slice(0, 4);

                return (
                <article key={order.id} data-focus-id={order.id} className="border border-border">
                  <header className="flex flex-col gap-4 border-b border-border bg-ivory px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:flex sm:gap-10">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Order</p>
                        <p className="font-mono text-sm">#{order.id.slice(0, 8).toUpperCase()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Placed on</p>
                        <p className="text-sm">{formatDateTime(new Date(order.created_at))}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Total</p>
                        <p className="text-sm font-medium">{formatMoney(order.total)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {headerStatusLabel && (
                        <StatusPill className={warehouseTimeline?.kind === "progress" ? "bg-indigo-100 text-indigo-800" : "bg-muted"}>
                          {headerStatusLabel}
                        </StatusPill>
                      )}
                      {!viaWarehouse && shipmentGroups.length === 1 && shipmentGroups[0].vendorOrder && (
                        <StatusPill className={shipmentStatusColors[shipmentGroups[0].vendorOrder.status]}>
                          {shipmentGroups[0].vendorOrder.status.charAt(0).toUpperCase() +
                            shipmentGroups[0].vendorOrder.status.slice(1).replace(/_/g, " ")}
                        </StatusPill>
                      )}
                      <StatusPill className={paymentDisplay.className}>{paymentDisplay.label}</StatusPill>
                      {hasCancellableItems && (
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1.5 border border-destructive/30 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-destructive hover:bg-destructive/5"
                          onClick={() => setCancellingOrder(order)}
                        >
                          <Ban className="h-3 w-3" />
                          Cancel order
                        </button>
                      )}
                      {!hasCancellableItems && order.vendor_orders.length > 0 && (
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1.5 border border-foreground/20 px-3 text-[10px] font-medium uppercase tracking-[0.14em] hover:border-foreground"
                          onClick={() => setReorderingOrder(order)}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Reorder
                        </button>
                      )}
                    </div>
                  </header>

                  <Accordion
                    type="single"
                    collapsible
                    className="w-full px-5 md:px-6"
                    value={openOrders[order.id] ?? ""}
                    onValueChange={(v) => setOpenOrders((prev) => ({ ...prev, [order.id]: v }))}
                  >
                    <AccordionItem value="items" className="border-b-0">
                      <AccordionTrigger className="gap-4 py-4 hover:no-underline">
                        <span className="flex min-w-0 items-center gap-4">
                          <span className="flex shrink-0 -space-x-3">
                            {previews.map((item) =>
                              item.image ? (
                                <img key={item.id} src={item.image} alt="" className="h-14 w-11 border-2 border-background object-cover" />
                              ) : (
                                <span key={item.id} className="h-14 w-11 border-2 border-background bg-ivory" />
                              ),
                            )}
                          </span>
                          <span className="text-left text-sm">
                            {order.order_items.length} item{order.order_items.length > 1 ? "s" : ""}
                            <span className="block text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Details & tracking</span>
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-6 pt-2">
                          {shipmentGroups.map((group, i) => (
                            <div key={group.vendorOrderId || i} className={showGroupLabels ? "space-y-4 border border-border p-4" : "space-y-4"}>
                              {showGroupLabels && (
                                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                  Part {i + 1} of {shipmentGroups.length}
                                </p>
                              )}
                              {group.items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-start gap-4 border-b border-border pb-4 last:border-0"
                                >
                                  {item.image ? (
                                    <img src={item.image} alt="" className="h-24 w-[72px] shrink-0 object-cover" />
                                  ) : (
                                    <div className="h-24 w-[72px] shrink-0 bg-ivory" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <Link to={`/product/${item.product_id}`} className="hover:text-primary">
                                      {item.product_title}
                                    </Link>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {[
                                        // "M / White" repeats the size and colour below.
                                        !item.size && !item.color && item.variant_title,
                                        item.size && `Size ${item.size}`,
                                        item.color,
                                        `Qty ${item.quantity}`,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </p>
                                    {item.customisation ? (
                                      <span className="mt-2 inline-block border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                        Customised · no return
                                      </span>
                                    ) : !item.is_returnable && (
                                      <span className="mt-2 inline-block border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                        Non-refundable
                                      </span>
                                    )}
                                    {item.customisation && <CustomisationDetails customisation={item.customisation} className="mt-2" />}
                                  </div>
                                  <p className="shrink-0 font-medium">{formatMoney((item.price * item.quantity))}</p>
                                </div>
                              ))}
                              {group.vendorOrder && viaWarehouse && (
                                <InvoiceDownloadButton
                                  vendorOrderId={group.vendorOrderId}
                                  paymentStatus={order.payment_status}
                                  vendorOrderStatus={group.vendorOrder.status}
                                />
                              )}
                              {group.vendorOrder && !viaWarehouse && (
                                <div className="space-y-3 bg-ivory p-4">
                                  <OrderStatusTimeline
                                    timeline={buildOrderTimeline({
                                      vendorOrderStatus: group.vendorOrder.status,
                                      vendorOrderUpdatedAt: group.vendorOrder.updated_at,
                                      orderPlacedAt: order.created_at,
                                      shipment: group.vendorOrder.shipment,
                                    })}
                                  />
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    {group.vendorOrder.shipment?.awb_code ? (
                                      <a
                                        href={`https://shiprocket.co/tracking/${group.vendorOrder.shipment.awb_code}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-primary hover:underline"
                                      >
                                        <Truck className="h-3.5 w-3.5" />
                                        {group.vendorOrder.shipment.courier_name
                                          ? `${group.vendorOrder.shipment.courier_name} • `
                                          : ""}
                                        Track shipment
                                      </a>
                                    ) : (
                                      group.vendorOrder.tracking_number && (
                                        <span className="text-xs text-muted-foreground">
                                          {group.vendorOrder.carrier ? `${group.vendorOrder.carrier} • ` : ""}
                                          {group.vendorOrder.tracking_number}
                                        </span>
                                      )
                                    )}
                                    <InvoiceDownloadButton
                                      vendorOrderId={group.vendorOrderId}
                                      paymentStatus={order.payment_status}
                                      vendorOrderStatus={group.vendorOrder?.status}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}

                          {warehouseTimeline && (
                            <div className="space-y-3 bg-ivory p-4">
                              <OrderStatusTimeline timeline={warehouseTimeline} />
                              {warehouseParcels.map((parcel) => (
                                <a
                                  key={parcel.awb_code}
                                  href={`https://shiprocket.co/tracking/${parcel.awb_code}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-primary hover:underline"
                                >
                                  <Truck className="h-3.5 w-3.5" />
                                  {parcel.courier_name ? `${parcel.courier_name} • ` : ""}
                                  Track {warehouseParcels.length > 1 ? "parcel" : "shipment"}
                                </a>
                              ))}
                            </div>
                          )}

                          <div className="grid gap-6 border-t border-border pt-5 md:grid-cols-2 md:gap-10">
                            <div>
                              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em]">Shipping address</p>
                              <p className="text-sm leading-relaxed text-muted-foreground">
                                {order.customer_name}<br />
                                {order.shipping_address.address_line1}
                                {order.shipping_address.address_line2 && <>, {order.shipping_address.address_line2}</>}<br />
                                {order.shipping_address.city}, {order.shipping_address.state} - {order.shipping_address.pincode}
                              </p>
                            </div>
                            <dl className="space-y-1.5 text-sm">
                              <div className="flex justify-between">
                                <dt className="text-muted-foreground">Subtotal</dt>
                                <dd>{formatMoney(order.subtotal)}</dd>
                              </div>
                              <div className="flex justify-between">
                                <dt className="text-muted-foreground">Shipping</dt>
                                <dd>{order.shipping_cost > 0 ? `${formatMoney(order.shipping_cost)}` : <FreeDeliveryBadge />}</dd>
                              </div>
                              {order.discount_amount > 0 && (
                                <div className="flex justify-between text-primary">
                                  <dt>
                                    Discount{order.discount_code && ` (${order.discount_code})`}
                                  </dt>
                                  <dd>-{formatMoney(order.discount_amount)}</dd>
                                </div>
                              )}
                              {Number(order.cod_charge) > 0 && (
                                <div className="flex justify-between">
                                  <dt className="text-muted-foreground">Cash on Delivery charge</dt>
                                  <dd>{formatMoney(order.cod_charge)}</dd>
                                </div>
                              )}
                              <div className="flex justify-between border-t border-border pt-2 font-medium">
                                <dt>Total</dt>
                                <dd>{formatMoney(order.total)}</dd>
                              </div>
                            </dl>
                          </div>

                          {/* Return/Exchange Requests for this order */}
                          {returnsByOrder[order.id] && returnsByOrder[order.id].length > 0 && (
                            <div className="space-y-2 border-t border-border pt-5">
                              <p className="text-[11px] font-medium uppercase tracking-[0.18em]">Return / exchange requests</p>
                              {returnsByOrder[order.id].map((rr) => {
                                const statusInfo = returnStatusConfig[rr.status] || returnStatusConfig.pending;
                                return (
                                  <div key={rr.id} className="space-y-2 bg-ivory p-4 text-sm">
                                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                                      <div className="flex items-center gap-2">
                                        {rr.request_type === "return" ? (
                                          <RotateCcw className="h-4 w-4 text-muted-foreground" />
                                        ) : (
                                          <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                                        )}
                                        <span className="font-medium">
                                          {rr.request_type === "return" ? "Return" : "Exchange"} #{rr.id.slice(0, 8).toUpperCase()}
                                        </span>
                                        <span className="text-muted-foreground">
                                          {formatDate(new Date(rr.created_at))}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {!!rr.refund_amount && rr.status === "completed" && rr.request_type === "return" && (
                                          <span className="text-xs font-medium text-emerald-700">Refund: {formatMoney(rr.refund_amount)}</span>
                                        )}
                                        <StatusPill className={statusInfo.className}>{statusInfo.label}</StatusPill>
                                        {rr.status === "pending" && (
                                          <button
                                            type="button"
                                            className="px-1.5 text-[10px] uppercase tracking-[0.12em] text-destructive hover:underline"
                                            onClick={() => cancelReturnRequest(rr.id)}
                                          >
                                            Cancel
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <div className="space-y-1.5 border-t border-border/60 pt-2">
                                      {(rr.items || []).map((item, idx) => {
                                        const exchangeTo =
                                          item.exchange_to ??
                                          (rr.exchange_details
                                            ? { size: rr.exchange_details.new_size ?? null, color: rr.exchange_details.new_color ?? null }
                                            : null);
                                        return (
                                          <div key={idx} className="flex items-center gap-2 text-xs">
                                            {returnItemPhotos(item)[0] ? (
                                              <img
                                                src={returnItemPhotos(item)[0]}
                                                alt=""
                                                className="h-8 w-8 shrink-0 border border-border object-cover"
                                              />
                                            ) : (
                                              <div className="h-8 w-8 shrink-0 bg-background" />
                                            )}
                                            <span className="font-medium">{item.product_title}</span>
                                            {returnItemPhotos(item).length > 1 && (
                                              <span className="text-muted-foreground">+{returnItemPhotos(item).length - 1} photos</span>
                                            )}
                                            {rr.request_type === "exchange" && exchangeTo && (exchangeTo.size || exchangeTo.color) && (
                                              <span className="text-muted-foreground">
                                                → Exchange for: {[exchangeTo.size, exchangeTo.color].filter(Boolean).join(" / ")}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                      {rr.evidence_video_url && (
                                        <p className="text-xs text-muted-foreground">Video attached</p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* orders.payment_status has no "partially_refunded" value in its
                              check constraint - only "refunded" (whole payment). A partial
                              refund on an otherwise "paid" order would still show here via
                              RefundHistory querying refunds directly, but there's no order-level
                              flag to gate on for that case without an extra query per order. */}
                          {order.payment_status === "refunded" && (
                            <div className="space-y-2 border-t border-border pt-5">
                              <p className="text-[11px] font-medium uppercase tracking-[0.18em]">Refunds</p>
                              <RefundHistory orderId={order.id} />
                            </div>
                          )}

                          {returnWindow.items.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-5">
                              <button
                                type="button"
                                className="inline-flex h-11 items-center gap-2 border border-foreground px-5 text-[11px] font-medium uppercase tracking-[0.2em] transition-colors hover:bg-foreground hover:text-background"
                                onClick={() => {
                                  setReturnOrderId(order.id);
                                  setReturnOrderItems(returnWindow.items);
                                }}
                              >
                                {returnWindow.items.some((i) => i.is_returnable) ? (
                                  <>
                                    <RotateCcw className="h-4 w-4" />
                                    Return / Exchange
                                  </>
                                ) : (
                                  <>
                                    <ArrowLeftRight className="h-4 w-4" />
                                    Exchange
                                  </>
                                )}
                              </button>
                              {returnWindow.note && <p className="text-xs text-muted-foreground">{returnWindow.note}</p>}
                            </div>
                          ) : (
                            returnWindow.closedOn && (
                              <p className="border-t border-border pt-5 text-xs text-muted-foreground">
                                Return / exchange window closed on {formatShortDate(returnWindow.closedOn)}
                              </p>
                            )
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </article>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {returnOrderId && (
        <ReturnRequestForm
          orderId={returnOrderId}
          orderItems={returnOrderItems}
          open={!!returnOrderId}
          onOpenChange={(open) => {
            if (!open) {
              setReturnOrderId(null);
              setReturnOrderItems([]);
            }
          }}
        />
      )}

      {cancellingOrder && (
        <OrderCancellationDialog
          items={cancellingOrder.order_items
            .filter((item) => item.vendor_order_id)
            .map((item): CancellableOrderItem => {
              const vo = cancellingOrder.vendor_orders.find((v) => v.id === item.vendor_order_id);
              return {
                id: item.id,
                vendorOrderId: item.vendor_order_id as string,
                vendorOrderStatus: vo?.parcel ? "dispatched" : vo?.status ?? "pending",
                productTitle: item.product_title,
                variantTitle: item.variant_title,
                size: item.size,
                color: item.color,
                quantity: item.quantity,
                price: item.price,
                image: item.image,
              };
            })}
          isPaidOnline={cancellingOrder.payment_method === "razorpay" && cancellingOrder.payment_status === "paid"}
          open={!!cancellingOrder}
          onOpenChange={(open) => {
            if (!open) setCancellingOrder(null);
          }}
          onSuccess={checkAuthAndFetchOrders}
        />
      )}

      {reorderingOrder && (
        <ReorderDialog
          items={reorderingOrder.order_items}
          open={!!reorderingOrder}
          onOpenChange={(open) => {
            if (!open) setReorderingOrder(null);
          }}
        />
      )}

      <Footer />
    </div>
  );
}
