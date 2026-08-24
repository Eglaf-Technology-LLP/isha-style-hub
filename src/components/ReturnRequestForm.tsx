import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, RotateCcw, ArrowLeftRight } from "lucide-react";
import { useReturnRequests, ReturnItem, ExchangeDetails } from "@/hooks/useReturnRequests";

interface OrderItem {
  id: string;
  product_title: string;
  variant_title: string | null;
  quantity: number;
  price: number;
  size: string | null;
  color: string | null;
  // Refund eligibility only, snapshotted at checkout - a non-returnable
  // item can still be selected for an exchange, just not a refund.
  is_returnable: boolean;
}

interface ReturnRequestFormProps {
  orderId: string;
  orderItems: OrderItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const RETURN_REASONS = [
  "Defective or damaged product",
  "Wrong item received",
  "Size doesn't fit",
  "Color is different from what was shown",
  "Product not as described",
  "Changed my mind",
  "Other",
];

export function ReturnRequestForm({
  orderId,
  orderItems,
  open,
  onOpenChange,
  onSuccess,
}: ReturnRequestFormProps) {
  const { createReturnRequest } = useReturnRequests();
  const [requestType, setRequestType] = useState<"return" | "exchange">("return");
  const [reason, setReason] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [exchangeDetails, setExchangeDetails] = useState<ExchangeDetails>({});
  const [submitting, setSubmitting] = useState(false);

  const toggleItem = (itemId: string, disabled: boolean) => {
    if (disabled) return;
    setSelectedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // Switching to "Return & Refund" auto-deselects any non-returnable item
  // the customer had picked while browsing in exchange mode - a
  // non-returnable item is only ever a valid selection for an exchange.
  const changeRequestType = (v: "return" | "exchange") => {
    setRequestType(v);
    if (v === "return") {
      setSelectedItems((prev) => {
        const next = { ...prev };
        orderItems.forEach((item) => {
          if (!item.is_returnable) next[item.id] = false;
        });
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    const chosen = orderItems.filter((item) => selectedItems[item.id]);
    if (chosen.length === 0) {
      return;
    }
    if (!reason) return;

    setSubmitting(true);
    const items: ReturnItem[] = chosen.map((item) => ({
      order_item_id: item.id,
      product_title: item.product_title,
      quantity: item.quantity,
      size: item.size,
      color: item.color,
      price: item.price,
    }));

    const success = await createReturnRequest({
      order_id: orderId,
      request_type: requestType,
      reason,
      additional_notes: additionalNotes || undefined,
      items,
      exchange_details: requestType === "exchange" ? exchangeDetails : undefined,
    });

    setSubmitting(false);
    if (success) {
      onOpenChange(false);
      onSuccess?.();
    }
  };

  const hasSelection = Object.values(selectedItems).some(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Return / Exchange</DialogTitle>
          <DialogDescription>
            Select items and provide a reason for your request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Request Type */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Request Type</Label>
            <RadioGroup
              value={requestType}
              onValueChange={(v) => changeRequestType(v as "return" | "exchange")}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2 border border-border rounded-lg p-3 flex-1 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="return" id="return" />
                <Label htmlFor="return" className="cursor-pointer flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Return & Refund
                </Label>
              </div>
              <div className="flex items-center gap-2 border border-border rounded-lg p-3 flex-1 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="exchange" id="exchange" />
                <Label htmlFor="exchange" className="cursor-pointer flex items-center gap-2">
                  <ArrowLeftRight className="h-4 w-4" />
                  Exchange
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Select Items */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Select Items</Label>
            <div className="space-y-2">
              {orderItems.map((item) => {
                const disabled = requestType === "return" && !item.is_returnable;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 border border-border rounded-lg ${disabled ? "opacity-60" : ""}`}
                  >
                    <Checkbox
                      checked={!!selectedItems[item.id]}
                      onCheckedChange={() => toggleItem(item.id, disabled)}
                      disabled={disabled}
                    />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.product_title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.size && `Size: ${item.size}`}
                        {item.size && item.color && " • "}
                        {item.color && `Color: ${item.color}`}
                        {" • "}Qty: {item.quantity} • ₹{(item.price * item.quantity).toFixed(2)}
                      </p>
                      {disabled && (
                        <p className="text-xs text-destructive mt-0.5">
                          Not eligible for refund - exchange only
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reason */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Reason</Label>
            <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
              {RETURN_REASONS.map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <RadioGroupItem value={r} id={`reason-${r}`} />
                  <Label htmlFor={`reason-${r}`} className="cursor-pointer text-sm">
                    {r}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Exchange Details */}
          {requestType === "exchange" && (
            <div className="space-y-3">
              <Label className="text-sm font-medium block">Exchange For</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">New Size</Label>
                  <Input
                    placeholder="e.g. L, XL"
                    value={exchangeDetails.new_size || ""}
                    onChange={(e) =>
                      setExchangeDetails((prev) => ({ ...prev, new_size: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">New Color</Label>
                  <Input
                    placeholder="e.g. Blue"
                    value={exchangeDetails.new_color || ""}
                    onChange={(e) =>
                      setExchangeDetails((prev) => ({ ...prev, new_color: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Additional Notes */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Additional Notes (Optional)</Label>
            <Textarea
              placeholder="Any additional details..."
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              rows={3}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={submitting || !hasSelection || !reason}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit {requestType === "return" ? "Return" : "Exchange"} Request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
