import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, Package, MapPin, User, Truck, Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Shipment } from "@/hooks/useShipments";

interface DetailItem {
  product_title: string;
  variant_title: string | null;
  size: string | null;
  color: string | null;
  sku: string | null;
  quantity: number;
  price: number;
}

interface ShippingAddressLike {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
}

export interface VendorOrderDetailsData {
  orderId: string;
  createdAt: string;
  vendorName: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  shippingAddress?: ShippingAddressLike | null;
  items: DetailItem[];
  subtotal: number;
  shippingCost: number;
  discountCode?: string | null;
  discountAmount?: number;
  shipment: Shipment | null;
}

interface ShipmentEvent {
  id: string;
  event_status: string | null;
  activity: string | null;
  location: string | null;
  event_timestamp: string | null;
  received_at: string;
}

const statusColors: Record<string, string> = {
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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

// The previous view crammed courier, AWB, tracking link, label link and
// history into a single flex-wrapped line - readable for one shipment at a
// glance, useless for actually verifying an order end to end. This gives
// the same real data (nothing fabricated - no HSN/e-way bill/package
// weight breakdown, since none of that is tracked in this app yet) its
// own clearly labeled section, mirroring how Shiprocket's own order detail
// page separates Order/Shipping/Customer/Product/Activity into distinct
// blocks instead of one row.
export function VendorOrderDetailsDialog({ data }: { data: VendorOrderDetailsData }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEffect(() => {
    if (!open || !data.shipment) return;
    setLoadingEvents(true);
    supabase
      .from("shipment_events")
      .select("id, event_status, activity, location, event_timestamp, received_at")
      .eq("shipment_id", data.shipment.id)
      .order("event_timestamp", { ascending: true, nullsFirst: true })
      .then(({ data: rows }) => {
        setEvents((rows ?? []) as ShipmentEvent[]);
        setLoadingEvents(false);
      });
  }, [open, data.shipment]);

  const itemsTotal = data.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const orderTotal = data.subtotal + data.shippingCost - (data.discountAmount || 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
        <Eye className="h-3.5 w-3.5" /> View Details
      </Button>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Order #{data.orderId.slice(0, 8)}</DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            <span>{data.vendorName}</span>
            <Badge className={`${statusColors[data.status] || "bg-muted"} capitalize`}>
              {data.status.replace(/_/g, " ")}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-3">
          <div className="space-y-6">
            {/* Order Details */}
            <section>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" /> Order Details
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Order Placed" value={format(new Date(data.createdAt), "MMM d, yyyy 'at' p")} />
                <Field label="Payment Method" value={data.paymentMethod.toUpperCase()} />
                <Field
                  label="Payment Status"
                  value={
                    <Badge variant={data.paymentStatus === "paid" ? "default" : "secondary"} className="capitalize">
                      {data.paymentStatus}
                    </Badge>
                  }
                />
              </div>
            </section>

            <Separator />

            {/* Shipping Details */}
            <section>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Truck className="h-4 w-4" /> Shipping Details
              </h4>
              {data.shipment ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Courier" value={data.shipment.courier_name || "Assigned"} />
                  <Field label="AWB No." value={data.shipment.awb_code ? <span className="font-mono">{data.shipment.awb_code}</span> : "Not yet assigned"} />
                  <Field label="Status" value={<span className="capitalize">{data.shipment.status.replace(/_/g, " ")}</span>} />
                  {data.shipment.pickup_scheduled_at && (
                    <Field label="Pickup Scheduled" value={format(new Date(data.shipment.pickup_scheduled_at), "MMM d, yyyy p")} />
                  )}
                  {data.shipment.picked_up_at && (
                    <Field label="Picked Up" value={format(new Date(data.shipment.picked_up_at), "MMM d, yyyy p")} />
                  )}
                  {data.shipment.delivered_at && (
                    <Field label="Delivered" value={format(new Date(data.shipment.delivered_at), "MMM d, yyyy p")} />
                  )}
                  {data.shipment.rto_initiated_at && (
                    <Field label="RTO Initiated" value={format(new Date(data.shipment.rto_initiated_at), "MMM d, yyyy p")} />
                  )}
                  {data.shipment.estimated_delivery_date && (
                    <Field label="Estimated Delivery" value={format(new Date(data.shipment.estimated_delivery_date), "MMM d, yyyy")} />
                  )}
                  {(data.shipment.label_url || data.shipment.manifest_url) && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Documents</p>
                      <div className="flex items-center gap-3">
                        {data.shipment.label_url && (
                          <a href={data.shipment.label_url} target="_blank" rel="noreferrer" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
                            Label <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {data.shipment.manifest_url && (
                          <a href={data.shipment.manifest_url} target="_blank" rel="noreferrer" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
                            Manifest <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  {data.shipment.awb_code && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Tracking</p>
                      <a
                        href={`https://shiprocket.co/tracking/${data.shipment.awb_code}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
                      >
                        Track shipment <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not shipped yet - use Ship Now to book a courier.</p>
              )}
            </section>

            <Separator />

            {/* Customer Details */}
            <section>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <User className="h-4 w-4" /> Customer Details
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Name" value={data.customerName} />
                <Field label="Phone" value={data.customerPhone} />
                <Field label="Email" value={data.customerEmail} />
              </div>
              {data.shippingAddress && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Shipping Address
                  </p>
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    {data.shippingAddress.address_line1 && <p>{data.shippingAddress.address_line1}</p>}
                    {data.shippingAddress.address_line2 && <p>{data.shippingAddress.address_line2}</p>}
                    <p>
                      {[data.shippingAddress.city, data.shippingAddress.state, data.shippingAddress.pincode]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    {data.shippingAddress.country && <p>{data.shippingAddress.country}</p>}
                  </div>
                </div>
              )}
            </section>

            <Separator />

            {/* Product Details */}
            <section>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" /> Product Details
              </h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{item.product_title}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {[item.variant_title, item.size && `Size: ${item.size}`, item.color && `Color: ${item.color}`]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{item.sku || "not set"}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">₹{item.price.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">₹{(item.price * item.quantity).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Product Total ({data.items.length} item{data.items.length !== 1 ? "s" : ""})</span>
                  <span>₹{itemsTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping charges</span>
                  <span>₹{data.shippingCost.toFixed(2)}</span>
                </div>
                {!!data.discountAmount && data.discountAmount > 0 && (
                  <div className="flex justify-between text-primary">
                    <span>Discount{data.discountCode && ` (${data.discountCode})`}</span>
                    <span>-₹{data.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Order Total</span>
                  <span>₹{orderTotal.toFixed(2)}</span>
                </div>
              </div>
            </section>

            {data.shipment && (
              <>
                <Separator />
                {/* Activity Log */}
                <section>
                  <h4 className="font-medium mb-3">Activity Log</h4>
                  {loadingEvents ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : events.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tracking events recorded yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {events.map((e) => (
                        <div key={e.id} className="border-l-2 border-primary/30 pl-3 pb-1">
                          <p className="text-sm font-medium">{e.event_status || "Update"}</p>
                          {e.activity && <p className="text-xs text-muted-foreground">{e.activity}</p>}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span>{format(new Date(e.event_timestamp || e.received_at), "MMM d, yyyy h:mm a")}</span>
                            {e.location && (
                              <span className="inline-flex items-center gap-0.5">
                                <MapPin className="h-3 w-3" /> {e.location}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
