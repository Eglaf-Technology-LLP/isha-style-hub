import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WeightInput } from "@/components/WeightInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import {
  CustomisationEditor,
  customisationFormFrom,
  customisationPayload,
  emptyCustomisationForm,
  type CustomisationForm,
} from "@/components/CustomisationEditor";
import { CUSTOMISATION_ENABLED, type CustomisationOption } from "@/lib/customisation";
import { useCategories } from "@/hooks/useCategories";
import {
  ProductVariant,
  ProductSpecification,
  insertProductRecord,
  applyProductUpdate,
  fetchProductWithVariants,
} from "@/hooks/useProducts";
import { VariantManager } from "@/components/admin/VariantManager";
import { ProductSpecificationsEditor } from "@/components/admin/ProductSpecificationsEditor";
import { ImageDropzone } from "@/components/ImageDropzone";
import { toast } from "sonner";
import { AiDeclarationField } from "@/components/AiDeclarationField";
import { AiOriginalPhotosField } from "@/components/AiOriginalPhotosField";
import { ProductVideoField } from "@/components/ProductVideoField";
import type { AiContentStatus } from "@/lib/aiContent";

export interface VendorProductRow {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  is_active: boolean;
  approval_status: string;
  images: string[];
  description?: string | null;
  category_id?: string | null;
  compare_at_price?: number | null;
  sku?: string | null;
  variants?: ProductVariant[];
  weight_grams?: number | null;
  length_cm?: number | null;
  breadth_cm?: number | null;
  height_cm?: number | null;
  specifications?: ProductSpecification[];
  country_of_origin?: string;
  net_quantity?: string;
  is_returnable?: boolean;
  cod_available?: boolean;
  prep_days?: number | null;
  made_to_order?: boolean;
  customisable?: boolean;
  customisation_options?: unknown;
  custom_size_price?: number | null;
  customisation_days?: number | null;
  ai_content_status?: AiContentStatus | null;
  ai_original_photo_paths?: string[];
  video_url?: string | null;
  video_is_primary?: boolean;
  video_status?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  isTrusted: boolean;
  product: VendorProductRow | null;
  onSaved: () => void;
}

const empty = {
  name: "",
  description: "",
  category_id: "",
  price: "",
  compare_at_price: "",
  sku: "",
  stock_quantity: "100",
  is_active: true,
  weight_grams: "",
  length_cm: "",
  breadth_cm: "",
  height_cm: "",
  country_of_origin: "India",
  net_quantity: "1 N",
  is_returnable: true,
  cod_available: true,
  // Empty = the boutique's own "ready to ship in" days.
  prep_days: "",
  made_to_order: false,
};

