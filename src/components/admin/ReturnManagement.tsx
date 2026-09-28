import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Loader2,
  Eye,
  RotateCcw,
  ArrowLeftRight,
  CheckCircle,
  XCircle,
  Truck,
} from "lucide-react";
import { useReturnRequests, ReturnRequest } from "@/hooks/useReturnRequests";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { VendorFilterSelect } from "./VendorFilterSelect";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { RefundHistory } from "@/components/RefundHistory";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/PaginationBar";
import { VendorOrderDetailsDialog } from "./VendorOrderDetailsDialog";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  picked_up: { label: "Picked Up", variant: "outline" },
  completed: { label: "Completed", variant: "default" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  pickup_failed: { label: "Pickup Failed - Needs Attention", variant: "destructive" },
};

interface ReturnManagementProps {
  // Vendor's own Returns tab: RLS already scopes visibility to their own
  // items, this just hides the admin-only actions (approve/reject/status
  // changes/refund/retry) - approval stays admin-only, unchanged.
  readOnly?: boolean;
}

export function ReturnManagement({ readOnly = false }: ReturnManagementProps) {
  const { returnRequests, loading, updateReturnStatus } = useReturnRequests(true);
  const [selectedRequest, setSelectedRequest] = useState<ReturnRequest | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [updating, setUpdating] = useState(false);
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [hasShipment, setHasShipment] = useState<boolean | null>(null);
  const [retrying, setRetrying] = useState(false);

  const visibleRequests = vendorFilter
    ? returnRequests.filter((r) => r.vendorIds.includes(vendorFilter))
    : returnRequests;
  const { page, setPage, totalPages, paginatedItems, totalItems, pageSize } = usePagination(visibleRequests, 10);

  const openDetail = async (request: ReturnRequest) => {
    setSelectedRequest(request);
    setAdminNotes(request.admin_notes || "");
    // Default to the actual value of the items the customer selected,
    // rather than always "0" - previously this field had zero relationship
    // to what was in `items`, so an admin could accidentally refund the
    // wrong amount. Still freely editable below; a previously-saved value
    // takes priority over recomputing (don't clobber an admin's own entry).
    const itemsTotal = (request.items || []).reduce(
      (sum, item) => sum + (item.price ?? 0) * item.quantity,
      0
    );
    setRefundAmount(
      request.refund_amount
        ? request.refund_amount.toString()
        : request.request_type === "return"
          ? itemsTotal.toFixed(2)
          : "0"
    );
    setHasShipment(null);
    setIsDetailOpen(true);

    if (!readOnly && request.status === "approved") {
      const { data } = await supabase
        .from("shipments")
        .select("id")
        .eq("return_request_id", request.id)
        .maybeSingle();
      setHasShipment(!!data);
    }
  };

  // approve already fires this once; this just re-invokes the same
  // idempotent function for a return stuck "approved" with no shipment -
  // both edge functions already guard against double-booking via
  // return_request_id, so calling again is safe.
  const retryCourierBooking = async () => {
    if (!selectedRequest) return;
    setRetrying(true);
    const fnName =
      selectedRequest.request_type === "exchange" ? "shiprocket-create-exchange" : "shiprocket-create-return";
    const { errorMessage } = await invokeEdgeFunction(fnName, { return_request_id: selectedRequest.id });
    setRetrying(false);
    if (errorMessage) {
      toast.error(`Retry failed: ${errorMessage}`);
    } else {
      toast.success("Reverse pickup scheduled with the courier");
      setHasShipment(true);
    }
  };

  const handleStatusUpdate = async (status: ReturnRequest["status"]) => {
    if (!selectedRequest) return;
    setUpdating(true);
    const refundVal = parseFloat(refundAmount) || 0;
    const success = await updateReturnStatus(
      selectedRequest.id,
      status,
      adminNotes,
      refundVal
    );
    if (success) {
      setSelectedRequest((prev) =>
        prev ? { ...prev, status, admin_notes: adminNotes, refund_amount: refundVal } : null
      );

      // Approving books the real reverse pickup - the status change
      // itself already succeeded above regardless of what happens here,
      // so a courier-side failure surfaces as a toast to retry, not a
      // rollback of the approval.
      if (status === "approved") {
        const fnName =
          selectedRequest.request_type === "exchange" ? "shiprocket-create-exchange" : "shiprocket-create-return";
        const { errorMessage } = await invokeEdgeFunction(fnName, {
          return_request_id: selectedRequest.id,
        });
        if (errorMessage) {
          toast.error(`Approved, but scheduling the courier pickup failed: ${errorMessage}`);
        } else {
          toast.success("Reverse pickup scheduled with the courier");
        }
      }

      // The real gateway refund only fires once the item is actually back
      // (status "completed") - not on approval, when the customer hasn't
      // shipped anything back yet. Before this, refundVal was only ever
      // written to return_requests.refund_amount, a number nobody acted
      // on; this is the fix, same create-razorpay-refund path the admin
      // Payments tab uses.
      if (status === "completed" && refundVal > 0) {
        const { errorMessage } = await invokeEdgeFunction("create-razorpay-refund", {
          order_id: selectedRequest.order_id,
          amount: refundVal,
          reason: adminNotes || selectedRequest.reason,
          return_request_id: selectedRequest.id,
        });
        if (errorMessage) {
          toast.error(`Marked completed, but the refund failed: ${errorMessage}`);
        } else {
          toast.success(`₹${refundVal} refund submitted to Razorpay`);
        }
      }

      // Send email notification to customer
      try {
        await supabase.functions.invoke("send-return-status-email", {
          body: {
            returnRequestId: selectedRequest.id,
            newStatus: status,
            adminNotes,
            refundAmount: refundVal,
          },
        });
      } catch (e) {
        console.error("Failed to send return status email:", e);
      }
    }
    setUpdating(false);
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
      <div className="flex flex-row items-center justify-between p-6 border-b border-border flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold">Returns & Exchanges</h3>
          <p className="text-sm text-muted-foreground">
            {readOnly ? "Return and exchange requests for your products" : "Manage customer return and exchange requests"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && <VendorFilterSelect value={vendorFilter} onChange={setVendorFilter} />}
          <Badge variant="secondary">
            {visibleRequests.filter((r) => r.status === "pending").length} Pending
          </Badge>
        </div>
      </div>

      <CardContent className="p-0">
        {visibleRequests.length === 0 ? (
          <div className="text-center py-12">
            <RotateCcw className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {returnRequests.length === 0 ? "No return requests" : "No return requests for this vendor"}
            </h3>
            <p className="text-muted-foreground">
              {returnRequests.length === 0
                ? "Return and exchange requests will appear here"
                : "Try selecting a different vendor"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((request) => {
                  const config = statusConfig[request.status] || statusConfig.pending;
                  return (
                    <TableRow key={request.id}>
                      <TableCell className="font-mono text-sm">
                        {request.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(request.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {request.request_type === "return" ? (
                            <RotateCcw className="h-3 w-3" />
                          ) : (
                            <ArrowLeftRight className="h-3 w-3" />
                          )}
                          {request.request_type === "return" ? "Return" : "Exchange"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {request.order_id.slice(0, 8)}
                      </TableCell>
                      <TableCell>{request.items?.length || 0} items</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {request.reason}
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.variant}>{config.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          <Button size="sm" variant="ghost" onClick={() => openDetail(request)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {request.vendorOrderIds.map((vendorOrderId) => (
                            <VendorOrderDetailsDialog key={vendorOrderId} vendorOrderId={vendorOrderId} triggerLabel="View Order" />
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="px-6 pb-6">
          <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} totalItems={totalItems} pageSize={pageSize} />
        </div>
      </CardContent>

      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedRequest?.request_type === "return" ? "Return" : "Exchange"} Request Details
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-5">
                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Request ID</p>
                    <p className="font-mono">{selectedRequest.id.slice(0, 12)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Order ID</p>
                    <p className="font-mono">{selectedRequest.order_id.slice(0, 12)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Date</p>
                    <p>{format(new Date(selectedRequest.created_at), "PPP 'at' p")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge variant={statusConfig[selectedRequest.status]?.variant || "secondary"}>
                      {statusConfig[selectedRequest.status]?.label || selectedRequest.status}
                    </Badge>
                  </div>
                </div>

                <Separator />

                {/* Reason */}
                <div>
                  <p className="text-sm font-medium mb-1">Reason</p>
                  <p className="text-sm bg-muted p-3 rounded-lg">{selectedRequest.reason}</p>
                </div>

                {selectedRequest.additional_notes && (
                  <div>
                    <p className="text-sm font-medium mb-1">Customer Notes</p>
                    <p className="text-sm bg-muted p-3 rounded-lg">{selectedRequest.additional_notes}</p>
                  </div>
                )}

                <Separator />

                {/* Items */}
                <div>
                  <p className="text-sm font-medium mb-2">Items</p>
                  <div className="space-y-2">
                    {selectedRequest.items?.map((item, idx) => {
                      // Older requests only ever had one request-level
                      // exchange_details target; new ones carry it per
                      // item. Fall back so historical rows still display.
                      const exchangeTo =
                        item.exchange_to ??
                        (selectedRequest.exchange_details
                          ? {
                              size: selectedRequest.exchange_details.new_size ?? null,
                              color: selectedRequest.exchange_details.new_color ?? null,
                            }
                          : null);
                      return (
                        <div key={idx} className="flex gap-3 p-3 border border-border rounded-lg text-sm">
                          {item.photo_url ? (
                            <img
                              src={item.photo_url}
                              alt=""
                              className="h-14 w-14 rounded-md object-cover border border-border shrink-0 cursor-pointer"
                              onClick={() => window.open(item.photo_url, "_blank")}
                            />
                          ) : (
                            <div className="h-14 w-14 rounded-md bg-muted shrink-0 flex items-center justify-center text-[10px] text-muted-foreground text-center">
                              No photo
                            </div>
                          )}
                          <div className="flex-1 flex justify-between">
                            <div>
                              <p className="font-medium">{item.product_title}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.size && `Size: ${item.size}`}
                                {item.size && item.color && " • "}
                                {item.color && `Color: ${item.color}`}
                                {" • "}Qty: {item.quantity}
                              </p>
                              {selectedRequest.request_type === "exchange" && exchangeTo && (exchangeTo.size || exchangeTo.color) && (
                                <p className="text-xs text-primary mt-0.5">
                                  Exchange for: {[exchangeTo.size, exchangeTo.color].filter(Boolean).join(" / ")}
                                </p>
                              )}
                            </div>
                            {item.price && <p className="font-medium shrink-0">₹{(item.price * item.quantity).toFixed(2)}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                {!readOnly ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Admin Response</p>
                    <div>
                      <Label className="text-xs text-muted-foreground">Admin Notes</Label>
                      <Textarea
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder="Add notes about this request..."
                        rows={3}
                      />
                    </div>
                    {selectedRequest.request_type === "return" && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Refund Amount (₹)</Label>
                        <Input
                          type="number"
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                          placeholder="0"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Submitted to Razorpay as a real refund only once this request is marked
                          Completed.
                        </p>
                      </div>
                    )}
                    <RefundHistory orderId={selectedRequest.order_id} />

                    {selectedRequest.status === "approved" && hasShipment === false && (
                      <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                        <p className="text-xs text-destructive flex-1">
                          No courier pickup has been booked for this request yet - the original
                          scheduling attempt may have failed.
                        </p>
                        <Button size="sm" variant="destructive" onClick={retryCourierBooking} disabled={retrying} className="gap-1 shrink-0">
                          {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                          Retry Courier Booking
                        </Button>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-2">
                      {selectedRequest.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleStatusUpdate("approved")}
                            disabled={updating}
                            className="gap-1"
                          >
                            {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleStatusUpdate("rejected")}
                            disabled={updating}
                            className="gap-1"
                          >
                            {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                            Reject
                          </Button>
                        </>
                      )}
                      {selectedRequest.status === "approved" && (
                        <Button
                          size="sm"
                          onClick={() => handleStatusUpdate("picked_up")}
                          disabled={updating}
                          className="gap-1"
                        >
                          {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                          Mark Picked Up
                        </Button>
                      )}
                      {(selectedRequest.status === "picked_up" || selectedRequest.status === "approved") && (
                        <Button
                          size="sm"
                          onClick={() => handleStatusUpdate("completed")}
                          disabled={updating}
                          className="gap-1"
                        >
                          {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                          Mark Completed
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  selectedRequest.admin_notes && (
                    <div>
                      <p className="text-sm font-medium mb-1">Note from our team</p>
                      <p className="text-sm bg-muted p-3 rounded-lg">{selectedRequest.admin_notes}</p>
                    </div>
                  )
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
