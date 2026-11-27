import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { formatMoney, orderRef } from "@/lib/format";

// The boutique cancels its own part of an order (client, 27 Nov 2026), until
// the courier picks it up. The customer gets everything they paid for it
// back to their original payment, with no fee (supabase/functions/
// vendor-cancel-order).

const REASONS = [
  "Out of stock",
  "Can't make it in time",
  "Piece damaged or has a defect",
  "Mistake in the price or listing",
  "Other",
];

export interface VendorCancellableOrder {
  id: string;
  order_id: string;
  subtotal: number;
  shipping_cost: number;
  discount_amount?: number;
  payment_method?: string;
  payment_status?: string;
}

export function VendorCancelOrderDialog({
  order,
  open,
  onOpenChange,
  onCancelled,
}: {
  order: VendorCancellableOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}) {
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // What the customer paid for this part: its items and delivery, less its
  // share of any coupon (the same sum the function refunds).
  const amount = Math.round((Number(order.subtotal) + Number(order.shipping_cost) - Number(order.discount_amount ?? 0)) * 100) / 100;
  const paid = order.payment_status === "paid" || order.payment_status === "partially_refunded";
  const refundLine =
    order.payment_method === "cod"
      ? "This is a Cash on Delivery order: the customer hasn't paid anything, so there is nothing to refund."
      : !paid
        ? "The customer hasn't paid for this order, so there is nothing to refund."
        : order.payment_method === "wallet"
          ? `The customer gets ${formatMoney(amount)} back in full to their AllBoutiqs wallet, where they paid from.`
          : `The customer gets ${formatMoney(amount)} back in full to their original payment (any part they paid from their AllBoutiqs wallet goes back to the wallet). No fee.`;

  const fullReason = reason === "Other" ? other.trim() : reason;

  const submit = async () => {
    if (!fullReason || fullReason.length < 3) {
      toast.error(reason === "Other" ? "Please write the reason" : "Please choose a reason");
      return;
    }
    setSubmitting(true);
    const { data, errorMessage } = await invokeEdgeFunction<{ cancelled: boolean; refund_error: string | null }>(
      "vendor-cancel-order",
      { vendor_order_id: order.id, reason: fullReason },
    );
    setSubmitting(false);
    if (errorMessage || !data?.cancelled) {
      toast.error(errorMessage || "Couldn't cancel this order");
      return;
    }
    if (data.refund_error) {
      toast.warning("Order cancelled. The refund didn't go through automatically - AllBoutiqs has been told and will refund the customer.", {
        duration: 10000,
      });
    } else {
      toast.success("Order cancelled. The customer and AllBoutiqs have been told.");
    }
    onOpenChange(false);
    onCancelled();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel order {orderRef(order.order_id)}?</DialogTitle>
          <DialogDescription>{refundLine}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Why are you cancelling?</Label>
            <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
              {REASONS.map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <RadioGroupItem value={r} id={`vendor-cancel-${r}`} />
                  <Label htmlFor={`vendor-cancel-${r}`} className="cursor-pointer text-sm font-normal">
                    {r}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {reason === "Other" && (
              <Textarea
                className="mt-2"
                rows={2}
                maxLength={500}
                placeholder="The reason"
                value={other}
                onChange={(e) => setOther(e.target.value)}
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            The customer sees only that the boutique couldn't fulfil the order, not your reason. This can't be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Keep the order
            </Button>
            <Button variant="destructive" onClick={submit} disabled={submitting || !reason}>
              {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Cancel order
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
