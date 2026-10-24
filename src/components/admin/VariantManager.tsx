import { useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Trash2, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ProductVariant, uploadImageFile } from "@/hooks/useProducts";
import { titleCase } from "@/lib/text";
import { formatINR } from "@/lib/format";

interface VariantManagerProps {
  variants: ProductVariant[];
  onChange: (variants: ProductVariant[]) => void;
  // The product's own Product Value (excl. GST) - the starting value of a
  // new variant.
  basePrice: number;
  // Customer price (MRP incl. GST) for a Product Value, shown beside each
  // variant; null when it can't be worked out yet (no category).
  mrpFor?: (value: number) => number | null;
  // Admin uploads land under "products" (existing bucket policy); vendors
  // can only write under "vendor-uploads" - the bucket's RLS rejects
  // anything else from a non-admin, so this must match the caller's role.
  uploadFolder?: "products" | "vendor-uploads";
}

const COMMON_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "28", "30", "32", "34", "36", "38", "40", "42", "Free Size"];
const COMMON_COLORS = ["Black", "White", "Red", "Blue", "Green", "Yellow", "Orange", "Purple", "Pink", "Brown", "Grey", "Navy", "Beige", "Cream", "Maroon"];

export function VariantManager({ variants, onChange, basePrice, mrpFor, uploadFolder = "products" }: VariantManagerProps) {
  // Derived fresh from `variants` every render, not seeded once at mount -
  // a one-time useState initializer here previously left these stuck on
  // whatever product first mounted this component (e.g. "Add New Product"
  // reset `variants` to [] but the size/color pills kept showing the
  // previous product's selections).
  const availableSizes = useMemo(
    () => Array.from(new Set(variants.map(v => v.options?.size || v.options?.Size).filter(Boolean) as string[])),
    [variants]
  );
  const availableColors = useMemo(
    () => Array.from(new Set(variants.map(v => v.options?.color || v.options?.Color).filter(Boolean) as string[])),
    [variants]
  );
  const [newSize, setNewSize] = useState("");
  const [newColor, setNewColor] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // "Set all" opens a box in the page, not a browser popup (Part 8, 25).
  const [bulk, setBulk] = useState<"stock" | "value" | null>(null);
  const [bulkValue, setBulkValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetId = useRef<string | null>(null);

  const triggerImageUpload = (variantId: string) => {
    uploadTargetId.current = variantId;
    fileInputRef.current?.click();
  };

  const uploadVariantImage = async (variantId: string, file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploadingId(variantId);
    const url = await uploadImageFile(file, uploadFolder);
    setUploadingId(null);
    if (!url) {
      toast.error("Failed to upload image");
      return;
    }
    updateVariant(variantId, "image_url", url);
  };

  const handleImageFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const variantId = uploadTargetId.current;
    e.target.value = "";
    if (!variantId) return;
    await uploadVariantImage(variantId, file);
  };

  const generateVariantId = () => `variant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const sizeOf = (v: ProductVariant) => v.options?.size || v.options?.Size || null;
  const colourOf = (v: ProductVariant) => v.options?.color || v.options?.Color || null;

  // One row per size x colour once both are picked - 3 sizes x 6 colours is
  // exactly 18 rows, never leftover size-only or colour-only rows (Part 8,
  // 23). Rows that already exist keep their stock, value, SKU and photo; a
  // size-only row becomes that size's first colour when colours arrive.
  const rebuild = (sizes: string[], colours: string[]) => {
    const combos: [string | null, string | null][] =
      sizes.length && colours.length
        ? sizes.flatMap((s) => colours.map((c) => [s, c] as [string, string]))
        : sizes.length
          ? sizes.map((s) => [s, null] as [string, null])
          : colours.map((c) => [null, c] as [null, string]);
    const used = new Set<string>();
    const take = (pred: (v: ProductVariant) => boolean) => {
      const found = variants.find((v) => !used.has(v.id) && pred(v));
      if (found) used.add(found.id);
      return found;
    };
    onChange(
      combos.map(([s, c]) => {
        const existing =
          take((v) => sizeOf(v) === s && colourOf(v) === c) ??
          take((v) => (s === null || sizeOf(v) === s) && (c === null || colourOf(v) === c)) ??
          (s && c ? take((v) => sizeOf(v) === s && !colourOf(v)) ?? take((v) => !sizeOf(v) && colourOf(v) === c) : undefined);
        const options: Record<string, string> = {};
        if (s) options.size = s;
        if (c) options.color = c;
        return {
          ...(existing ?? { id: generateVariantId(), price: 0, product_value: basePrice, stock: Number.NaN, image_url: null }),
          name: [s, c].filter(Boolean).join(" / "),
          options,
        };
      }),
    );
  };

  const addSize = (size: string) => {
    const trimmedSize = size.trim();
    if (!trimmedSize || availableSizes.some((s) => s.toLowerCase() === trimmedSize.toLowerCase())) return;
    setNewSize("");
    rebuild([...availableSizes, trimmedSize], availableColors);
  };

  // pink, Pink and PINK are one colour, kept as "Pink" (Part 8, 24).
  const addColor = (color: string) => {
    const name = titleCase(color);
    if (!name) return;
    setNewColor("");
    if (availableColors.some((c) => c.toLowerCase() === name.toLowerCase())) return;
    rebuild(availableSizes, [...availableColors, name]);
  };

  const removeSize = (size: string) => {
    rebuild(availableSizes.filter((s) => s !== size), availableColors);
  };

  const removeColor = (color: string) => {
    rebuild(availableSizes, availableColors.filter((c) => c !== color));
  };

  const updateVariant = (
    variantId: string,
    field: "product_value" | "stock" | "image_url" | "sku",
    value: number | string
  ) => {
    onChange(variants.map(v =>
      v.id === variantId ? { ...v, [field]: value } : v
    ));
  };

  const removeVariant = (variantId: string) => {
    onChange(variants.filter(v => v.id !== variantId));
  };

  const updateAllStock = (stock: number) => {
    onChange(variants.map(v => ({ ...v, stock })));
  };

  const updateAllValues = (product_value: number) => {
    onChange(variants.map(v => ({ ...v, product_value })));
  };

  const openBulk = (kind: "stock" | "value") => {
    setBulk(kind);
    setBulkValue(kind === "value" && basePrice > 0 ? String(basePrice) : "");
  };

  const applyBulk = () => {
    const n = Number(bulkValue);
    if (bulkValue.trim() === "" || !Number.isFinite(n) || n < 0) return;
    if (bulk === "stock") updateAllStock(Math.floor(n));
    else updateAllValues(n);
    setBulk(null);
  };

  return (
    <Card className="border-dashed">
      <input
        type="file"
        ref={fileInputRef}
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
        className="hidden"
        onChange={handleImageFileSelected}
      />
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Product Variants</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Size Options */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Available Sizes</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {availableSizes.map(size => (
              <Badge key={size} variant="secondary" className="gap-1">
                {size}
                <button onClick={() => removeSize(size)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add custom size..."
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSize(newSize))}
              className="flex-1"
            />
            <Button type="button" size="sm" onClick={() => addSize(newSize)} disabled={!newSize.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {COMMON_SIZES.filter(s => !availableSizes.includes(s)).slice(0, 8).map(size => (
              <Button
                key={size}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => addSize(size)}
              >
                {size}
              </Button>
            ))}
          </div>
        </div>

        {/* Colour Options */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Available Colours</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {availableColors.map(color => (
              <Badge key={color} variant="secondary" className="gap-1">
                {color}
                <button onClick={() => removeColor(color)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add custom colour..."
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addColor(newColor))}
              className="flex-1"
            />
            <Button type="button" size="sm" onClick={() => addColor(newColor)} disabled={!newColor.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {COMMON_COLORS.filter(c => !availableColors.includes(c)).slice(0, 8).map(color => (
              <Button
                key={color}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => addColor(color)}
              >
                {color}
              </Button>
            ))}
          </div>
        </div>

        {/* Variant List */}
        {variants.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Variant Details ({variants.length})</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => openBulk("stock")}>
                  Set All Stock
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => openBulk("value")}>
                  Set All Values
                </Button>
              </div>
            </div>
            {bulk && (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-background p-3">
                <div className="space-y-1">
                  <Label htmlFor="variant-bulk" className="text-xs">
                    {bulk === "stock" ? "Stock for every variant" : "Product Value (excl. GST) for every variant"}
                  </Label>
                  <Input
                    id="variant-bulk"
                    type="number"
                    min="0"
                    autoFocus
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyBulk())}
                    className="h-8 w-40 text-sm"
                  />
                </div>
                <Button type="button" size="sm" className="h-8" onClick={applyBulk} disabled={bulkValue.trim() === ""}>
                  Apply to all
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setBulk(null)}>
                  Cancel
                </Button>
              </div>
            )}
            <div className="max-h-64 overflow-y-auto space-y-2">
              {variants.map((variant) => (
                <div
                  key={variant.id}
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm flex-wrap"
                >
                  <button
                    type="button"
                    onClick={() => triggerImageUpload(variant.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      uploadVariantImage(variant.id, e.dataTransfer.files?.[0]);
                    }}
                    disabled={uploadingId === variant.id}
                    title={variant.image_url ? "Change photo (click or drag and drop)" : "Upload photo (click or drag and drop)"}
                    className="relative h-8 w-8 rounded shrink-0 overflow-hidden border border-dashed border-border hover:border-primary transition-colors flex items-center justify-center bg-muted"
                  >
                    {uploadingId === variant.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : variant.image_url ? (
                      <img src={variant.image_url} alt={variant.name} className="h-full w-full object-cover" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                  {variant.image_url && uploadingId !== variant.id && (
                    <button
                      type="button"
                      onClick={() => updateVariant(variant.id, "image_url", "")}
                      className="text-xs text-muted-foreground hover:text-destructive -ml-1"
                      title="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <span className="flex-1 min-w-[80px] font-medium truncate">
                    {variant.options?.size || variant.options?.Size || ""}
                    {(variant.options?.size || variant.options?.Size) && (variant.options?.color || variant.options?.Color) && " / "}
                    {variant.options?.color || variant.options?.Color || ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">SKU:</span>
                    <Input
                      placeholder="SKU"
                      value={variant.sku ?? ""}
                      onChange={(e) => updateVariant(variant.id, "sku", e.target.value)}
                      className="w-24 h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1" title="Product Value (excl. GST)">
                    <span className="text-xs text-muted-foreground">Value excl. GST ₹</span>
                    <Input
                      type="number"
                      min="0"
                      aria-label={`Product Value (excl. GST) for ${variant.name}`}
                      value={variant.product_value}
                      onChange={(e) => updateVariant(variant.id, "product_value", parseFloat(e.target.value) || 0)}
                      className="w-20 h-7 text-xs"
                    />
                    {mrpFor && mrpFor(variant.product_value) != null && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        MRP {formatINR(mrpFor(variant.product_value)!)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Stock:</span>
                    <Input
                      type="number"
                      min="0"
                      aria-label={`Stock for ${variant.name}`}
                      placeholder="—"
                      value={Number.isNaN(variant.stock) ? "" : variant.stock}
                      onChange={(e) =>
                        updateVariant(variant.id, "stock", e.target.value === "" ? Number.NaN : Math.max(0, parseInt(e.target.value) || 0))
                      }
                      className="w-16 h-7 text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => removeVariant(variant.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {variants.length === 0 && (availableSizes.length > 0 || availableColors.length > 0) && (
          <p className="text-sm text-muted-foreground text-center py-2">
            Add sizes or colours above to generate variants
          </p>
        )}
      </CardContent>
    </Card>
  );
}
