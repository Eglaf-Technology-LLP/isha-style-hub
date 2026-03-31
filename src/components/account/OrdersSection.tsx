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

interface Order {
  id: string;
  created_at: string;
  order_status: string;
  payment_status: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  order_items: OrderItem[];
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  processing: "bg-purple-100 text-purple-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
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

      // Fetch order items for each order
      const ordersWithItems = await Promise.all(
        (ordersData || []).map(async (order) => {
          const { data: itemsData } = await supabase
            .from("order_items")
            .select("id, product_title, variant_title, quantity, price, size, color")
            .eq("order_id", order.id);

          return {
            ...order,
            order_items: itemsData || [],
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