export function VendorProductDialog({
  open,
  onOpenChange,
  vendorId,
  isTrusted,
  product,
  onSaved,
}: Props) {
  const { categories } = useCategories();
  const [form, setForm] = useState({ ...empty });
  const [images, setImages] = useState<string[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [specifications, setSpecifications] = useState<ProductSpecification[]>([]);
  const [aiContentStatus, setAiContentStatus] = useState<AiContentStatus | null>(null);
  const [originalPhotos, setOriginalPhotos] = useState<string[]>([]);
  const [video, setVideo] = useState<{ videoUrl: string | null; isPrimary: boolean }>({ videoUrl: null, isPrimary: false });
  const [customisation, setCustomisation] = useState<CustomisationForm>(emptyCustomisationForm);
  const needsOriginals = !!aiContentStatus && aiContentStatus !== "none";
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        name: product.name || "",
        description: product.description || "",
        category_id: product.category_id || "",
        price: String(product.price ?? ""),
        compare_at_price:
          product.compare_at_price != null ? String(product.compare_at_price) : "",
        sku: product.sku || "",
        stock_quantity: String(product.stock_quantity ?? 0),
        is_active: product.is_active,
        weight_grams: product.weight_grams != null ? String(product.weight_grams) : "",
        length_cm: product.length_cm != null ? String(product.length_cm) : "",
        breadth_cm: product.breadth_cm != null ? String(product.breadth_cm) : "",
        height_cm: product.height_cm != null ? String(product.height_cm) : "",
        country_of_origin: product.country_of_origin || "India",
        net_quantity: product.net_quantity || "1 N",
        is_returnable: product.is_returnable ?? true,
        cod_available: product.cod_available ?? true,
        prep_days: product.prep_days != null ? String(product.prep_days) : "",
        made_to_order: product.made_to_order ?? false,
      });
      setImages(product.images || []);
      setVariants(product.variants || []);
      setSpecifications(product.specifications || []);
      setAiContentStatus(product.ai_content_status ?? null);
      setOriginalPhotos(product.ai_original_photo_paths || []);
      setVideo({ videoUrl: product.video_url ?? null, isPrimary: product.video_is_primary ?? false });
      setCustomisation(
        customisationFormFrom({
          customisable: product.customisable,
          custom_size_price: product.custom_size_price,
          customisation_options: (Array.isArray(product.customisation_options) ? product.customisation_options : []) as CustomisationOption[],
          customisation_days: product.customisation_days,
        }),
      );
    } else {
      setForm({ ...empty });
      setImages([]);
      setVariants([]);
      setSpecifications([]);
      setAiContentStatus(null);
      setOriginalPhotos([]);
      setVideo({ videoUrl: null, isPrimary: false });
      setCustomisation(emptyCustomisationForm);
    }
  }, [open, product]);

  const set = (k: keyof typeof empty, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Product name is required");
    const price = Number(form.price);
    if (!price || price <= 0) return toast.error("Enter a valid price");
    if (!aiContentStatus) return toast.error("Please complete the AI content declaration");
    if (needsOriginals && originalPhotos.length === 0)
      return toast.error("AI imagery needs at least one original product photo for verification");
    // While customisation is hidden its fields are left untouched.
    const custom = CUSTOMISATION_ENABLED ? customisationPayload(customisation) : { value: {} };
    if ("error" in custom) return toast.error(custom.error);

    setSaving(true);
    try {
      const payload = {
        vendor_id: vendorId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        category_id: form.category_id || null,
        price,
        compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
        sku: form.sku.trim() || null,
        stock_quantity: Number(form.stock_quantity) || 0,
        images,
        is_active: form.is_active,
        weight_grams: form.weight_grams ? Number(form.weight_grams) : null,
        length_cm: form.length_cm ? Number(form.length_cm) : null,
        breadth_cm: form.breadth_cm ? Number(form.breadth_cm) : null,
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        specifications,
        country_of_origin: form.country_of_origin.trim() || "India",
        net_quantity: form.net_quantity.trim() || "1 N",
        is_returnable: form.is_returnable,
        cod_available: form.cod_available,
        prep_days:
          form.prep_days.trim() === "" ? null : Math.min(90, Math.max(0, Math.round(Number(form.prep_days) || 0))),
        made_to_order: form.made_to_order,
        ...custom.value,
        ai_content_status: aiContentStatus,
        // Cleared on "No AI" - originals only belong with an AI declaration.
        ai_original_photo_paths: needsOriginals ? originalPhotos : [],
        video_url: video.videoUrl,
        video_is_primary: video.isPrimary,
        // Trusted partners publish instantly, others go to the moderation
        // queue. "pending_review" (not "pending") is the real constraint
        // value - the insert-only normalization trigger masked this being
        // wrong on create, but every edit hit the constraint directly since
        // no such trigger runs on update.
        approval_status: isTrusted ? "approved" : "pending_review",
      };

      if (product) {
        const existing = await fetchProductWithVariants(product.id);
        await applyProductUpdate(product.id, payload, existing, undefined, variants);
        toast.success(
          isTrusted ? "Product updated" : "Product updated — sent for re-approval"
        );
      } else {
        await insertProductRecord(payload, images, variants);
        toast.success(
          isTrusted
            ? "Product published to the storefront"
            : "Product submitted for approval"
        );
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      console.error("save product error:", e);
      toast.error(e.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "Add product"}</DialogTitle>
          <DialogDescription>
            {isTrusted
              ? "As a trusted partner your listings go live immediately."
              : "New and edited listings are reviewed by the marketplace team before going live."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vp-name">Product name</Label>
            <Input
              id="vp-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Banarasi Silk Saree"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vp-desc">Description</Label>
            <Textarea
              id="vp-desc"
              rows={4}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Fabric, fit, care instructions..."
            />
          </div>

          {/* Was "Listed on storefront" further down, next to the AI originals, where it read as part of
              them (Developer Corrections Part 7, 8.1). */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="vp-active" className="text-sm font-medium">
                Show on store (visible to customers)
              </Label>
              <p className="text-xs text-muted-foreground">
                Off: the product stays in your catalogue but customers can't see or buy it.
              </p>
            </div>
            <Switch id="vp-active" checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.category_id}
                onValueChange={(v) => set("category_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vp-sku">SKU</Label>
              <Input
                id="vp-sku"
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vp-price">Price (₹)</Label>
              <Input
                id="vp-price"
                type="number"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vp-mrp">Compare at (₹)</Label>
              <Input
                id="vp-mrp"
                type="number"
                value={form.compare_at_price}
                onChange={(e) => set("compare_at_price", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vp-stock">Stock</Label>
              <Input
                id="vp-stock"
                type="number"
                value={form.stock_quantity}
                onChange={(e) => set("stock_quantity", e.target.value)}
              />
              {variants.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Ignored while variants below are set - stock is tracked per variant instead.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label className="text-sm text-muted-foreground">
              Parcel weight &amp; size (optional - used for courier shipping, defaults apply if left blank)
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <Label htmlFor="vp-weight" className="text-xs">Weight (one piece, packed)</Label>
                <WeightInput
                  id="vp-weight"
                  grams={form.weight_grams ? Number(form.weight_grams) : null}
                  onChange={(g) => set("weight_grams", g == null ? "" : String(g))}
                  warnAboveGrams={10000}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vp-length" className="text-xs">Length (cm)</Label>
                <Input
                  id="vp-length"
                  type="number"
                  min="0"
                  value={form.length_cm}
                  onChange={(e) => set("length_cm", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vp-breadth" className="text-xs">Breadth (cm)</Label>
                <Input
                  id="vp-breadth"
                  type="number"
                  min="0"
                  value={form.breadth_cm}
                  onChange={(e) => set("breadth_cm", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vp-height" className="text-xs">Height (cm)</Label>
                <Input
                  id="vp-height"
                  type="number"
                  min="0"
                  value={form.height_cm}
                  onChange={(e) => set("height_cm", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vp-origin">Country of Origin</Label>
              <Input
                id="vp-origin"
                value={form.country_of_origin}
                onChange={(e) => set("country_of_origin", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vp-netqty">Net Quantity</Label>
              <Input
                id="vp-netqty"
                placeholder="e.g. 1 N, 1 Set, 500 g"
                value={form.net_quantity}
                onChange={(e) => set("net_quantity", e.target.value)}
              />
            </div>
          </div>

          <ProductSpecificationsEditor specifications={specifications} onChange={setSpecifications} />

          <VariantManager
            variants={variants}
            onChange={setVariants}
            basePrice={Number(form.price) || 0}
            uploadFolder="vendor-uploads"
          />

          <div className="space-y-2">
            <Label>Product Images</Label>
            <ImageDropzone folder="vendor-uploads" value={images} onChange={setImages} />
          </div>

          <ProductVideoField
            folder="vendor-uploads"
            idPrefix="vp"
            videoUrl={video.videoUrl}
            isPrimary={video.isPrimary}
            onChange={setVideo}
            note={
              isTrusted
                ? "As a trusted partner it goes live with the listing."
                : product?.video_status === "rejected" && product.video_url === video.videoUrl
                  ? "This video was not approved - upload a different one."
                  : "Shown to shoppers once the AllBoutiqs team approves it."
            }
          />

          <AiDeclarationField idPrefix="vp" value={aiContentStatus} onChange={setAiContentStatus} />
          {needsOriginals && (
            <AiOriginalPhotosField ownerFolder={vendorId} value={originalPhotos} onChange={setOriginalPhotos} />
          )}

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Returnable</p>
              <p className="text-xs text-muted-foreground">
                Off for hygiene/opened-item products (innerwear, cosmetics) - blocks refund
                requests only, customers can still request an exchange.
              </p>
            </div>
            <Switch
              checked={form.is_returnable}
              onCheckedChange={(v) => set("is_returnable", v)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="vp-cod" className="text-sm font-medium">
                Cash on Delivery
              </Label>
              <p className="text-xs text-muted-foreground">
                Off for high-value or custom-made pieces - customers then pay online for any order that includes
                this product. AllBoutiqs may also change this.
              </p>
            </div>
            <Switch id="vp-cod" checked={form.cod_available} onCheckedChange={(v) => set("cod_available", v)} />
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="vp-mto" className="text-sm font-medium">
                  Made to order
                </Label>
                <p className="text-xs text-muted-foreground">
                  Shows "Made to order: ships in N days" on the product page, so a later delivery date doesn't look
                  like a mistake.
                </p>
              </div>
              <Switch id="vp-mto" checked={form.made_to_order} onCheckedChange={(v) => set("made_to_order", v)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vp-prep" className="text-sm font-medium">
                Ready to ship in (days)
              </Label>
              <Input
                id="vp-prep"
                type="number"
                min={0}
                max={90}
                placeholder="Your store default"
                value={form.prep_days}
                onChange={(e) => set("prep_days", e.target.value)}
                className="max-w-[200px]"
              />
              <p className="text-xs text-muted-foreground">
                Working days you need to make or pack this product before the courier collects it. Leave empty to
                use your store's default.
              </p>
            </div>
          </div>

          {CUSTOMISATION_ENABLED && (
            <CustomisationEditor
              idPrefix="vp-cz"
              value={customisation}
              onChange={setCustomisation}
              note="AllBoutiqs may also change this."
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {product ? "Save changes" : "Create product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
