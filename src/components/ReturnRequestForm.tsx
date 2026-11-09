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
import { FreeDeliveryBadge } from "@/components/storefront/FreeDeliveryBadge";
import { formatMoney } from "@/lib/format";
import { RefundMethodPicker } from "@/components/RefundMethodPicker";
import { BANK_REFUND_DAYS, CHARGE_FREE_RETURN_REASONS, RefundMethod, refundOptions } from "@/lib/wallet";
import { useRefundCharge } from "@/hooks/useWallet";
import { useDeliveryCharge } from "@/hooks/useDeliveryCharge";
import { COMPANY } from "@/lib/company";

// Front, back and a close-up of the tag (the database checks the same:
// enforce_return_evidence).
const MIN_PHOTOS_PER_ITEM = 3;
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
  // Made to the customer's measurements / options.
  customisation?: unknown;
}

interface ReturnRequestFormProps {
  orderId: string;
  // How the order was paid - decides the refund choices.
  paymentMethod: string;
  orderItems: OrderItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// A customised piece can only come back if it arrived damaged or was the
// wrong item, within 24 hours of delivery (the database checks the same:
// enforce_return_window).
const RETURN_REASONS_CUSTOMISED = ["Defective or damaged product", "Wrong item received"];

const RETURN_REASONS = [
  "Defective or damaged product",
  "Wrong item received",
  "Size doesn't fit",
  "Colour is different from what was shown",
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
  paymentMethod,
  orderItems,
  open,
  onOpenChange,
  onSuccess,
}: ReturnRequestFormProps) {
  const { createReturnRequest } = useReturnRequests();
  const isCustomised = (item: OrderItem) => !!item.customisation;
  // Customised pieces can be returned (damage / wrong item) but never exchanged.
  const anyRefundable = orderItems.some((item) => item.is_returnable || isCustomised(item));
  const [requestType, setRequestType] = useState<"return" | "exchange">(anyRefundable ? "return" : "exchange");
  const [reason, setReason] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const customisedSelected = orderItems.some((item) => selectedItems[item.id] && isCustomised(item));
  const reasons = customisedSelected ? RETURN_REASONS_CUSTOMISED : RETURN_REASONS;
  useEffect(() => {
    if (reason && !reasons.includes(reason)) setReason("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customisedSelected]);
  const [submitting, setSubmitting] = useState(false);
  const refundChoices = refundOptions(paymentMethod);
  const refundCharge = useRefundCharge();
  // The courier inside each piece's price - kept on a return (client, 10 Nov 2026).
  const courierPerPiece = useDeliveryCharge();
  const [refundMethod, setRefundMethod] = useState<RefundMethod | null>(
    refundChoices.length === 1 ? refundChoices[0] : null,
  );

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
      toast.error("Couldn't load available sizes/colours for one of the items");
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
          if (!item.is_returnable && !isCustomised(item)) next[item.id] = false;
        });
        return next;
      });
    } else {
      // Customised pieces are never exchanged.
      setSelectedItems((prev) => {
        const next = { ...prev };
        orderItems.forEach((item) => {
          if (isCustomised(item)) next[item.id] = false;
        });
        return next;
      });
      orderItems.forEach((item) => {
        if (selectedItems[item.id] && !isCustomised(item)) ensureVariantsLoaded(item.product_id);
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

    if (evidenceRequired && chosen.some((item) => (itemPhotoUrls[item.id]?.length ?? 0) < MIN_PHOTOS_PER_ITEM)) {
      toast.error(`Please add ${MIN_PHOTOS_PER_ITEM} photos of every selected item: the front, the back and the tag`);
      return;
    }

    if (requestType === "return" && !refundMethod) {
      toast.error("Please choose how you'd like your refund");
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
          toast.error(`Please pick a colour to exchange "${item.product_title}" into`);
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
      refund_method: requestType === "return" ? refundMethod : null,
    });

    setSubmitting(false);
    if (success && requestType === "return" && refundMethod === "bank") {
      toast.info(
        `Please email your bank details (account holder name, account number, bank name, IFSC code) to ${COMPANY.supportEmail} with order #${orderId.slice(0, 8).toUpperCase()}. We transfer the refund within ${BANK_REFUND_DAYS} working days after the quality check.`,
        { duration: 15000 },
      );
    }
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
            <div className="text-xs text-amber-800 space-y-1">
              <p className="font-medium">Before you take the photos</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>
                  <strong>Keep the original tag attached.</strong> Don't cut, remove or break it - items without an
                  intact tag can't be accepted for return or exchange.
                </li>
                <li>
                  Add {MIN_PHOTOS_PER_ITEM} clear photos of every item: the <strong>front</strong>, the{" "}
                  <strong>back</strong>, and a <strong>close-up of the tag</strong>.
                </li>
                <li>The item must be unused, unwashed and unaltered, with its original packaging if you still have it.</li>
                <li>Pack it the same way for the courier pickup - we check it against these photos.</li>
              </ul>
            </div>
          </div>

          {/* Select Items */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Select Items</Label>
            <div className="space-y-3">
              {orderItems.map((item) => {
                const disabled =
                  requestType === "return" ? !item.is_returnable && !isCustomised(item) : isCustomised(item);
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
                          {item.color && `Colour: ${item.color}`}
                          {" • "}Qty: {item.quantity} • {formatMoney((item.price * item.quantity))}
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
                                    label="Exchange for colour"
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
                                      No colours currently in stock for size {target.size}.
                                    </p>
                                  )}
                              </>
                            )}
                          </div>
                        )}

                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            Photos - front, back and the tag ({evidenceRequired ? `${MIN_PHOTOS_PER_ITEM} required` : "optional"}, up to {MAX_PHOTOS_PER_ITEM})
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
            {customisedSelected && (
              <p className="mb-2 text-xs text-muted-foreground">
                Customised pieces can be returned only if they arrived damaged or were the wrong item, within 24
                hours of delivery.
              </p>
            )}
            <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
              {reasons.map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <RadioGroupItem value={r} id={`reason-${r}`} />
                  <Label htmlFor={`reason-${r}`} className="cursor-pointer text-sm">
                    {r}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {requestType === "return" && (
            <p className="text-xs text-muted-foreground">
              The refund is each item's price less {formatMoney(courierPerPiece)} per piece for delivery, which isn't
              refunded on returns.
            </p>
          )}
          {requestType === "return" && (
            <RefundMethodPicker
              options={refundChoices}
              value={refundMethod}
              onChange={setRefundMethod}
              context="return"
              orderId={orderId}
              // No charge when the fault was the boutique's.
              charge={CHARGE_FREE_RETURN_REASONS.includes(reason) ? null : refundCharge}
            />
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

          {/* Customers pay nothing for the courier on a return or exchange. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emerald-700/20 bg-emerald-50 p-3 text-xs text-emerald-800">
            <FreeDeliveryBadge>{requestType === "exchange" ? "Free Delivery" : "Free Pickup"}</FreeDeliveryBadge>
            <span>
              {requestType === "exchange"
                ? "We collect your piece and deliver the replacement at no cost."
                : "The courier collects your piece from your address at no cost."}
            </span>
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={submitting || !hasSelection || !reason || uploadingVideo || (requestType === "return" && !refundMethod)}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit {requestType === "return" ? "Return" : "Exchange"} Request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
