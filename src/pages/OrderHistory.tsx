import { useEffect, useState } from "react";
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
import { Loader2, Package, ShoppingBag, ArrowLeft, RotateCcw, ArrowLeftRight } from "lucide-react";
import { format } from "date-fns";
import { ReturnRequestForm } from "@/components/ReturnRequestForm";
import { useReturnRequests, ReturnRequest } from "@/hooks/useReturnRequests";

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
  customer_name: string;
  shipping_address: {
    address_line1: string;
    address_line2?: string;
    city: string;
    state: string;
    pincode: string;
  };
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

const paymentStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-800",
};

export default function OrderHistory() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);
  const [returnOrderItems, setReturnOrderItems] = useState<OrderItem[]>([]);
  const { returnRequests, cancelReturnRequest } = useReturnRequests();

  const returnsByOrder = returnRequests.reduce<Record<string, ReturnRequest[]>>((acc, rr) => {
    if (!acc[rr.order_id]) acc[rr.order_id] = [];
    acc[rr.order_id].push(rr);
    return acc;
  }, {});

  useEffect(() => {
    const checkAuthAndFetchOrders = async () => {
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

        // Fetch order items for each order
        const ordersWithItems = await Promise.all(
          (ordersData || []).map(async (order) => {
            const { data: itemsData } = await supabase
              .from("order_items")
              .select("*")
              .eq("order_id", order.id);

            return {
              ...order,
              shipping_address: order.shipping_address as Order["shipping_address"],
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
  }, []);

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
            {orders.map((order) => (
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
                    <div className="flex gap-2">
                      <Badge className={statusColors[order.order_status] || "bg-muted"}>
                        {order.order_status.charAt(0).toUpperCase() + order.order_status.slice(1)}
                      </Badge>
                      <Badge className={paymentStatusColors[order.payment_status] || "bg-muted"}>
                        Payment: {order.payment_status.charAt(0).toUpperCase() + order.payment_status.slice(1)}
                      </Badge>
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
                        <div className="space-y-3 pt-2">
                          {order.order_items.map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between items-start border-b border-border pb-3 last:border-0"
                            >
                              <div>
                                <p className="font-medium">{item.product_title}</p>
                                <div className="text-sm text-muted-foreground">
                                  {item.variant_title && <span>{item.variant_title}</span>}
                                  {item.size && <span> • Size: {item.size}</span>}
                                  {item.color && <span> • Color: {item.color}</span>}
                                </div>
                                <p className="text-sm">Qty: {item.quantity}</p>
                              </div>
                              <p className="font-medium">₹{(item.price * item.quantity).toFixed(2)}</p>
                            </div>
                          ))}
                          
                          <div className="pt-3 space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Subtotal</span>
                              <span>₹{order.subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Shipping</span>
                              <span>{order.shipping_cost > 0 ? `₹${order.shipping_cost.toFixed(2)}` : "Free"}</span>
                            </div>
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
                                  <div key={rr.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-muted rounded-lg text-sm">
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
                                      {rr.refund_amount && rr.status === "completed" && rr.request_type === "return" && (
                                        <span className="text-xs text-green-700 font-medium">Refund: ₹{rr.refund_amount.toFixed(2)}</span>
                                      )}
                                      <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                                    </div>
                                  </div>
                                );
                              })}
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
            ))}
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

      <Footer />
    </div>
  );
}
