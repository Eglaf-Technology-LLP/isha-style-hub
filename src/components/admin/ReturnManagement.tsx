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
import { format } from "date-fns";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  picked_up: { label: "Picked Up", variant: "outline" },
  completed: { label: "Completed", variant: "default" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

export function ReturnManagement() {
  const { returnRequests, loading, updateReturnStatus } = useReturnRequests(true);
  const [selectedRequest, setSelectedRequest] = useState<ReturnRequest | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [updating, setUpdating] = useState(false);

  const openDetail = (request: ReturnRequest) => {
    setSelectedRequest(request);
    setAdminNotes(request.admin_notes || "");
    setRefundAmount(request.refund_amount?.toString() || "0");
    setIsDetailOpen(true);
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
      <div className="flex flex-row items-center justify-between p-6 border-b border-border">
        <div>
          <h3 className="text-lg font-semibold">Returns & Exchanges</h3>
          <p className="text-sm text-muted-foreground">
            Manage customer return and exchange requests
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">
            {returnRequests.filter((r) => r.status === "pending").length} Pending
          </Badge>
        </div>
      </div>

      <CardContent className="p-0">
        {returnRequests.length === 0 ? (
          <div className="text-center py-12">
            <RotateCcw className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No return requests</h3>
            <p className="text-muted-foreground">
              Return and exchange requests will appear here
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
                {returnRequests.map((request) => {
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
                        <Button size="sm" variant="ghost" onClick={() => openDetail(request)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
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
                    {selectedRequest.items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between p-3 border border-border rounded-lg text-sm">
                        <div>
                          <p className="font-medium">{item.product_title}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.size && `Size: ${item.size}`}
                            {item.size && item.color && " • "}
                            {item.color && `Color: ${item.color}`}
                            {" • "}Qty: {item.quantity}
                          </p>
                        </div>
                        {item.price && <p className="font-medium">₹{(item.price * item.quantity).toFixed(2)}</p>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Exchange Details */}
                {selectedRequest.request_type === "exchange" && selectedRequest.exchange_details && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium mb-2">Exchange For</p>
                      <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                        {selectedRequest.exchange_details.new_size && (
                          <p>New Size: <span className="font-medium">{selectedRequest.exchange_details.new_size}</span></p>
                        )}
                        {selectedRequest.exchange_details.new_color && (
                          <p>New Color: <span className="font-medium">{selectedRequest.exchange_details.new_color}</span></p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Admin Actions */}
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
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
