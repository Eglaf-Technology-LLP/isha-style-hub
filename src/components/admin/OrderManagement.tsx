import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ShoppingCart,
  Loader2,
  Eye,
  Package,
  MapPin,
  Phone,
  Mail,
  User,
} from "lucide-react";
import { useOrders, Order, OrderItem } from "@/hooks/useOrders";
import { format } from "date-fns";

interface OrderManagementProps {
  isAdmin: boolean;
}

export function OrderManagement({ isAdmin }: OrderManagementProps) {
  const { orders, loading, updateOrderStatus, updatePaymentStatus } = useOrders(isAdmin);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const getOrderStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "secondary";
      case "confirmed":
        return "default";
      case "processing":
        return "default";
      case "shipped":
        return "default";
      case "delivered":
        return "default";
      case "cancelled":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "default";
      case "pending":
        return "secondary";
      case "failed":
        return "destructive";
      case "refunded":
        return "secondary";
      default:
        return "secondary";
    }
  };

  const openOrderDetails = (order: Order) => {
    setSelectedOrder(order);
    setIsViewDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <div className="flex flex-row items-center justify-between p-6 border-b border-border">
        <div>
          <h3 className="text-lg font-semibold">Orders</h3>
          <p className="text-sm text-muted-foreground">
            Manage and track customer orders
          </p>
        </div>
      </div>

      <CardContent className="p-0">
        {orders.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No orders yet</h3>
            <p className="text-muted-foreground">
              Orders will appear here when customers make purchases
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">
                      {order.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(order.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{order.customer_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.customer_email}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{order.order_items?.length || 0} items</TableCell>
                    <TableCell className="font-medium">
                      ₹{order.total.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant={getPaymentStatusColor(order.payment_status) as any}
                        >
                          {order.payment_status}
                        </Badge>
                        <span className="text-xs text-muted-foreground uppercase">
                          {order.payment_method}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={order.order_status}
                        onValueChange={(value) =>
                          updateOrderStatus(order.id, value as Order["order_status"])
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="processing">Processing</SelectItem>
                          <SelectItem value="shipped">Shipped</SelectItem>
                          <SelectItem value="delivered">Delivered</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openOrderDetails(order)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {order.payment_method === "cod" &&
                          order.payment_status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updatePaymentStatus(order.id, "paid")}
                            >
                              Mark Paid
                            </Button>
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Order Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              Order #{selectedOrder?.id.slice(0, 8)}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-6">
                {/* Order Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Order Date</p>
                    <p className="font-medium">
                      {format(new Date(selectedOrder.created_at), "PPP 'at' p")}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge
                      variant={getOrderStatusColor(selectedOrder.order_status) as any}
                    >
                      {selectedOrder.order_status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Payment Status</p>
                    <Badge
                      variant={getPaymentStatusColor(selectedOrder.payment_status) as any}
                    >
                      {selectedOrder.payment_status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Payment Method</p>
                    <p className="font-medium uppercase">
                      {selectedOrder.payment_method}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Customer Info */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Customer Information
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedOrder.customer_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedOrder.customer_email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedOrder.customer_phone}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Shipping Address */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Shipping Address
                  </h4>
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    <p>{selectedOrder.shipping_address.address_line1}</p>
                    {selectedOrder.shipping_address.address_line2 && (
                      <p>{selectedOrder.shipping_address.address_line2}</p>
                    )}
                    <p>
                      {selectedOrder.shipping_address.city},{" "}
                      {selectedOrder.shipping_address.state}{" "}
                      {selectedOrder.shipping_address.pincode}
                    </p>
                    <p>{selectedOrder.shipping_address.country}</p>
                  </div>
                </div>

                <Separator />

                {/* Order Items */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Order Items
                  </h4>
                  <div className="space-y-3">
                    {selectedOrder.order_items?.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 border border-border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{item.product_title}</p>
                          {item.variant_title && (
                            <p className="text-sm text-muted-foreground">
                              {item.variant_title}
                            </p>
                          )}
                          <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                            {item.size && <span>Size: {item.size}</span>}
                            {item.color && <span>Color: {item.color}</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            ₹{item.price.toFixed(2)} × {item.quantity}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            ₹{(item.price * item.quantity).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Order Summary */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₹{selectedOrder.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shipping</span>
                    <span>₹{selectedOrder.shipping_cost.toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-medium text-lg">
                    <span>Total</span>
                    <span>₹{selectedOrder.total.toFixed(2)}</span>
                  </div>
                </div>

                {selectedOrder.notes && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="font-medium mb-2">Order Notes</h4>
                      <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                        {selectedOrder.notes}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
