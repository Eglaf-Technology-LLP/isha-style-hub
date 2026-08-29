import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ExternalLink, XCircle, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Order } from "@/hooks/useOrders";
import { useShipments } from "@/hooks/useShipments";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { ShipmentTimelineDialog } from "./ShipmentTimelineDialog";
import { ShipNowDialog } from "./ShipNowDialog";
import { InvoiceDownloadButton } from "@/components/InvoiceDownloadButton";

const NOT_CANCELLABLE_STATUSES = ["delivered", "cancelled", "returned"];

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

// Groups an order's items by which vendor_order they belong to and shows
// each vendor's own real courier shipment status - a single order can
// span several vendors, each shipped/tracked independently. Admin gets
// the same "Ship Now" action vendors have, for oversight/backup.
export function OrderFulfillmentSection({ order }: { order: Order }) {
  const [vendorNames, setVendorNames] = useState<Record<string, string>>({});
  const [vendorOrderStatuses, setVendorOrderStatuses] = useState<Record<string, string>>({});
  const [cancellingVendorOrderId, setCancellingVendorOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const groups = new Map<string, { vendorId: string | null; items: typeof order.order_items }>();
  (order.order_items ?? []).forEach((item) => {
    const key = item.vendor_order_id ?? `no-vendor-${item.id}`;
    if (!groups.has(key)) groups.set(key, { vendorId: item.vendor_id, items: [] });
    groups.get(key)!.items.push(item);
  });
  const vendorOrderIds = [...groups.keys()].filter((k) => !k.startsWith("no-vendor-"));

  const { forwardShipmentFor, actioningId, checkServiceability, shipNow, cancelShipment } = useShipments(vendorOrderIds);

  const refetchVendorOrderStatuses = () => {
    if (vendorOrderIds.length === 0) return;
    supabase
      .from("vendor_orders")
      .select("id, status")
      .in("id", vendorOrderIds)
      .then(({ data }) => {
        setVendorOrderStatuses(Object.fromEntries((data ?? []).map((vo) => [vo.id, vo.status])));
      });
  };

  useEffect(() => {
    const vendorIds = [...new Set([...groups.values()].map((g) => g.vendorId).filter(Boolean))] as string[];
    if (vendorIds.length > 0) {
      supabase
        .from("vendors")
        .select("id, name")
        .in("id", vendorIds)
        .then(({ data }) => {
          setVendorNames(Object.fromEntries((data ?? []).map((v) => [v.id, v.name])));
        });
    }
    refetchVendorOrderStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const confirmCancelOrder = async () => {
    if (!cancellingVendorOrderId || !cancelReason.trim()) return;
    setCancelling(true);
    const { data, errorMessage } = await invokeEdgeFunction<{
      cancelled: { vendor_order_id: string; refund_error: string | null }[];
      skipped: { vendor_order_id: string; reason: string }[];
    }>("cancel-order-items", { vendor_order_ids: [cancellingVendorOrderId], reason: cancelReason.trim() });
    setCancelling(false);

    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }
    if (data?.skipped.length) {
      toast.error(`Couldn't cancel - ${data.skipped[0].reason}`);
    } else if (data?.cancelled[0]?.refund_error) {
      toast.warning("Cancelled, but the automatic refund failed - it's been flagged for follow-up.");
    } else {
      toast.success("Order cancelled");
    }
    setCancellingVendorOrderId(null);
    setCancelReason("");
    refetchVendorOrderStatuses();
  };

  if (vendorOrderIds.length === 0) return null;

  return (
    <div className="space-y-3">
      {[...groups.entries()]
        .filter(([key]) => !key.startsWith("no-vendor-"))
        .map(([vendorOrderId, group]) => {
          const shipment = forwardShipmentFor(vendorOrderId);
          const status = vendorOrderStatuses[vendorOrderId] ?? "pending";
          return (
            <div key={vendorOrderId} className="p-3 border border-border rounded-lg space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-medium text-sm">
                  {group.vendorId ? vendorNames[group.vendorId] || "Vendor" : "Vendor"}
                  <span className="text-muted-foreground"> · {group.items.length} item(s)</span>
                </span>
                <Badge className={`${statusColors[status] || "bg-muted"} capitalize`}>
                  {status.replace(/_/g, " ")}
                </Badge>
              </div>

              <InvoiceDownloadButton vendorOrderId={vendorOrderId} />

              {!shipment || (!shipment.awb_code && shipment.status === "cancelled") ? (
                status === "cancelled" ? (
                  <span className="text-xs text-muted-foreground">Cancelled</span>
                ) : (
                  <ShipNowDialog
                    vendorOrderId={vendorOrderId}
                    actioning={actioningId === vendorOrderId}
                    checkServiceability={checkServiceability}
                    shipNow={shipNow}
                    triggerSize="sm"
                  />
                )
              ) : (
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <span className="font-medium">{shipment.courier_name || "Courier assigned"}</span>
                  {shipment.awb_code && (
                    <>
                      <span className="font-mono text-muted-foreground">AWB {shipment.awb_code}</span>
                      <a
                        href={`https://shiprocket.co/tracking/${shipment.awb_code}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary inline-flex items-center gap-0.5 hover:underline"
                      >
                        Track <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                  {shipment.label_url && (
                    <a
                      href={shipment.label_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-0.5 hover:underline"
                    >
                      Label <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <ShipmentTimelineDialog shipmentId={shipment.id} awbCode={shipment.awb_code} />
                  {["pending", "awb_assigned", "pickup_scheduled"].includes(shipment.status) && (
                    <button
                      className="text-destructive inline-flex items-center gap-0.5 hover:underline disabled:opacity-50"
                      disabled={actioningId === vendorOrderId}
                      onClick={() => cancelShipment(vendorOrderId)}
                      title="Undo this booking so a different courier can be picked - does not cancel the order"
                    >
                      <XCircle className="h-3 w-3" /> Change Courier
                    </button>
                  )}
                </div>
              )}

              {!NOT_CANCELLABLE_STATUSES.includes(status) && (
                <button
                  className="text-destructive inline-flex items-center gap-0.5 hover:underline text-xs"
                  onClick={() => setCancellingVendorOrderId(vendorOrderId)}
                >
                  <Ban className="h-3 w-3" /> Cancel Order
                </button>
              )}
            </div>
          );
        })}

      <Dialog open={!!cancellingVendorOrderId} onOpenChange={(open) => !open && setCancellingVendorOrderId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this vendor's order</DialogTitle>
            <DialogDescription>
              This genuinely cancels the customer's order for this vendor - triggers a real refund if
              paid online, and notifies the customer, vendor, and admins. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for cancelling (shown in the audit trail and notifications)..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancellingVendorOrderId(null)} disabled={cancelling}>
              Back
            </Button>
            <Button variant="destructive" onClick={confirmCancelOrder} disabled={cancelling || !cancelReason.trim()}>
              {cancelling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
