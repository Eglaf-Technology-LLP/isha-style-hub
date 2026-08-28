import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

// vendorOrderId/vendorOrderStatus are internal grouping keys only - the
// customer never sees a vendor name or grouping label anywhere in this
// dialog, just their own products.
export interface CancellableOrderItem {
  id: string;
  vendorOrderId: string;
  vendorOrderStatus: string;
  productTitle: string;
  variantTitle: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  price: number;
  image: string | null;
}

interface OrderCancellationDialogProps {
  items: CancellableOrderItem[];
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

const BLOCKED_STATUSES = ["delivered", "cancelled", "returned"];

export function OrderCancellationDialog({
  items,
  isPaidOnline,
  open,
  onOpenChange,
  onSuccess,
}: OrderCancellationDialogProps) {
  // Items that ship together (same underlying shipment) are always
  // selected/deselected as one unit - the customer picks products, but a
  // partially-packed shipment can't be split, so the group moves together.
  const groups = useMemo(() => {
    const byVendorOrder = new Map<string, CancellableOrderItem[]>();
    for (const item of items) {
      const list = byVendorOrder.get(item.vendorOrderId) ?? [];
      list.push(item);
      byVendorOrder.set(item.vendorOrderId, list);
    }
    return [...byVendorOrder.entries()].map(([vendorOrderId, groupItems]) => ({
      vendorOrderId,
      items: groupItems,
      blocked: BLOCKED_STATUSES.includes(groupItems[0].vendorOrderStatus),
    }));
  }, [items]);

  const [selectedGroupIds, setSelectedGroupIds] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.filter((g) => !g.blocked).map((g) => [g.vendorOrderId, true])),
  );
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toggleGroup = (vendorOrderId: string) => {
    setSelectedGroupIds((prev) => ({ ...prev, [vendorOrderId]: !prev[vendorOrderId] }));
  };

  const hasSelection = Object.values(selectedGroupIds).some(Boolean);

  const handleSubmit = async () => {
    if (!reason || !hasSelection) return;
    setSubmitting(true);

    const fullReason = reason === "Other" && notes.trim() ? notes.trim() : reason;
    const vendorOrderIds = groups.filter((g) => selectedGroupIds[g.vendorOrderId]).map((g) => g.vendorOrderId);

    const { data, errorMessage } = await invokeEdgeFunction<{
      cancelled: { vendor_order_id: string; refund_id: string | null; refund_error: string | null }[];
      skipped: { vendor_order_id: string; reason: string }[];
    }>("cancel-order-items", { vendor_order_ids: vendorOrderIds, reason: fullReason });

    setSubmitting(false);

    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    const cancelledCount = data?.cancelled.length ?? 0;
    const skippedCount = data?.skipped.length ?? 0;
    const anyRefundError = data?.cancelled.some((c) => c.refund_error);

    if (cancelledCount === 0) {
      toast.error("Nothing could be cancelled - those items have already progressed too far.");
    } else if (anyRefundError) {
      toast.warning(
        "Order cancelled, but your refund couldn't be processed automatically. Our team has been notified and will follow up.",
      );
    } else if (skippedCount > 0) {
      toast.success(`${cancelledCount} item${cancelledCount > 1 ? "s" : ""} cancelled. ${skippedCount} item${skippedCount > 1 ? "s" : ""} had already progressed too far to cancel.`);
    } else {
      toast.success(isPaidOnline ? "Order cancelled. Your refund is on its way." : "Order cancelled.");
    }

    setReason("");
    setNotes("");
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cancel Order</DialogTitle>
          <DialogDescription>Select the items you'd like to cancel. This can't be undone.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.vendorOrderId} className="space-y-1.5">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-2.5 border border-border rounded-lg ${group.blocked ? "opacity-60" : ""}`}
                  >
                    <Checkbox
                      checked={!group.blocked && !!selectedGroupIds[group.vendorOrderId]}
                      onCheckedChange={() => toggleGroup(group.vendorOrderId)}
                      disabled={group.blocked}
                    />
                    {item.image ? (
                      <img src={item.image} alt="" className="h-12 w-12 rounded-md object-cover shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded-md bg-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.productTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.variantTitle && <span>{item.variantTitle}</span>}
                        {item.size && <span> • Size: {item.size}</span>}
                        {item.color && <span> • Color: {item.color}</span>}
                        {" • "}Qty: {item.quantity} • ₹{(item.price * item.quantity).toFixed(2)}
                      </p>
                      {group.blocked && (
                        <p className="text-xs text-destructive mt-0.5">
                          Already {group.items[0].vendorOrderStatus} - can't be cancelled
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {group.items.length > 1 && !group.blocked && (
                  <p className="text-[11px] text-muted-foreground pl-2">These items ship together</p>
                )}
              </div>
            ))}
          </div>

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
            disabled={submitting || !reason || !hasSelection}
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Ban className="h-4 w-4 mr-2" />}
            Confirm Cancellation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
