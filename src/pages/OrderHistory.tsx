import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, Package, ShoppingBag, ArrowLeft, RotateCcw, ArrowLeftRight, Ban, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ReturnRequestForm } from "@/components/ReturnRequestForm";
import { useReturnRequests, ReturnRequest } from "@/hooks/useReturnRequests";
import { RefundHistory } from "@/components/RefundHistory";
import { OrderCancellationDialog, CancellableOrderItem } from "@/components/OrderCancellationDialog";
import { ReorderDialog } from "@/components/ReorderDialog";
import { InvoiceDownloadButton } from "@/components/InvoiceDownloadButton";
import { OrderStatusTimeline } from "@/components/OrderStatusTimeline";
import { buildOrderTimeline, ShipmentTimestamps } from "@/lib/orderStatus";
import { resolveOrderItemImages } from "@/lib/orderItemImage";

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
  customer_name: string;
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

export default function OrderHistory() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);
  const [returnOrderItems, setReturnOrderItems] = useState<OrderItem[]>([]);
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [reorderingOrder, setReorderingOrder] = useState<Order | null>(null);
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
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;

      // Fetch order items and each shipment's own fulfillment status for
      // each order - a multi-item order can have more than one shipment
      // (each with its own status/dates) even though vendor identity is
      // never surfaced to the customer.
      const ordersWithItems = await Promise.all(
        (ordersData || []).map(async (order) => {
          const [{ data: itemsData }, { data: vendorOrdersData }] = await Promise.all([
            supabase.from("order_items").select("*").eq("order_id", order.id),
            supabase
              .from("vendor_orders")
              .select(
                "id, status, updated_at, tracking_number, carrier, shipments(awb_code, courier_name, shipment_type, created_at, pickup_scheduled_at, picked_up_at, delivered_at, estimated_delivery_date)"
              )
              .eq("order_id", order.id),
          ]);

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
              return {
                id: vo.id,
                status: vo.status,
                updated_at: vo.updated_at,
                tracking_number: vo.tracking_number,
                carrier: vo.carrier,
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
        <div className="container mx-auto px-4 py-16">
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <CardTitle>Sign in to view your orders</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                Please sign in to access your order history and track your purchases.
              </p>
              <Button onClick={() => navigate("/admin")} className="w-full">
                Sign In
              </Button>
              <Button variant="outline" onClick={() => navigate("/")} className="w-full">
                Continue Shopping
              </Button>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-serif font-bold">Order History</h1>
            <p className="text-muted-foreground">Track and manage your orders</p>
          </div>
        </div>

        {orders.length === 0 ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="text-center py-12">
              <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No orders yet</h2>
              <p className="text-muted-foreground mb-6">
                Start shopping to see your orders here!
              </p>
              <Button asChild>
                <Link to="/">Start Shopping</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
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
              const showGroupLabels = shipmentGroups.length > 1;

              const hasCancellableItems = order.vendor_orders.some(
                (vo) => !NOT_CANCELLABLE_STATUSES.includes(vo.status),
              );
              const isPaidOnline = order.payment_method === "razorpay" && order.payment_status === "paid";
              const paymentDisplay = paymentStatusDisplay(order);

              return (
              <Card key={order.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">
                        Order #{order.id.slice(0, 8).toUpperCase()}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Placed on {format(new Date(order.created_at), "PPP 'at' p")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {shipmentGroups.length === 1 && shipmentGroups[0].vendorOrder && (
                        <Badge className={shipmentStatusColors[shipmentGroups[0].vendorOrder.status] || "bg-muted"}>
                          {shipmentGroups[0].vendorOrder.status.charAt(0).toUpperCase() +
                            shipmentGroups[0].vendorOrder.status.slice(1).replace(/_/g, " ")}
                        </Badge>
                      )}
                      <Badge className={paymentDisplay.className}>{paymentDisplay.label}</Badge>
                      {hasCancellableItems && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
                          onClick={() => setCancellingOrder(order)}
                        >
                          <Ban className="h-3.5 w-3.5" />
                          Cancel Order
                        </Button>
                      )}
                      {!hasCancellableItems && order.vendor_orders.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1"
                          onClick={() => setReorderingOrder(order)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Reorder
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="items" className="border-b-0">
                      <AccordionTrigger className="hover:no-underline py-2">
                        <span className="text-sm">
                          {order.order_items.length} item{order.order_items.length > 1 ? "s" : ""} • Total: ₹{order.total.toFixed(2)}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-5 pt-2">
                          {shipmentGroups.map((group, i) => (
                            <div key={group.vendorOrderId || i} className={showGroupLabels ? "border border-border rounded-lg p-3 space-y-3" : "space-y-3"}>
                              {showGroupLabels && (
                                <p className="text-xs font-medium text-muted-foreground">
                                  Part {i + 1} of {shipmentGroups.length}
                                </p>
                              )}
                              {group.items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-start gap-3 border-b border-border pb-3 last:border-0"
                                >
                                  {item.image ? (
                                    <img src={item.image} alt="" className="h-14 w-14 rounded-md object-cover shrink-0" />
                                  ) : (
                                    <div className="h-14 w-14 rounded-md bg-muted shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium">{item.product_title}</p>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                      {item.variant_title && (
                                        <Badge variant="secondary" className="text-xs px-2 py-0.5 font-normal">
                                          {item.variant_title}
                                        </Badge>
                                      )}
                                      {item.size && (
                                        <Badge variant="secondary" className="text-xs px-2 py-0.5 font-normal">
                                          Size {item.size}
                                        </Badge>
                                      )}
                                      {item.color && (
                                        <Badge variant="secondary" className="text-xs px-2 py-0.5 font-normal">
                                          {item.color}
                                        </Badge>
                                      )}
                                      <Badge variant="secondary" className="text-xs px-2 py-0.5 font-normal">
                                        Qty {item.quantity}
                                      </Badge>
                                    </div>
                                  </div>
                                  <p className="font-medium shrink-0">₹{(item.price * item.quantity).toFixed(2)}</p>
                                </div>
                              ))}
                              {group.vendorOrder && (
                                <div className="pt-1 space-y-2">
                                  <OrderStatusTimeline
                                    timeline={buildOrderTimeline({
                                      vendorOrderStatus: group.vendorOrder.status,
                                      vendorOrderUpdatedAt: group.vendorOrder.updated_at,
                                      orderPlacedAt: order.created_at,
                                      shipment: group.vendorOrder.shipment,
                                    })}
                                  />
                                  {group.vendorOrder.shipment?.awb_code ? (
                                    <a
                                      href={`https://shiprocket.co/tracking/${group.vendorOrder.shipment.awb_code}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs text-primary hover:underline inline-block"
                                    >
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
                                  <div>
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

                          <div className="pt-3 space-y-1 text-sm border-t">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Subtotal</span>
                              <span>₹{order.subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Shipping</span>
                              <span>{order.shipping_cost > 0 ? `₹${order.shipping_cost.toFixed(2)}` : "Free"}</span>
                            </div>
                            {order.discount_amount > 0 && (
                              <div className="flex justify-between text-primary">
                                <span>
                                  Discount{order.discount_code && ` (${order.discount_code})`}
                                </span>
                                <span>-₹{order.discount_amount.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between font-semibold pt-2 border-t">
                              <span>Total</span>
                              <span>₹{order.total.toFixed(2)}</span>
                            </div>
                          </div>

                          <div className="pt-4 border-t">
                            <p className="text-sm font-medium mb-1">Shipping Address</p>
                            <p className="text-sm text-muted-foreground">
                              {order.customer_name}<br />
                              {order.shipping_address.address_line1}
                              {order.shipping_address.address_line2 && <>, {order.shipping_address.address_line2}</>}<br />
                              {order.shipping_address.city}, {order.shipping_address.state} - {order.shipping_address.pincode}
                            </p>
                          </div>
                          {/* Return/Exchange Requests for this order */}
                          {returnsByOrder[order.id] && returnsByOrder[order.id].length > 0 && (
                            <div className="pt-4 border-t space-y-2">
                              <p className="text-sm font-medium">Return / Exchange Requests</p>
                              {returnsByOrder[order.id].map((rr) => {
                                const statusInfo = returnStatusConfig[rr.status] || returnStatusConfig.pending;
                                return (
                                  <div key={rr.id} className="p-3 bg-muted rounded-lg text-sm space-y-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
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
                                          {format(new Date(rr.created_at), "MMM d, yyyy")}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {!!rr.refund_amount && rr.status === "completed" && rr.request_type === "return" && (
                                          <span className="text-xs text-green-700 font-medium">Refund: ₹{rr.refund_amount.toFixed(2)}</span>
                                        )}
                                        <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                                        {rr.status === "pending" && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs text-destructive hover:text-destructive"
                                            onClick={() => cancelReturnRequest(rr.id)}
                                          >
                                            Cancel
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                    <div className="space-y-1.5 pt-1 border-t border-border/60">
                                      {(rr.items || []).map((item, idx) => {
                                        const exchangeTo =
                                          item.exchange_to ??
                                          (rr.exchange_details
                                            ? { size: rr.exchange_details.new_size ?? null, color: rr.exchange_details.new_color ?? null }
                                            : null);
                                        return (
                                          <div key={idx} className="flex items-center gap-2 text-xs">
                                            {item.photo_url ? (
                                              <img
                                                src={item.photo_url}
                                                alt=""
                                                className="h-8 w-8 rounded object-cover border border-border shrink-0"
                                              />
                                            ) : (
                                              <div className="h-8 w-8 rounded bg-background shrink-0" />
                                            )}
                                            <span className="font-medium">{item.product_title}</span>
                                            {rr.request_type === "exchange" && exchangeTo && (exchangeTo.size || exchangeTo.color) && (
                                              <span className="text-muted-foreground">
                                                → Exchange for: {[exchangeTo.size, exchangeTo.color].filter(Boolean).join(" / ")}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
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
                            <div className="pt-4 border-t space-y-2">
                              <p className="text-sm font-medium">Refunds</p>
                              <RefundHistory orderId={order.id} />
                            </div>
                          )}

                          {order.order_status === "delivered" && (
                            <div className="pt-4 border-t">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => {
                                  setReturnOrderId(order.id);
                                  setReturnOrderItems(order.order_items);
                                }}
                              >
                                <RotateCcw className="h-4 w-4" />
                                Return / Exchange
                              </Button>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </div>

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
                vendorOrderStatus: vo?.status ?? "pending",
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
