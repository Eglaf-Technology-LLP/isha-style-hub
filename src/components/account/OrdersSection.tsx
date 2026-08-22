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
import { Loader2, ShoppingBag, ExternalLink, RotateCcw, ArrowLeftRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReturnRequests, ReturnRequest } from "@/hooks/useReturnRequests";
import { format } from "date-fns";

interface OrderItem {
  id: string;
  product_title: string;
  variant_title: string | null;
  quantity: number;
  price: number;
  size: string | null;
  color: string | null;
}

interface VendorOrderStatus {
  vendor_id: string;
  vendor_name: string;
  status: string;
}

interface Order {
  id: string;
  created_at: string;
  order_status: string;
  payment_status: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  order_items: OrderItem[];
  vendor_orders: VendorOrderStatus[];
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  processing: "bg-purple-100 text-purple-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  returned: "bg-gray-100 text-gray-800",
};

const returnStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending Review", className: "bg-yellow-100 text-yellow-800" },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-800" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
  picked_up: { label: "Items Picked Up", className: "bg-indigo-100 text-indigo-800" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800" },
};

export function OrdersSection() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
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
        .select("id, created_at, order_status, payment_status, subtotal, shipping_cost, total")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;

      // Fetch order items and each vendor's own fulfillment status - a
      // multi-vendor order has one top-level order_status but each vendor
      // updates their own vendor_orders.status independently.
      const ordersWithItems = await Promise.all(
        (ordersData || []).map(async (order) => {
          const [{ data: itemsData }, { data: vendorOrdersData }] = await Promise.all([
            supabase
              .from("order_items")
              .select("id, product_title, variant_title, quantity, price, size, color")
              .eq("order_id", order.id),
            supabase
              .from("vendor_orders")
              .select("vendor_id, status, vendor:vendors(name)")
              .eq("order_id", order.id),
          ]);

          return {
            ...order,
            order_items: itemsData || [],
            vendor_orders: (vendorOrdersData || []).map((vo: any) => ({
              vendor_id: vo.vendor_id,
              vendor_name: vo.vendor?.name || "Vendor",
              status: vo.status,
            })),
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
            {orders.map((order) => (
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
                    <div className="flex gap-2">
                      <Badge className={statusColors[order.order_status] || "bg-muted"}>
                        {order.order_status.charAt(0).toUpperCase() + order.order_status.slice(1)}
                      </Badge>
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
                        <div className="space-y-2 pt-2">
                          {order.order_items.map((item) => (
                            <div key={item.id} className="flex justify-between text-sm">
                              <div>
                                <span className="font-medium">{item.product_title}</span>
                                {(item.size || item.color) && (
                                  <span className="text-muted-foreground">
                                    {" "}• {[item.size, item.color].filter(Boolean).join(" / ")}
                                  </span>
                                )}
                                <span className="text-muted-foreground"> x{item.quantity}</span>
                              </div>
                              <span>₹{(item.price * item.quantity).toFixed(0)}</span>
                            </div>
                          ))}
                        </div>
                        {/* Per-vendor fulfillment status */}
                        {order.vendor_orders.length > 0 && (
                          <div className="pt-3 border-t space-y-1.5 mt-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              {order.vendor_orders.length > 1
                                ? "Fulfillment Status by Vendor"
                                : "Fulfillment Status"}
                            </p>
                            {order.vendor_orders.map((vo) => (
                              <div key={vo.vendor_id} className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-medium">{vo.vendor_name}</span>
                                <Badge className={`${statusColors[vo.status] || "bg-muted"} text-[10px] px-1.5 py-0`}>
                                  {vo.status.charAt(0).toUpperCase() + vo.status.slice(1)}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Return/Exchange status */}
                        {returnsByOrder[order.id] && returnsByOrder[order.id].length > 0 && (
                          <div className="pt-3 border-t space-y-2 mt-2">
                            <p className="text-xs font-medium text-muted-foreground">Return / Exchange</p>
                            {returnsByOrder[order.id].map((rr) => {
                              const statusInfo = returnStatusConfig[rr.status] || returnStatusConfig.pending;
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
