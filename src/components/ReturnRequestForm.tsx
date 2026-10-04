import { useEffect, useState } from "react";
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
import { Loader2, RotateCcw, ArrowLeftRight, AlertTriangle, Video, X } from "lucide-react";
import { toast } from "sonner";
import { useReturnRequests, ReturnItem } from "@/hooks/useReturnRequests";
import { VariantSelector } from "@/components/VariantSelector";
import { fetchExchangeableVariants, ExchangeVariantOption } from "@/lib/exchangeVariants";
import { supabase } from "@/integrations/supabase/client";
import { ImageDropzone } from "@/components/ImageDropzone";
import { uploadUserFile } from "@/lib/userPhotoUpload";

const MAX_PHOTOS_PER_ITEM = 5;
const MAX_VIDEO_MB = 50;

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
  const anyRefundable = orderItems.some((item) => item.is_returnable);
  const [requestType, setRequestType] = useState<"return" | "exchange">(anyRefundable ? "return" : "exchange");
  const [reason, setReason] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const [itemPhotoUrls, setItemPhotoUrls] = useState<Record<string, string[]>>({});
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  // Admin setting; assume required until loaded (the DB enforces it anyway).
  const [evidenceRequired, setEvidenceRequired] = useState(true);

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("return_evidence_required")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEvidenceRequired(data.return_evidence_required);
      });
  }, []);

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

  const handleVideoSelect = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Please choose a video file");
      return;
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      toast.error(`Video is over ${MAX_VIDEO_MB}MB - please trim it or record a shorter clip`);
      return;
    }
    setUploadingVideo(true);
    const url = await uploadUserFile(file, "returns");
    setUploadingVideo(false);
    if (!url) {
      toast.error("Video upload failed - please try again");
      return;
    }
    setVideoUrl(url);
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

    if (evidenceRequired && chosen.some((item) => !(itemPhotoUrls[item.id]?.length))) {
      toast.error("Please add at least one photo (with the tag attached) for every selected item");
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
      photo_urls: itemPhotoUrls[item.id] ?? [],
      photo_url: itemPhotoUrls[item.id]?.[0],
      exchange_to: requestType === "exchange" ? (exchangeTargets[item.id] ?? { size: null, color: null }) : undefined,
    }));

    const success = await createReturnRequest({
      order_id: orderId,
      request_type: requestType,
      reason,
      additional_notes: additionalNotes || undefined,
      items,
      evidence_video_url: videoUrl,
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
          <DialogTitle>{anyRefundable ? "Request Return / Exchange" : "Request Exchange"}</DialogTitle>
          <DialogDescription>
            {anyRefundable
              ? "Select items and provide a reason for your request."
              : "These items are non-refundable, so they can be exchanged but not returned for a refund."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Request Type - Return & Refund doesn't exist as a choice when
              nothing in the order is refundable */}
          {anyRefundable && (
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
          )}

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
                            Photos with tag attached ({evidenceRequired ? "at least 1 required" : "optional"}, up to {MAX_PHOTOS_PER_ITEM})
                          </Label>
                          <ImageDropzone
                            folder="vendor-uploads"
                            value={itemPhotoUrls[item.id] ?? []}
                            onChange={(urls) => setItemPhotoUrls((prev) => ({ ...prev, [item.id]: urls }))}
                            maxFiles={MAX_PHOTOS_PER_ITEM}
                            uploadFile={(file) => uploadUserFile(file, "returns")}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Optional video - one per request */}
          <div>
            <Label className="text-sm font-medium mb-1 block">Video (optional)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              A short clip showing the issue helps us resolve it faster. One video, up to {MAX_VIDEO_MB}MB.
            </p>
            {videoUrl ? (
              <div className="relative">
                <video src={videoUrl} controls className="w-full max-h-56 rounded-md border border-border bg-black" />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="absolute top-2 right-2 h-7 gap-1"
                  onClick={() => setVideoUrl(null)}
                >
                  <X className="h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            ) : (
              <label className="cursor-pointer inline-flex">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium border border-border rounded-md px-3 py-1.5 hover:bg-muted">
                  {uploadingVideo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Video className="h-3 w-3" />}
                  {uploadingVideo ? "Uploading video..." : "Add a video"}
                </span>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  disabled={uploadingVideo}
                  onChange={(e) => {
                    handleVideoSelect(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
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
            disabled={submitting || !hasSelection || !reason || uploadingVideo}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit {requestType === "return" ? "Return" : "Exchange"} Request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
