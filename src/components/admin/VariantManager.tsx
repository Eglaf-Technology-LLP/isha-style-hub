import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ImageIcon, Plus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ProductVariant, variantImages } from "@/hooks/useProducts";
import { titleCase } from "@/lib/text";
import { colourCodes, isMulticolour, normaliseHex, swatchColor } from "@/lib/colors";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MediaArranger } from "@/components/product-editor/MediaArranger";

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

const COMMON_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL", "Free Size"];
const COMMON_COLORS = ["Black", "White", "Red", "Blue", "Green", "Yellow", "Orange", "Purple", "Pink", "Brown", "Grey", "Navy", "Beige", "Cream", "Maroon"];

const sizeOf = (v: ProductVariant) => v.options?.size || v.options?.Size || null;
const colourOf = (v: ProductVariant) => v.options?.color || v.options?.Color || null;

export function VariantManager({ variants, onChange, basePrice, mrpFor, uploadFolder = "products" }: VariantManagerProps) {
  // Derived fresh from `variants` every render, not seeded once at mount -
  // a one-time useState initializer here previously left these stuck on
  // whatever product first mounted this component.
  const availableSizes = useMemo(() => Array.from(new Set(variants.map(sizeOf).filter(Boolean) as string[])), [variants]);
  const availableColors = useMemo(() => Array.from(new Set(variants.map(colourOf).filter(Boolean) as string[])), [variants]);
  const [newSize, setNewSize] = useState("");
  const [newColor, setNewColor] = useState("");
  // Optional colour code for a new colour - picked or typed as #rrggbb.
  const [newColorHex, setNewColorHex] = useState("");
  const codes = useMemo(() => colourCodes(variants), [variants]);
  // "Set all" opens a box in the page, not a browser popup (Part 8, 25).
  const [bulk, setBulk] = useState<"stock" | "value" | null>(null);
  const [bulkValue, setBulkValue] = useState("");
  // Size-only products rarely need their own photos per size.
  const [sizePhotosOpen, setSizePhotosOpen] = useState(false);

  const generateVariantId = () => `variant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // The photos a colour already has (any of its sizes), for a new size of it.
  const colourPhotos = (colour: string) => variantImages(variants.find((v) => colourOf(v) === colour && variantImages(v).length));

  // One row per size x colour once both are picked - 3 sizes x 6 colours is
  // exactly 18 rows, never leftover size-only or colour-only rows (Part 8,
  // 23). Rows that already exist keep their stock, value, SKU and photos; a
  // size-only row becomes that size's first colour when colours arrive.
  const rebuild = (sizes: string[], colours: string[], extraCodes: Record<string, string> = {}) => {
    const hexOf: Record<string, string> = { ...codes, ...extraCodes };
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
        if (c && hexOf[c]) options.color_hex = hexOf[c];
        const photos = c ? colourPhotos(c) : [];
        return {
          ...(existing ?? {
            id: generateVariantId(),
            price: 0,
            product_value: basePrice,
            stock: Number.NaN,
            images: photos,
            image_url: photos[0] ?? null,
          }),
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
  const addColor = (color: string, hex?: string) => {
    const name = titleCase(color);
    if (!name) return;
    const code = hex ? normaliseHex(hex) : null;
    if (hex && !code) return toast.error("Colour code must look like #1F6F8B");
    setNewColor("");
    setNewColorHex("");
    if (availableColors.some((c) => c.toLowerCase() === name.toLowerCase())) return;
    rebuild(availableSizes, [...availableColors, name], code ? { [name]: code } : {});
  };

  // Change the code of a colour already added (every size of it).
  const setColourCode = (colour: string, hex: string) => {
    const code = normaliseHex(hex);
    if (!code) return;
    onChange(variants.map((v) => (colourOf(v) === colour ? { ...v, options: { ...v.options, color_hex: code } } : v)));
  };

  const removeSize = (size: string) => rebuild(availableSizes.filter((s) => s !== size), availableColors);
  const removeColor = (color: string) => rebuild(availableSizes, availableColors.filter((c) => c !== color));

  const updateVariant = (variantId: string, field: "product_value" | "stock" | "sku", value: number | string) => {
    onChange(variants.map((v) => (v.id === variantId ? { ...v, [field]: value } : v)));
  };

  const removeVariant = (variantId: string) => onChange(variants.filter((v) => v.id !== variantId));

  const openBulk = (kind: "stock" | "value") => {
    setBulk(kind);
    setBulkValue(kind === "value" && basePrice > 0 ? String(basePrice) : "");
  };

  const applyBulk = () => {
    const n = Number(bulkValue);
    if (bulkValue.trim() === "" || !Number.isFinite(n) || n < 0) return;
    if (bulk === "stock") onChange(variants.map((v) => ({ ...v, stock: Math.floor(n) })));
    else onChange(variants.map((v) => ({ ...v, product_value: n })));
    setBulk(null);
  };

  // Photos per colour (every size of a colour shares them), or per variant
  // when there are no colours.
  const photoGroups = availableColors.length
    ? availableColors.map((c) => ({ key: c, label: c, colour: c as string | null, members: variants.filter((v) => colourOf(v) === c) }))
    : variants.map((v) => ({ key: v.id, label: v.name || sizeOf(v) || "Variant", colour: null as string | null, members: [v] }));

  const setGroupImages = (memberIds: Set<string>, images: string[]) =>
    onChange(variants.map((v) => (memberIds.has(v.id) ? { ...v, images, image_url: images[0] ?? null } : v)));

  const swatchStyle = (c: string) =>
    isMulticolour(c)
      ? { background: "conic-gradient(#b3261e, #e8c53a, #3f7a4a, #2f5d9e, #6a3d8f, #b3261e)" }
      : { backgroundColor: codes[c] ?? swatchColor(c) ?? "transparent" };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        {/* Sizes */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Sizes</Label>
          {availableSizes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {availableSizes.map((size) => (
                <Badge key={size} variant="secondary" className="gap-1">
                  {size}
                  <button type="button" onClick={() => removeSize(size)} className="ml-0.5 hover:text-destructive" aria-label={`Remove size ${size}`}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Add a size..."
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSize(newSize))}
              className="h-9 flex-1"
            />
            <Button type="button" size="sm" className="h-9" onClick={() => addSize(newSize)} disabled={!newSize.trim()} aria-label="Add size">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {COMMON_SIZES.filter((s) => !availableSizes.includes(s)).map((size) => (
              <Button key={size} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => addSize(size)}>
                {size}
              </Button>
            ))}
          </div>
        </div>

        {/* Colours */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Colours</Label>
          {availableColors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {availableColors.map((color) => (
                <Badge key={color} variant="secondary" className="gap-1.5">
                  <label
                    className="relative h-3.5 w-3.5 cursor-pointer rounded-full border border-foreground/20"
                    title={`Change the colour code for ${color}`}
                    style={swatchStyle(color)}
                  >
                    <input
                      type="color"
                      aria-label={`Colour code for ${color}`}
                      value={codes[color] ?? "#888888"}
                      onChange={(e) => setColourCode(color, e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                  {color}
                  {codes[color] && <span className="font-mono text-[10px] text-muted-foreground">{codes[color]}</span>}
                  <button type="button" onClick={() => removeColor(color)} className="ml-0.5 hover:text-destructive" aria-label={`Remove colour ${color}`}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Add a colour..."
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addColor(newColor, newColorHex || undefined))}
              className="h-9 min-w-0 flex-1"
            />
            {/* Pick the exact colour, or type its code (Part 8 extra list). */}
            <input
              type="color"
              aria-label="Pick the colour"
              title="Pick the colour"
              value={normaliseHex(newColorHex) ?? swatchColor(newColor) ?? "#888888"}
              onChange={(e) => setNewColorHex(e.target.value)}
              className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
            />
            <Input
              aria-label="Colour code"
              placeholder="#hex"
              value={newColorHex}
              onChange={(e) => setNewColorHex(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addColor(newColor, newColorHex || undefined))}
              className="h-9 w-24 shrink-0 font-mono"
            />
            <Button
              type="button"
              size="sm"
              className="h-9"
              onClick={() => addColor(newColor, newColorHex || undefined)}
              disabled={!newColor.trim()}
              aria-label="Add colour"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {COMMON_COLORS.filter((c) => !availableColors.includes(c))
              .slice(0, 10)
              .map((color) => (
                <Button key={color} type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => addColor(color)}>
                  <span className="h-2.5 w-2.5 rounded-full border border-foreground/20" style={{ backgroundColor: swatchColor(color) ?? undefined }} />
                  {color}
                </Button>
              ))}
          </div>
        </div>
      </div>

      {/* Variant list */}
      {variants.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-sm font-medium">Variants ({variants.length})</Label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => openBulk("stock")}>
                Set all stock
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => openBulk("value")}>
                Set all values
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
          <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 z-[1] bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">Variant</th>
                  <th className="px-2 py-2 text-left font-medium">SKU</th>
                  <th className="px-2 py-2 text-left font-medium">Value excl. GST (₹)</th>
                  <th className="px-2 py-2 text-left font-medium">Stock</th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => {
                  const thumb = variantImages(variant)[0];
                  const colour = colourOf(variant);
                  const mrp = mrpFor?.(variant.product_value);
                  return (
                    <tr key={variant.id} className="border-t border-border">
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="flex h-9 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted">
                            {thumb ? (
                              <img src={thumb} alt="" className="h-full w-full object-cover" />
                            ) : colour ? (
                              <span className="h-4 w-4 rounded-full border border-foreground/20" style={swatchStyle(colour)} />
                            ) : (
                              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </span>
                          <span className="font-medium">
                            {[sizeOf(variant), colour].filter(Boolean).join(" / ") || variant.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          placeholder="SKU"
                          aria-label={`SKU for ${variant.name}`}
                          value={variant.sku ?? ""}
                          onChange={(e) => updateVariant(variant.id, "sku", e.target.value)}
                          className="h-8 w-28 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            aria-label={`Product Value (excl. GST) for ${variant.name}`}
                            value={variant.product_value}
                            onChange={(e) => updateVariant(variant.id, "product_value", parseFloat(e.target.value) || 0)}
                            className="h-8 w-24 text-xs"
                          />
                          {mrp != null && <span className="whitespace-nowrap text-xs text-muted-foreground">MRP {formatINR(mrp)}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min="0"
                          aria-label={`Stock for ${variant.name}`}
                          placeholder="—"
                          value={Number.isNaN(variant.stock) ? "" : variant.stock}
                          onChange={(e) =>
                            updateVariant(variant.id, "stock", e.target.value === "" ? Number.NaN : Math.max(0, parseInt(e.target.value) || 0))
                          }
                          className="h-8 w-20 text-xs"
                        />
                      </td>
                      <td className="px-1 py-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeVariant(variant.id)}
                          aria-label={`Remove ${variant.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Variant photos */}
      {variants.length > 0 && (
        <div className="space-y-3 border-t border-border pt-4">
          {availableColors.length ? (
            <div>
              <Label className="text-sm font-medium">Photos for each colour</Label>
              <p className="text-xs text-muted-foreground">
                Shown when a shopper picks that colour, in this order - drag to arrange. Every size of a colour shares its
                photos. A colour without photos shows the product photos, and its colour swatch.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSizePhotosOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 text-left"
              aria-expanded={sizePhotosOpen}
            >
              <span>
                <span className="block text-sm font-medium">Photos for each size (optional)</span>
                <span className="block text-xs text-muted-foreground">Only if a size looks different - otherwise the product photos show.</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", sizePhotosOpen && "rotate-180")} />
            </button>
          )}
          {(availableColors.length > 0 || sizePhotosOpen) && (
            <div className="space-y-3">
              {photoGroups.map((g) => {
                const images = variantImages(g.members.find((v) => variantImages(v).length));
                return (
                  <div key={g.key} className="grid gap-2 rounded-lg border border-border p-2.5 sm:grid-cols-[120px_1fr] sm:items-start">
                    <div className="flex items-center gap-2 sm:pt-1">
                      {g.colour && <span className="h-4 w-4 shrink-0 rounded-full border border-foreground/20" style={swatchStyle(g.colour)} />}
                      <span className="text-sm font-medium">{g.label}</span>
                      <span className="text-xs text-muted-foreground">({images.length})</span>
                    </div>
                    <MediaArranger
                      folder={uploadFolder}
                      size="sm"
                      showTips={false}
                      value={{ images }}
                      onChange={(next) => setGroupImages(new Set(g.members.map((m) => m.id)), next.images)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
