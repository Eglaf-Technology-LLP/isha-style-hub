import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Ban } from "lucide-react";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

interface OrderCancellationDialogProps {
  vendorOrderId: string;
  vendorName: string;
  isPaidOnline: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const CANCEL_REASONS = [
  "Changed my mind",
  "Found a better price",
  "Ordering by mistake",
  "Delivery taking too long",
  "Other",
];

export function OrderCancellationDialog({
  vendorOrderId,
  vendorName,
  isPaidOnline,
  open,
  onOpenChange,
  onSuccess,
}: OrderCancellationDialogProps) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);

    const fullReason = reason === "Other" && notes.trim() ? notes.trim() : reason;
    const { data, errorMessage } = await invokeEdgeFunction<{
      cancelled: boolean;
      refund_error: string | null;
      was_already_shipped: boolean;
    }>("cancel-vendor-order", { vendor_order_id: vendorOrderId, reason: fullReason });

    setSubmitting(false);

    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    if (data?.refund_error) {
      toast.warning(
        "Order cancelled, but your refund couldn't be processed automatically. Our team has been notified and will follow up.",
      );
    } else {
      toast.success(
        isPaidOnline
          ? "Order cancelled. Your refund is on its way."
          : "Order cancelled.",
      );
    }

    setReason("");
    setNotes("");
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel Order</DialogTitle>
          <DialogDescription>
            Cancel the {vendorName} portion of this order. This can't be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label className="text-sm font-medium mb-2 block">Reason for cancelling</Label>
            <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
              {CANCEL_REASONS.map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <RadioGroupItem value={r} id={`cancel-reason-${r}`} />
                  <Label htmlFor={`cancel-reason-${r}`} className="cursor-pointer text-sm">
                    {r}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {reason === "Other" && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Tell us more (optional)</Label>
              <Textarea
                placeholder="What happened?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          )}

          {isPaidOnline && (
            <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
              This order was paid online - your refund will be initiated automatically to your
              original payment method as soon as you confirm.
            </p>
          )}

          <Button
            className="w-full"
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || !reason}
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Ban className="h-4 w-4 mr-2" />}
            Confirm Cancellation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
