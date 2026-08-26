import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useRefunds } from "@/hooks/useRefunds";
import { RefundReceiptDialog } from "@/components/RefundReceiptDialog";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  initiated: { label: "Initiated", variant: "secondary" },
  processing: { label: "Processing", variant: "outline" },
  processed: { label: "Processed", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
};

// Read-only refund timeline for one order - reused as-is in the admin
// Payments tab (alongside the trigger dialog), the vendor dashboard
// (read-only, RLS-scoped to the vendor's own sales), and customer order
// history. Deliberately doesn't claim to know when the bank actually
// credited the customer - "processed by gateway" is the honest limit of
// what Razorpay's webhook tells us; the bank-side credit can lag further.
export function RefundHistory({ orderId }: { orderId: string }) {
  const { refunds, loading } = useRefunds(orderId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (refunds.length === 0) return null;

  return (
    <div className="space-y-2">
      {refunds.map((refund) => {
        const config = statusConfig[refund.status] || statusConfig.initiated;
        return (
          <div key={refund.id} className="p-3 border border-border rounded-lg text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">₹{refund.amount.toFixed(2)}</span>
              <Badge variant={config.variant}>{config.label}</Badge>
            </div>
            <p className="text-muted-foreground">{refund.reason}</p>
            <p className="text-xs text-muted-foreground">
              {refund.initiated_by ? "Initiated by admin" : "Issued directly in Razorpay dashboard"} on{" "}
              {format(new Date(refund.initiated_at), "MMM d, yyyy 'at' h:mm a")}
            </p>
            {refund.razorpay_refund_id && (
              <p className="text-xs text-muted-foreground font-mono">Razorpay refund #{refund.razorpay_refund_id}</p>
            )}
            {refund.status === "processed" && refund.gateway_processed_at && (
              <p className="text-xs text-green-700">
                Processed by gateway on {format(new Date(refund.gateway_processed_at), "MMM d, yyyy 'at' h:mm a")} -
                bank credit can take a few more days to reflect.
              </p>
            )}
            {refund.status === "failed" && refund.failure_reason && (
              <p className="text-xs text-destructive">Failed: {refund.failure_reason}</p>
            )}
            {refund.status === "processed" && (
              <div className="pt-1">
                <RefundReceiptDialog refund={refund} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
