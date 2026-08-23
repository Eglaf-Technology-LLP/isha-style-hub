import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Order } from "@/hooks/useOrders";
import { useShipments } from "@/hooks/useShipments";
import { ShipmentTimelineDialog } from "./ShipmentTimelineDialog";
import { ShipNowDialog } from "./ShipNowDialog";

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

  const groups = new Map<string, { vendorId: string | null; items: typeof order.order_items }>();
  (order.order_items ?? []).forEach((item) => {
    const key = item.vendor_order_id ?? `no-vendor-${item.id}`;
    if (!groups.has(key)) groups.set(key, { vendorId: item.vendor_id, items: [] });
    groups.get(key)!.items.push(item);
  });
  const vendorOrderIds = [...groups.keys()].filter((k) => !k.startsWith("no-vendor-"));

  const { forwardShipmentFor, actioningId, checkServiceability, shipNow, cancelShipment } = useShipments(vendorOrderIds);

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
    if (vendorOrderIds.length > 0) {
      supabase
        .from("vendor_orders")
        .select("id, status")
        .in("id", vendorOrderIds)
        .then(({ data }) => {
          setVendorOrderStatuses(Object.fromEntries((data ?? []).map((vo) => [vo.id, vo.status])));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

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
                    >
                      <XCircle className="h-3 w-3" /> Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
