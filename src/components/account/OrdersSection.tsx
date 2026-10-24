import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
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
import { OrderCancellationDialog, CancellableOrderItem } from "@/components/OrderCancellationDialog";
import { ReorderDialog } from "@/components/ReorderDialog";
import { InvoiceDownloadButton } from "@/components/InvoiceDownloadButton";
import { OrderStatusTimeline } from "@/components/OrderStatusTimeline";
import { buildOrderTimeline, ShipmentTimestamps } from "@/lib/orderStatus";
import { resolveOrderItemImages } from "@/lib/orderItemImage";
import { AccountSectionTitle, StatusPill } from "@/components/storefront/account/AccountKit";
import { formatDate } from "@/lib/dates";

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
  discount_code: string | null;
  discount_amount: number;
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
        .select("id, created_at, order_status, payment_status, payment_method, subtotal, shipping_cost, total, discount_code, discount_amount")
        .eq("user_id", user.id)
        // An online checkout that was never paid isn't an order.
        .or("payment_method.eq.cod,payment_status.in.(paid,refunded)")
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
    <div>
      <AccountSectionTitle
        title="Recent orders"
        text="Your last 10 orders. View all orders for complete history."
        action={
          <Link
            to="/orders"
            className="inline-flex h-11 shrink-0 items-center gap-2 border border-foreground px-5 text-[11px] font-medium uppercase tracking-[0.2em] transition-colors hover:bg-foreground hover:text-background"
          >
            View all orders
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        }
      />
      {orders.length === 0 ? (
        <div className="border border-dashed border-foreground/15 px-6 py-14 text-center">
          <ShoppingBag className="mx-auto mb-4 h-8 w-8 text-gold" strokeWidth={1.5} />
          <p className="font-serif text-2xl">No orders yet</p>
          <p className="mt-2 text-sm text-muted-foreground">Start shopping to see your orders here!</p>
          <Link
            to="/category/all"
            className="mt-6 inline-flex h-12 items-center bg-primary px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground hover:bg-maroon-deep"
          >
            Start shopping
          </Link>
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
            <article key={order.id} className="border border-border">
              <div className="flex flex-col gap-3 border-b border-border bg-ivory px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-8">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Order</p>
                    <p className="font-mono text-sm">#{order.id.slice(0, 8).toUpperCase()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Placed on</p>
                    <p className="text-sm">{formatDate(new Date(order.created_at))}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {shipmentGroups.length === 1 && shipmentGroups[0].vendorOrder && (
                    <StatusPill className={shipmentStatusColors[shipmentGroups[0].vendorOrder.status]}>
                      {shipmentGroups[0].vendorOrder.status.charAt(0).toUpperCase() +
                        shipmentGroups[0].vendorOrder.status.slice(1).replace(/_/g, " ")}
                    </StatusPill>
                  )}
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
              </div>

              <Accordion type="single" collapsible className="w-full px-5">
                <AccordionItem value="items" className="border-b-0">
                  <AccordionTrigger className="py-4 hover:no-underline">
                    <span className="text-sm">
                      {order.order_items.length} item{order.order_items.length > 1 ? "s" : ""} · <span className="font-medium">₹{order.total.toFixed(0)}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      {shipmentGroups.map((group, i) => (
                        <div key={group.vendorOrderId || i} className={showGroupLabels ? "space-y-3 border border-border p-3" : "space-y-3"}>
                          {showGroupLabels && (
                            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                              Part {i + 1} of {shipmentGroups.length}
                            </p>
                          )}
                          {group.items.map((item) => (
                            <div key={item.id} className="flex items-start gap-3 text-sm">
                              {item.image ? (
                                <img src={item.image} alt="" className="h-16 w-12 shrink-0 object-cover" />
                              ) : (
                                <div className="h-16 w-12 shrink-0 bg-ivory" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate">{item.product_title}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {[item.size && `Size ${item.size}`, item.color, `Qty ${item.quantity}`].filter(Boolean).join(" · ")}
                                </p>
                              </div>
                              <span className="shrink-0 font-medium">₹{(item.price * item.quantity).toFixed(0)}</span>
                            </div>
                          ))}
                          {group.vendorOrder && (
                            <>
                              <OrderStatusTimeline
                                compact
                                timeline={buildOrderTimeline({
                                  vendorOrderStatus: group.vendorOrder.status,
                                  vendorOrderUpdatedAt: group.vendorOrder.updated_at,
                                  orderPlacedAt: order.created_at,
                                  shipment: group.vendorOrder.shipment,
                                })}
                              />
                              <InvoiceDownloadButton
                                vendorOrderId={group.vendorOrderId}
                                paymentStatus={order.payment_status}
                                vendorOrderStatus={group.vendorOrder?.status}
                              />
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    {order.discount_amount > 0 && (
                      <div className="mt-3 flex justify-between border-t border-border pt-3 text-xs">
                        <span className="text-muted-foreground">
                          Discount applied{order.discount_code && ` (${order.discount_code})`}
                        </span>
                        <span className="text-primary">-₹{order.discount_amount.toFixed(2)}</span>
                      </div>
                    )}
                    {/* Return/Exchange status */}
                    {returnsByOrder[order.id] && returnsByOrder[order.id].length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Return / Exchange</p>
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
                          );
                        })}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </article>
            );
          })}
        </div>
      )}
    </div>
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
