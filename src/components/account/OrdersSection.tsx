import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, ShoppingBag, ExternalLink, RotateCcw, ArrowLeftRight, Ban, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReturnRequests, ReturnRequest } from "@/hooks/useReturnRequests";
import { format } from "date-fns";
import { OrderCancellationDialog, CancellableOrderItem } from "@/components/OrderCancellationDialog";
import { ReorderDialog } from "@/components/ReorderDialog";
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
  image: string | null;
}

// Internal fulfillment/grouping details only - never rendered as "which
// vendor," just used to derive a status timeline and to know which items
// ship together.
interface VendorOrderInfo {
  id: string;
  status: string;
  updated_at: string;
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
  order_items: OrderItem[];
  vendor_orders: VendorOrderInfo[];
}

// Used only for the single-shipment summary badge in the collapsed card
// header - the expanded timeline is the detailed view.
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

const returnStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending Review", className: "bg-yellow-100 text-yellow-800" },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-800" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
  picked_up: { label: "Items Picked Up", className: "bg-indigo-100 text-indigo-800" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800" },
  pickup_failed: { label: "Pickup Issue - We're On It", className: "bg-amber-100 text-amber-800" },
};

export function OrdersSection() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [reorderingOrder, setReorderingOrder] = useState<Order | null>(null);
  const { returnRequests, cancelReturnRequest } = useReturnRequests();

  const returnsByOrder = returnRequests.reduce<Record<string, ReturnRequest[]>>((acc, rr) => {
    if (!acc[rr.order_id]) acc[rr.order_id] = [];
    acc[rr.order_id].push(rr);
    return acc;
  }, {});

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user]);

  const fetchOrders = async () => {
    if (!user) return;

    try {
      const { data: ordersData, error } = await supabase
        .from("orders")
        .select("id, created_at, order_status, payment_status, payment_method, subtotal, shipping_cost, total")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;

      // Fetch order items and each shipment's own fulfillment status - a
      // multi-item order can have more than one shipment, each updating
      // independently, even though vendor identity is never shown here.
      const ordersWithItems = await Promise.all(
        (ordersData || []).map(async (order) => {
          const [{ data: itemsData }, { data: vendorOrdersData }] = await Promise.all([
            supabase
              .from("order_items")
              .select("id, product_id, variant_id, product_title, variant_title, quantity, price, size, color, vendor_id, vendor_order_id")
              .eq("order_id", order.id),
            supabase
              .from("vendor_orders")
              .select(
                "id, status, updated_at, shipments(awb_code, courier_name, shipment_type, created_at, pickup_scheduled_at, picked_up_at, delivered_at, estimated_delivery_date)"
              )
              .eq("order_id", order.id),
          ]);

          const imageByItemId = await resolveOrderItemImages(
            (itemsData || []).map((i) => ({ id: i.id, product_id: i.product_id, variant_id: i.variant_id })),
          );

          return {
            ...order,
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

      setOrders(ordersWithItems);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recent Orders</CardTitle>
          <CardDescription>
            Your last 10 orders. View all orders for complete history.
          </CardDescription>
        </div>
        <Button variant="outline" asChild>
          <Link to="/orders">
            View All
            <ExternalLink className="h-4 w-4 ml-2" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingBag className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No orders yet</p>
            <p className="text-sm">Start shopping to see your orders here!</p>
            <Button asChild className="mt-4">
              <Link to="/">Start Shopping</Link>
            </Button>
          </div>
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

              return (
              <Card key={order.id}>
                <CardContent className="pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                    <div>
                      <p className="font-medium">
                        Order #{order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(order.created_at), "PPP")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {shipmentGroups.length === 1 && shipmentGroups[0].vendorOrder && (
                        <Badge className={`${shipmentStatusColors[shipmentGroups[0].vendorOrder.status] || "bg-muted"} text-[10px] px-1.5 py-0`}>
                          {shipmentGroups[0].vendorOrder.status.charAt(0).toUpperCase() +
                            shipmentGroups[0].vendorOrder.status.slice(1).replace(/_/g, " ")}
                        </Badge>
                      )}
                      {hasCancellableItems && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                          onClick={() => setCancellingOrder(order)}
                        >
                          <Ban className="h-3 w-3" />
                          Cancel Order
                        </Button>
                      )}
                      {!hasCancellableItems && order.vendor_orders.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => setReorderingOrder(order)}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Reorder
                        </Button>
                      )}
                    </div>
                  </div>

                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="items" className="border-b-0">
                      <AccordionTrigger className="hover:no-underline py-2">
                        <span className="text-sm">
                          {order.order_items.length} item{order.order_items.length > 1 ? "s" : ""} • ₹{order.total.toFixed(0)}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3">
                          {shipmentGroups.map((group, i) => (
                            <div key={group.vendorOrderId || i} className={showGroupLabels ? "border border-border rounded-lg p-2 space-y-2" : "space-y-2"}>
                              {showGroupLabels && (
                                <p className="text-[10px] font-medium text-muted-foreground">
                                  Part {i + 1} of {shipmentGroups.length}
                                </p>
                              )}
                              {group.items.map((item) => (
                                <div key={item.id} className="flex items-start gap-2 text-sm">
                                  {item.image ? (
                                    <img src={item.image} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
                                  ) : (
                                    <div className="h-9 w-9 rounded bg-muted shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{item.product_title}</p>
                                    <div className="flex flex-wrap items-center gap-1 mt-1">
                                      {item.size && (
                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                                          Size {item.size}
                                        </Badge>
                                      )}
                                      {item.color && (
                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                                          {item.color}
                                        </Badge>
                                      )}
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                                        Qty {item.quantity}
                                      </Badge>
                                    </div>
                                  </div>
                                  <span className="shrink-0 font-medium">₹{(item.price * item.quantity).toFixed(0)}</span>
                                </div>
                              ))}
                              {group.vendorOrder && (
                                <OrderStatusTimeline
                                  compact
                                  timeline={buildOrderTimeline({
                                    vendorOrderStatus: group.vendorOrder.status,
                                    vendorOrderUpdatedAt: group.vendorOrder.updated_at,
                                    orderPlacedAt: order.created_at,
                                    shipment: group.vendorOrder.shipment,
                                  })}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        {/* Return/Exchange status */}
                        {returnsByOrder[order.id] && returnsByOrder[order.id].length > 0 && (
                          <div className="pt-3 border-t space-y-2 mt-2">
                            <p className="text-xs font-medium text-muted-foreground">Return / Exchange</p>
                            {returnsByOrder[order.id].map((rr) => {
                              const statusInfo = returnStatusConfig[rr.status] || returnStatusConfig.pending;
                              const exchangeTargets = rr.request_type === "exchange"
                                ? (rr.items || [])
                                    .map((item) => item.exchange_to ?? (rr.exchange_details ? { size: rr.exchange_details.new_size ?? null, color: rr.exchange_details.new_color ?? null } : null))
                                    .filter((t): t is { size: string | null; color: string | null } => !!t && !!(t.size || t.color))
                                    .map((t) => [t.size, t.color].filter(Boolean).join("/"))
                                : [];
                              return (
                                <div key={rr.id} className="flex items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-1.5">
                                    {rr.request_type === "return" ? (
                                      <RotateCcw className="h-3 w-3 text-muted-foreground" />
                                    ) : (
                                      <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                                    )}
                                    <span className="font-medium">
                                      {rr.request_type === "return" ? "Return" : "Exchange"}
                                    </span>
                                    {exchangeTargets.length > 0 && (
                                      <span className="text-muted-foreground">→ {exchangeTargets.join(", ")}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Badge className={`${statusInfo.className} text-[10px] px-1.5 py-0`}>{statusInfo.label}</Badge>
                                    {rr.status === "pending" && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 text-[10px] px-1.5 text-destructive hover:text-destructive"
                                        onClick={() => cancelReturnRequest(rr.id)}
                                      >
                                        Cancel
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
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
        onSuccess={fetchOrders}
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
    </>
  );
}
