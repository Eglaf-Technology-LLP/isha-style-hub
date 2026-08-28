import { useState } from "react";
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
import { Loader2, RotateCcw, ArrowLeftRight, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useReturnRequests, ReturnItem } from "@/hooks/useReturnRequests";
import { VariantSelector } from "@/components/VariantSelector";
import { fetchExchangeableVariants, ExchangeVariantOption } from "@/lib/exchangeVariants";
import { supabase } from "@/integrations/supabase/client";

interface OrderItem {
  id: string;
  product_id: string;
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

interface ExchangeTarget {
  size: string | null;
  color: string | null;
}

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
  const [submitting, setSubmitting] = useState(false);

  const [itemPhotoUrls, setItemPhotoUrls] = useState<Record<string, string>>({});
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);

  const [exchangeTargets, setExchangeTargets] = useState<Record<string, ExchangeTarget>>({});
  const [variantsByProductId, setVariantsByProductId] = useState<Record<string, ExchangeVariantOption[]>>({});
  const [loadingVariantsForProductId, setLoadingVariantsForProductId] = useState<Record<string, boolean>>({});

  const ensureVariantsLoaded = async (productId: string) => {
    if (variantsByProductId[productId] || loadingVariantsForProductId[productId]) return;
    setLoadingVariantsForProductId((prev) => ({ ...prev, [productId]: true }));
    try {
      const variants = await fetchExchangeableVariants(productId);
      setVariantsByProductId((prev) => ({ ...prev, [productId]: variants }));
    } catch {
      toast.error("Couldn't load available sizes/colors for one of the items");
    } finally {
      setLoadingVariantsForProductId((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const toggleItem = (item: OrderItem, disabled: boolean) => {
    if (disabled) return;
    setSelectedItems((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
    if (requestType === "exchange" && !selectedItems[item.id]) {
      ensureVariantsLoaded(item.product_id);
    }
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
    } else {
      orderItems.forEach((item) => {
        if (selectedItems[item.id]) ensureVariantsLoaded(item.product_id);
      });
    }
  };

  const handlePhotoSelect = async (itemId: string, file: File | undefined) => {
    if (!file) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Please sign in to upload a photo");
      return;
    }
    setUploadingItemId(itemId);
    try {
      const path = `${session.user.id}/returns/${itemId}-${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("category-images").upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("category-images").getPublicUrl(path);
      setItemPhotoUrls((prev) => ({ ...prev, [itemId]: urlData.publicUrl }));
    } catch {
      toast.error("Photo upload failed - please try again");
    } finally {
      setUploadingItemId(null);
    }
  };

  const setExchangeTarget = (itemId: string, patch: Partial<ExchangeTarget>) => {
    setExchangeTargets((prev) => ({
      ...prev,
      [itemId]: { size: null, color: null, ...prev[itemId], ...patch },
    }));
  };

  const handleSubmit = async () => {
    const chosen = orderItems.filter((item) => selectedItems[item.id]);
    if (chosen.length === 0 || !reason) return;

    if (chosen.some((item) => !itemPhotoUrls[item.id])) {
      toast.error("Please upload a photo (with the tag attached) for every selected item");
      return;
    }

    if (requestType === "exchange") {
      for (const item of chosen) {
        const variants = variantsByProductId[item.product_id] ?? [];
        const inStock = variants.filter((v) => v.stock > 0);
        const needsSize = variants.some((v) => v.size);
        const needsColor = variants.some((v) => v.color);
        const target = exchangeTargets[item.id];
        if (inStock.length === 0 && variants.length > 0) {
          toast.error(`Nothing is currently in stock to exchange "${item.product_title}" into`);
          return;
        }
        if (needsSize && !target?.size) {
          toast.error(`Please pick a size to exchange "${item.product_title}" into`);
          return;
        }
        if (needsColor && !target?.color) {
          toast.error(`Please pick a color to exchange "${item.product_title}" into`);
          return;
        }
      }
    }

    setSubmitting(true);
    const items: ReturnItem[] = chosen.map((item) => ({
      order_item_id: item.id,
      product_title: item.product_title,
      quantity: item.quantity,
      size: item.size,
      color: item.color,
      price: item.price,
      photo_url: itemPhotoUrls[item.id],
      exchange_to: requestType === "exchange" ? (exchangeTargets[item.id] ?? { size: null, color: null }) : undefined,
    }));

    const success = await createReturnRequest({
      order_id: orderId,
      request_type: requestType,
      reason,
      additional_notes: additionalNotes || undefined,
      items,
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

          {/* Tag instruction - required for either request type */}
          <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Please photograph each item together with its original tag still attached.{" "}
              <strong>Do not remove or damage the tag</strong> - items without a visible, intact
              tag can't be accepted for return or exchange.
            </p>
          </div>

          {/* Select Items */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Select Items</Label>
            <div className="space-y-3">
              {orderItems.map((item) => {
                const disabled = requestType === "return" && !item.is_returnable;
                const selected = !!selectedItems[item.id];
                const variants = variantsByProductId[item.product_id] ?? [];
                const inStock = variants.filter((v) => v.stock > 0);
                const target = exchangeTargets[item.id] ?? { size: null, color: null };
                const availableSizes = [...new Set(inStock.map((v) => v.size).filter((s): s is string => !!s))];
                const availableColors = [
                  ...new Set(
                    inStock
                      .filter((v) => !target.size || v.size === target.size)
                      .map((v) => v.color)
                      .filter((c): c is string => !!c),
                  ),
                ];

                return (
                  <div
                    key={item.id}
                    className={`border border-border rounded-lg p-3 space-y-3 ${disabled ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleItem(item, disabled)}
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

                    {selected && (
                      <div className="pl-8 space-y-3">
                        {requestType === "exchange" && (
                          <div className="space-y-2">
                            {loadingVariantsForProductId[item.product_id] ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Loading available sizes/colors...
                              </div>
                            ) : (
                              <>
                                {availableSizes.length > 0 && (
                                  <VariantSelector
                                    label="Exchange for size"
                                    type="size"
                                    options={availableSizes}
                                    selected={target.size}
                                    onSelect={(size) => setExchangeTarget(item.id, { size })}
                                  />
                                )}
                                {availableColors.length > 0 && (
                                  <VariantSelector
                                    label="Exchange for color"
                                    type="color"
                                    options={availableColors}
                                    selected={target.color}
                                    onSelect={(color) => setExchangeTarget(item.id, { color })}
                                  />
                                )}
                                {inStock.length === 0 && variants.length > 0 && (
                                  <p className="text-xs text-destructive">
                                    Nothing is currently in stock to exchange this item into.
                                  </p>
                                )}
                                {inStock.length > 0 &&
                                  availableColors.length === 0 &&
                                  target.size &&
                                  variants.some((v) => v.color) && (
                                    <p className="text-xs text-destructive">
                                      No colors currently in stock for size {target.size}.
                                    </p>
                                  )}
                              </>
                            )}
                          </div>
                        )}

                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            Photo with tag attached (required)
                          </Label>
                          <div className="flex items-center gap-3">
                            {itemPhotoUrls[item.id] ? (
                              <img
                                src={itemPhotoUrls[item.id]}
                                alt=""
                                className="h-14 w-14 rounded-md object-cover border border-border"
                              />
                            ) : (
                              <div className="h-14 w-14 rounded-md bg-muted flex items-center justify-center">
                                <Upload className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <label className="cursor-pointer">
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium border border-border rounded-md px-3 py-1.5 hover:bg-muted">
                                {uploadingItemId === item.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Upload className="h-3 w-3" />
                                )}
                                {itemPhotoUrls[item.id] ? "Replace photo" : "Upload photo"}
                              </span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                                className="hidden"
                                disabled={uploadingItemId === item.id}
                                onChange={(e) => handlePhotoSelect(item.id, e.target.files?.[0])}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
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
            disabled={submitting || !hasSelection || !reason || uploadingItemId !== null}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit {requestType === "return" ? "Return" : "Exchange"} Request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
