import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { RefundReceiptDialog } from "@/components/RefundReceiptDialog";
import { formatDateTime, formatDateTimeInWords } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { REFUND_STATE_STYLE, refundDestinationText, useOrderRefunds, type RefundState } from "@/hooks/useOrderRefunds";

// Read-only refund timeline for one order - in the admin Payments and Returns
// tabs, the boutique's Orders (Refunds › Details, its own part only via
// vendorOrderId) and the customer's My Orders. Each refund says where it went
// (AllBoutiqs Wallet or the original payment) and whether it is "Refund
// processing" (amber) or "Refunded" (green), the same words everywhere
// (client, 27 Nov 2026). A wallet refund is credited at once; a gateway one
// is "Refunded" when the gateway processed it - the bank-side credit can lag
// further, which is the honest limit of what Razorpay's webhook tells us.
// inWords / forCustomer: the customer's My Orders (dates in words, "your").
export function RefundHistory({
  orderId,
  inWords = false,
  vendorOrderId,
  forCustomer = false,
}: {
  orderId: string;
  inWords?: boolean;
  vendorOrderId?: string | null;
  forCustomer?: boolean;
}) {
  const when = inWords ? formatDateTimeInWords : formatDateTime;
  const { byOrder, loading } = useOrderRefunds([orderId], vendorOrderId);
  const entries = byOrder.get(orderId) ?? [];
  const whose = forCustomer ? "your" : "the customer's";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        // A customer isn't shown "failed": AllBoutiqs sorts it out, the money
        // is still on its way to them.
        const state: RefundState = forCustomer && entry.state === "failed" ? "processing" : entry.state;
        const style = REFUND_STATE_STYLE[state];
        const refund = entry.gateway;
        const where = entry.destination ? refundDestinationText([entry.destination], whose) : "";
        return (
          <div key={entry.id} className="p-3 border border-border rounded-lg text-sm space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{formatMoney(entry.amount)}</span>
              <Badge variant="outline" className={cn("whitespace-nowrap", style.className)}>
                {style.label}
              </Badge>
            </div>
            <p className="text-xs">
              {where
                ? `${state === "refunded" ? "Refunded" : "Being refunded"} ${where}`
                : "Not sent yet - AllBoutiqs is sorting it out"}
            </p>
            {entry.reason && <p className="text-muted-foreground">{entry.reason}</p>}
            <p className="text-xs text-muted-foreground">
              {entry.destination === "wallet" ? "Credited" : "Started"} on {when(new Date(entry.at))}
            </p>
            {refund?.razorpay_refund_id && (
              <p className="text-xs text-muted-foreground font-mono">Razorpay refund #{refund.razorpay_refund_id}</p>
            )}
            {refund?.status === "processed" && refund.gateway_processed_at && (
              <p className="text-xs text-green-700">
                Processed by the payment gateway on {when(new Date(refund.gateway_processed_at))} - the bank can take a
                few more days to show it.
              </p>
            )}
            {refund?.status === "failed" && refund.failure_reason && !forCustomer && (
              <p className="text-xs text-destructive">Failed: {refund.failure_reason}</p>
            )}
            {refund?.status === "processed" && (
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
