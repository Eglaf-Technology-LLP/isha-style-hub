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
import { useCategories } from "@/hooks/useCategories";
import {
  ProductVariant,
  insertProductRecord,
  applyProductUpdate,
  fetchProductWithVariants,
} from "@/hooks/useProducts";
import { VariantManager } from "@/components/admin/VariantManager";
import { toast } from "sonner";

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
  images: "",
  is_active: true,
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
  const [variants, setVariants] = useState<ProductVariant[]>([]);
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
        images: (product.images || []).join("\n"),
        is_active: product.is_active,
      });
      setVariants(product.variants || []);
    } else {
      setForm({ ...empty });
      setVariants([]);
    }
  }, [open, product]);

  const set = (k: keyof typeof empty, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Product name is required");
    const price = Number(form.price);
    if (!price || price <= 0) return toast.error("Enter a valid price");

    setSaving(true);
    try {
      const images = form.images
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

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
        // Trusted partners publish instantly, others go to the moderation queue
        approval_status: isTrusted ? "approved" : "pending",
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

          <VariantManager
            variants={variants}
            onChange={setVariants}
            basePrice={Number(form.price) || 0}
          />

          <div className="space-y-2">
            <Label htmlFor="vp-images">Image URLs (one per line)</Label>
            <Textarea
              id="vp-images"
              rows={3}
              value={form.images}
              onChange={(e) => set("images", e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Listed on storefront</p>
              <p className="text-xs text-muted-foreground">
                Hidden products stay in your catalogue but are not shown to shoppers.
              </p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => set("is_active", v)}
            />
          </div>
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
