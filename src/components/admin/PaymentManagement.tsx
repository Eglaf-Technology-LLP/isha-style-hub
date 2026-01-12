import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Wallet,
  Loader2,
  CheckCircle,
  XCircle,
  RotateCcw,
  TrendingUp,
  Clock,
  AlertCircle,
} from "lucide-react";
import { usePayments, Payment } from "@/hooks/usePayments";
import { format } from "date-fns";

interface PaymentManagementProps {
  isAdmin: boolean;
}

export function PaymentManagement({ isAdmin }: PaymentManagementProps) {
  const {
    payments,
    loading,
    markPaymentComplete,
    markPaymentFailed,
    processRefund,
    getPaymentStats,
  } = usePayments(isAdmin);

  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const stats = getPaymentStats();

  const getStatusBadge = (status: Payment["payment_status"]) => {
    switch (status) {
      case "completed":
        return <Badge variant="default">Completed</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "refunded":
        return <Badge variant="secondary">Refunded</Badge>;
      case "partially_refunded":
        return <Badge variant="secondary">Partial Refund</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const openRefundDialog = (payment: Payment) => {
    setSelectedPayment(payment);
    setRefundAmount(String(payment.amount - payment.refund_amount));
    setRefundReason("");
    setRefundDialogOpen(true);
  };

  const handleRefund = async () => {
    if (!selectedPayment || !refundAmount || !refundReason) return;

    setIsProcessing(true);
    const result = await processRefund(
      selectedPayment.id,
      parseFloat(refundAmount),
      refundReason
    );
    setIsProcessing(false);

    if (result) {
      setRefundDialogOpen(false);
      setSelectedPayment(null);
      setRefundAmount("");
      setRefundReason("");
    }
  };

  const handleMarkComplete = async (paymentId: string) => {
    setIsProcessing(true);
    await markPaymentComplete(paymentId);
    setIsProcessing(false);
  };

  const handleMarkFailed = async (paymentId: string) => {
    setIsProcessing(true);
    await markPaymentFailed(paymentId);
    setIsProcessing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Total Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">
              ₹{stats.totalReceived.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.completedCount} payments
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">₹{stats.totalPending.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">
              {stats.pendingCount} payments
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
              Refunded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">
              ₹{stats.totalRefunded.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.refundedCount} refunds
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Net Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">
              ₹{(stats.totalReceived - stats.totalRefunded).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payments Table */}
      <Card>
        <div className="flex flex-row items-center justify-between p-6 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold">Payment History</h3>
            <p className="text-sm text-muted-foreground">
              View and manage all payments
            </p>
          </div>
        </div>

        <CardContent className="p-0">
          {payments.length === 0 ? (
            <div className="text-center py-12">
              <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No payments yet</h3>
              <p className="text-muted-foreground">
                Payments will appear here when orders are placed
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-sm">
                        {format(new Date(payment.created_at), "MMM d, yyyy")}
                        <br />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(payment.created_at), "h:mm a")}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {payment.order_id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {payment.order?.customer_name || "N/A"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {payment.order?.customer_email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="uppercase text-xs">
                        {payment.payment_method}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            ₹{payment.amount.toFixed(2)}
                          </p>
                          {payment.refund_amount > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Refunded: ₹{payment.refund_amount.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(payment.payment_status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {payment.payment_status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleMarkComplete(payment.id)}
                                disabled={isProcessing}
                                title="Mark as Completed"
                              >
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleMarkFailed(payment.id)}
                                disabled={isProcessing}
                                title="Mark as Failed"
                              >
                                <XCircle className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                          {payment.payment_status === "completed" &&
                            payment.refund_amount < payment.amount && (
                              <Dialog
                                open={
                                  refundDialogOpen &&
                                  selectedPayment?.id === payment.id
                                }
                                onOpenChange={(open) => {
                                  if (!open) {
                                    setRefundDialogOpen(false);
                                    setSelectedPayment(null);
                                  }
                                }}
                              >
                                <DialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openRefundDialog(payment)}
                                    title="Process Refund"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Process Refund</DialogTitle>
                                    <DialogDescription>
                                      Refund payment for order #
                                      {payment.order_id.slice(0, 8)}
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4 mt-4">
                                    <div className="p-4 bg-muted rounded-lg">
                                      <p className="text-sm">
                                        <strong>Original Amount:</strong> ₹
                                        {payment.amount.toFixed(2)}
                                      </p>
                                      {payment.refund_amount > 0 && (
                                        <p className="text-sm">
                                          <strong>Already Refunded:</strong> ₹
                                          {payment.refund_amount.toFixed(2)}
                                        </p>
                                      )}
                                      <p className="text-sm">
                                        <strong>Available for Refund:</strong> ₹
                                        {(
                                          payment.amount - payment.refund_amount
                                        ).toFixed(2)}
                                      </p>
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Refund Amount (₹)</Label>
                                      <Input
                                        type="number"
                                        min="0.01"
                                        max={payment.amount - payment.refund_amount}
                                        step="0.01"
                                        value={refundAmount}
                                        onChange={(e) =>
                                          setRefundAmount(e.target.value)
                                        }
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Reason for Refund *</Label>
                                      <Textarea
                                        placeholder="Enter the reason for this refund..."
                                        value={refundReason}
                                        onChange={(e) =>
                                          setRefundReason(e.target.value)
                                        }
                                        rows={3}
                                      />
                                    </div>
                                    <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                      <p>
                                        This action cannot be undone. The refund
                                        will be recorded in the system.
                                      </p>
                                    </div>
                                    <div className="flex justify-end gap-3">
                                      <Button
                                        variant="outline"
                                        onClick={() => setRefundDialogOpen(false)}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        onClick={handleRefund}
                                        disabled={
                                          isProcessing ||
                                          !refundAmount ||
                                          !refundReason
                                        }
                                      >
                                        {isProcessing && (
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        )}
                                        Process Refund
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                          {payment.transaction_id && (
                            <span
                              className="text-xs text-muted-foreground ml-2"
                              title={`Transaction ID: ${payment.transaction_id}`}
                            >
                              #{payment.transaction_id.slice(0, 8)}
                            </span>
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
      </Card>
    </div>
  );
}
