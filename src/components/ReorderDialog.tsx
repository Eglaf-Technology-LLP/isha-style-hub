import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useCartStore, CartItem } from "@/stores/cartStore";
import { checkReorderAvailability, ReorderCheckResult, ReorderSourceItem } from "@/lib/reorderAvailability";

interface ReorderDialogProps {
  items: ReorderSourceItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReorderDialog({ items, open, onOpenChange }: ReorderDialogProps) {
  const addItems = useCartStore((state) => state.addItems);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<ReorderCheckResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    checkReorderAvailability(items).then((checked) => {
      setResults(checked);
      setSelectedIds(
        Object.fromEntries(checked.filter((r) => r.availability === "available").map((r) => [r.sourceItem.id, true])),
      );
      setLoading(false);
    });
  }, [open, items]);

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;
  const availableCount = results.filter((r) => r.availability === "available").length;

  const handleConfirm = () => {
    const toAdd = results.filter((r) => r.availability === "available" && selectedIds[r.sourceItem.id]);
    if (toAdd.length === 0) return;

    const cartItems: CartItem[] = toAdd.map((r) => {
      const selectedOptions: { name: string; value: string }[] = [];
      if (r.sourceItem.size) selectedOptions.push({ name: "Size", value: r.sourceItem.size });
      if (r.sourceItem.color) selectedOptions.push({ name: "Color", value: r.sourceItem.color });

      return {
        productId: r.sourceItem.product_id,
        productName: r.sourceItem.product_title,
        productImage: r.sourceItem.image,
        vendorId: r.sourceItem.vendor_id,
        variantId: r.sourceItem.variant_id,
        variantTitle: r.sourceItem.variant_title || "Default",
        price: { amount: String(r.currentPrice), currencyCode: "INR" },
        quantity: r.availableQuantity,
        selectedOptions,
      };
    });

    addItems(cartItems);

    const skippedCount = results.length - toAdd.length;
    if (skippedCount > 0) {
      toast.success(
        `${toAdd.length} item${toAdd.length > 1 ? "s" : ""} added to your cart. ${skippedCount} item${skippedCount > 1 ? "s" : ""} skipped.`,
      );
    } else {
      toast.success(`${toAdd.length} item${toAdd.length > 1 ? "s" : ""} added to your cart.`);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reorder</DialogTitle>
          <DialogDescription>
            We checked current price and stock for these items - anything that's changed is shown below.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              {results.map((r) => {
                const item = r.sourceItem;
                const disabled = r.availability !== "available";
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-2.5 border border-border rounded-lg ${disabled ? "opacity-60" : ""}`}
                  >
                    <Checkbox
                      checked={!disabled && !!selectedIds[item.id]}
                      onCheckedChange={() => toggleItem(item.id)}
                      disabled={disabled}
                    />
                    {item.image ? (
                      <img src={item.image} alt="" className="h-12 w-12 rounded-md object-cover shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded-md bg-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.product_title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.size && <span>Size: {item.size}</span>}
                        {item.color && <span> • Color: {item.color}</span>}
                        {" • "}Qty: {item.quantity}
                      </p>

                      {r.availability === "unavailable" && (
                        <Badge variant="destructive" className="mt-1 text-[11px]">
                          No longer available
                        </Badge>
                      )}
                      {r.availability === "out_of_stock" && (
                        <Badge variant="destructive" className="mt-1 text-[11px]">
                          Out of stock
                        </Badge>
                      )}
                      {r.availability === "available" && r.availableQuantity < r.requestedQuantity && (
                        <Badge variant="outline" className="mt-1 text-[11px] bg-amber-100 text-amber-800 border-transparent">
                          Only {r.availableQuantity} left - quantity reduced
                        </Badge>
                      )}
                      {r.availability === "available" && r.priceChanged && r.currentPrice !== null && (
                        <p className="mt-1 text-xs">
                          <span className="line-through text-muted-foreground mr-1.5">₹{item.price.toFixed(2)}</span>
                          <span
                            className={r.currentPrice > item.price ? "text-destructive font-medium" : "text-green-700 font-medium"}
                          >
                            ₹{r.currentPrice.toFixed(2)} now
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {availableCount === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                None of these items are available anymore.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {selectedCount} of {results.length} item{results.length > 1 ? "s" : ""} will be added to your cart.
                </p>
                <Button className="w-full" onClick={handleConfirm} disabled={selectedCount === 0}>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Add to Cart
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
