import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Ban } from "lucide-react";
import { useOrderCancellations } from "@/hooks/useOrderCancellations";
import { format } from "date-fns";
import { VendorOrderDetailsDialog } from "./VendorOrderDetailsDialog";
import { useFlashFocus } from "@/hooks/useDeepLink";

const refundStatusClass: Record<string, string> = {
  processed: "bg-green-100 text-green-800",
  processing: "bg-amber-100 text-amber-800",
  initiated: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
};

interface CancelledOrdersManagementProps {
  isAdmin: boolean;
}

// A dedicated view of order_cancellations rather than a status filter on the
// flat Orders tab - a per-vendor partial cancellation never flips the
// parent orders.order_status, so it would never show up there at all.
export function CancelledOrdersManagement({ isAdmin }: CancelledOrdersManagementProps) {
  const { cancellations, loading } = useOrderCancellations(isAdmin);
  useFlashFocus(!loading);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const alreadyShippedCount = cancellations.filter((c) => c.wasAlreadyShipped).length;

  return (
    <Card>
      <div className="flex flex-row items-center justify-between p-6 border-b border-border flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold">Cancelled Orders</h3>
          <p className="text-sm text-muted-foreground">
            Every full or per-vendor cancellation, with its reason, refund, and whether the courier had already picked it up
          </p>
        </div>
        {alreadyShippedCount > 0 && (
          <Badge variant="destructive">{alreadyShippedCount} already shipped</Badge>
        )}
      </div>

      <CardContent className="p-0">
        {cancellations.length === 0 ? (
          <div className="text-center py-12">
            <Ban className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No cancellations yet</h3>
            <p className="text-muted-foreground">Cancelled orders and shipments will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Shipped?</TableHead>
                  <TableHead>Refund</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cancellations.map((c, idx) => (
                  <TableRow key={c.id} data-focus-id={`${c.vendorOrderId ?? ""} ${c.orderId}`.trim()}>
                    <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(c.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.orderId.slice(0, 8)}</TableCell>
                    <TableCell className="text-sm">
                      <div>{c.customerName}</div>
                      <div className="text-xs text-muted-foreground">{c.customerEmail}</div>
                    </TableCell>
                    <TableCell className="text-sm">{c.vendorName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate" title={c.reason ?? ""}>
                      {c.reason || "—"}
                    </TableCell>
                    <TableCell>
                      {c.wasAlreadyShipped ? (
                        <Badge variant="destructive">Yes</Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.refundAmount != null ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">₹{c.refundAmount.toFixed(2)}</span>
                          <Badge
                            variant="outline"
                            className={refundStatusClass[c.refundStatus ?? ""] || "bg-muted"}
                          >
                            {c.refundStatus}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <VendorOrderDetailsDialog vendorOrderId={c.vendorOrderId} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
