import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WeightInput } from "@/components/WeightInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
  SOLD_OUT_EXTRA_AMOUNTS,
  SOLD_OUT_EXTRA_DAYS,
  SOLD_OUT_EXTRA_PCTS,
  madeToOrderLine,
  soldOutTermsFor,
} from "@/lib/soldOutMadeToOrder";
import { formatINR } from "@/lib/format";
import {
  ProductVariant,
  ProductSpecification,
  type ProductFormData,
  insertProductRecord,
  applyProductUpdate,
  approveProduct,
  fetchProductWithVariants,
} from "@/hooks/useProducts";
import { VariantManager } from "@/components/admin/VariantManager";
import { boutiqueSkuClash, variantSkuProblem } from "@/lib/skuRules";
import { ProductSpecificationsEditor } from "@/components/admin/ProductSpecificationsEditor";
import { ProductVendorSelect } from "@/components/admin/ProductVendorSelect";
import { AiDeclarationField } from "@/components/AiDeclarationField";
import { AiOriginalPhotosField } from "@/components/AiOriginalPhotosField";
import { CustomerPriceHint } from "@/components/CustomerPriceHint";
import { MediaArranger, type MediaValue } from "@/components/product-editor/MediaArranger";
import { AI_MADE_NOT_ALLOWED, aiContentAllowed, type AiContentStatus } from "@/lib/aiContent";
import { gstBreakdown, useCategoryGstRules } from "@/lib/gst";
import { titleCase } from "@/lib/text";
import { MIN_PRODUCT_PHOTOS, NET_QTY_WARN_ABOVE, checkPhotos, checkStock, parseNetQuantity } from "@/lib/productRules";
import { cn } from "@/lib/utils";

// The product as the add / edit pages load it (VENDOR_PRODUCT_COLUMNS).
export interface VendorProductRow {
  id: string;
  vendor_id?: string | null;
  name: string;
  // Customer price (MRP incl. GST); product_value is what the boutique entered.
  price: number;
  product_value?: number | null;
  compare_at_value?: number | null;
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
  sold_out_action?: string | null;
  sold_out_extra_amount?: number | null;
  sold_out_extra_pct?: number | null;
  sold_out_extra_days?: number | null;
  customisable?: boolean;
  customisation_options?: unknown;
  custom_size_price?: number | null;
  customisation_pct?: number | null;
  customisation_days?: number | null;
  ai_content_status?: AiContentStatus | null;
  ai_original_photo_paths?: string[];
  video_url?: string | null;
  video_is_primary?: boolean;
  video_position?: number | null;
  video_status?: string | null;
}

interface ProductEditorFormProps {
  // "vendor": the boutique's own page. "admin": AllBoutiqs adds or edits a
  // product for any boutique - it goes live without review.
  mode: "vendor" | "admin";
  // The boutique (vendor mode), or the one picked in advance (admin mode).
  vendorId: string | null;
  // Vendor mode: trusted partners publish without review.
  isTrusted?: boolean;
  product: VendorProductRow | null;
  // The saved product's id (a new product's too).
  onSaved: (productId: string) => void;
  onCancel: () => void;
  // The "Returnable" switch; when hidden the product keeps what it has
  // (new products: returnable).
  showReturnable?: boolean;
  // The "Made to order" switch; when hidden new products are Ready to Ship
  // and edits keep what the product has.
  showMadeToOrder?: boolean;
}

const empty = {
  name: "",
  description: "",
  category_id: "",
  // Product Value excl. GST (Part 7, 5.1) - the customer price adds GST.
  product_value: "",
  compare_at_value: "",
  sku: "",
  // Empty on purpose: the boutique types what it really has (Part 8, 26).
  stock_quantity: "",
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
  // "When a size sells out" (Ready to Ship): "" = show it as sold out.
  sold_out_action: "" as "" | "made_to_order" | "hide",
  sold_out_extra_kind: "amount" as "amount" | "pct",
  sold_out_extra_amount: "0",
  sold_out_extra_pct: "",
  sold_out_extra_days: "",
};

// Form fields from a product being edited (empty for a new one).
const formFrom = (product: VendorProductRow | null): typeof empty =>
  product
    ? {
        name: product.name || "",
        description: product.description || "",
        category_id: product.category_id || "",
        product_value: String(product.product_value ?? product.price ?? ""),
        compare_at_value:
          (product.compare_at_value ?? product.compare_at_price) != null
            ? String(product.compare_at_value ?? product.compare_at_price)
            : "",
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
        sold_out_action:
          product.sold_out_action === "made_to_order" || product.sold_out_action === "hide" ? product.sold_out_action : "",
        sold_out_extra_kind: product.sold_out_extra_pct != null ? "pct" : "amount",
        sold_out_extra_amount: product.sold_out_extra_amount != null ? String(Number(product.sold_out_extra_amount)) : "0",
        sold_out_extra_pct: product.sold_out_extra_pct != null ? String(Number(product.sold_out_extra_pct)) : "",
        sold_out_extra_days: product.sold_out_extra_days != null ? String(product.sold_out_extra_days) : "",
      }
    : { ...empty };

type SoldOutFields = Pick<
  ProductFormData,
  "sold_out_action" | "sold_out_extra_amount" | "sold_out_extra_pct" | "sold_out_extra_days"
>;
const NO_SOLD_OUT: SoldOutFields = {
  sold_out_action: null,
  sold_out_extra_amount: null,
  sold_out_extra_pct: null,
  sold_out_extra_days: null,
};

// "When a size sells out" as saved (client corrections 15 Nov 2026, 3.2.4).
// Only Ready to Ship pieces have stock to run out of.
function soldOutPayload(f: typeof empty): { value: SoldOutFields } | { error: string } {
  if (f.made_to_order || !f.sold_out_action) return { value: NO_SOLD_OUT };
  if (f.sold_out_action === "hide") return { value: { ...NO_SOLD_OUT, sold_out_action: "hide" } };
  const days = Number(f.sold_out_extra_days);
  if (!f.sold_out_extra_days || !Number.isInteger(days) || days < 1 || days > 90) {
    return { error: "Choose how many extra days it takes to make a sold-out size" };
  }
  if (f.sold_out_extra_kind === "pct") {
    const pct = Number(f.sold_out_extra_pct);
    if (!(SOLD_OUT_EXTRA_PCTS as readonly number[]).includes(pct)) {
      return { error: "Choose the extra % for a sold-out size made to order" };
    }
    return { value: { sold_out_action: "made_to_order", sold_out_extra_amount: null, sold_out_extra_pct: pct, sold_out_extra_days: days } };
  }
  const amount = Number(f.sold_out_extra_amount || 0);
  if (!Number.isFinite(amount) || amount < 0 || amount > 50000) {
    return { error: "Choose the extra ₹ for a sold-out size made to order" };
  }
  return { value: { sold_out_action: "made_to_order", sold_out_extra_amount: amount, sold_out_extra_pct: null, sold_out_extra_days: days } };
}

function Section({ title, description, children, className }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4 sm:p-5", className)}>
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  );
}

// "When a size sells out" (Ready to Ship only): show it as sold out, make it
// to order (extra ₹ or % and extra days) or hide that size.
function SoldOutSettings({
  form,
  set,
  customerPrice,
}: {
  form: typeof empty;
  set: (k: keyof typeof empty, v: string | boolean) => void;
  // One piece's price to the customer (GST included), for the preview.
  customerPrice: number | null;
}) {
  const action = form.sold_out_action || "show";
  const days = Number(form.sold_out_extra_days) || null;
  const dispatchDays = form.prep_days.trim() !== "" ? Number(form.prep_days) || 0 : null;
  const preview =
    action === "made_to_order" && days
      ? soldOutTermsFor(
          {
            action: "made_to_order",
            extraAmount: form.sold_out_extra_kind === "amount" ? Number(form.sold_out_extra_amount || 0) : null,
            extraPct: form.sold_out_extra_kind === "pct" ? Number(form.sold_out_extra_pct) || null : null,
            extraDays: days,
          },
          customerPrice ?? 0,
        )
      : null;
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="space-y-1.5">
        <Label htmlFor="pe-soldout" className="text-sm">
          When a size sells out
        </Label>
        <Select value={action} onValueChange={(v) => set("sold_out_action", v === "show" ? "" : v)}>
          <SelectTrigger id="pe-soldout" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="show">Show it as sold out</SelectItem>
            <SelectItem value="made_to_order">Make to order</SelectItem>
            <SelectItem value="hide">Hide that size</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {action === "made_to_order"
            ? "Customers can still order a size with no stock and you make it for them. No Cash on Delivery for these orders."
            : action === "hide"
              ? "A size with no stock is left off the product page until you add stock."
              : 'A size with no stock shows as sold out, with "Notify me".'}
        </p>
      </div>
      {action === "made_to_order" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="pe-soldout-kind" className="text-xs">
              Extra charge
            </Label>
            <Select value={form.sold_out_extra_kind} onValueChange={(v) => set("sold_out_extra_kind", v)}>
              <SelectTrigger id="pe-soldout-kind" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="amount">Fixed ₹</SelectItem>
                <SelectItem value="pct">% of the price</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pe-soldout-extra" className="text-xs">
              {form.sold_out_extra_kind === "pct" ? "Extra %" : "Extra ₹ (GST incl.)"}
            </Label>
            {form.sold_out_extra_kind === "pct" ? (
              <Select value={form.sold_out_extra_pct} onValueChange={(v) => set("sold_out_extra_pct", v)}>
                <SelectTrigger id="pe-soldout-extra" className="h-9">
                  <SelectValue placeholder="Choose %" />
                </SelectTrigger>
                <SelectContent>
                  {SOLD_OUT_EXTRA_PCTS.map((p) => (
                    <SelectItem key={p} value={String(p)}>
                      {p}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={form.sold_out_extra_amount || "0"} onValueChange={(v) => set("sold_out_extra_amount", v)}>
                <SelectTrigger id="pe-soldout-extra" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOLD_OUT_EXTRA_AMOUNTS.map((a) => (
                    <SelectItem key={a} value={String(a)}>
                      {a === 0 ? "No extra charge" : formatINR(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="pe-soldout-days" className="text-xs">
              Extra days to make it (added to "Ready to ship in")
            </Label>
            <Select value={form.sold_out_extra_days} onValueChange={(v) => set("sold_out_extra_days", v)}>
              <SelectTrigger id="pe-soldout-days" className="h-9">
                <SelectValue placeholder="Choose days" />
              </SelectTrigger>
              <SelectContent>
                {SOLD_OUT_EXTRA_DAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {preview && (
            <p className="col-span-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
              Customers see: <strong>{madeToOrderLine(preview, dispatchDays)}</strong>
              {dispatchDays == null && " (on top of your store's ready-to-ship days)"}
              {form.sold_out_extra_kind === "pct" && customerPrice == null && " - pick a category and price to see the ₹"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// The add / edit product page - boutiques (pages/VendorProductEditor.tsx)
// and admins (pages/AdminProductEditor.tsx) use the same form. Two columns
// on a computer (the product itself on the left, its settings on the
// right) so it needs little scrolling; one column on a phone.
export function ProductEditorForm({
  mode,
  vendorId: initialVendorId,
  isTrusted = false,
  product,
  onSaved,
  onCancel,
  showReturnable = true,
  showMadeToOrder = true,
}: ProductEditorFormProps) {
  const isAdmin = mode === "admin";
  const { categories } = useCategories();
  const gstRules = useCategoryGstRules();
  const [vendorId, setVendorId] = useState<string | null>(() => product?.vendor_id ?? initialVendorId);
  const [form, setForm] = useState(() => formFrom(product));
  const [media, setMedia] = useState<MediaValue>(() => ({
    images: product?.images || [],
    videoUrl: product?.video_url ?? null,
    videoPosition: product?.video_url ? product.video_position ?? (product.video_is_primary ? 0 : null) : null,
  }));
  const [variants, setVariants] = useState<ProductVariant[]>(() => product?.variants || []);
  const [specifications, setSpecifications] = useState<ProductSpecification[]>(() => product?.specifications || []);
  const [aiContentStatus, setAiContentStatus] = useState<AiContentStatus | null>(() => product?.ai_content_status ?? null);
  const [originalPhotos, setOriginalPhotos] = useState<string[]>(() => product?.ai_original_photo_paths || []);
  const [customisation, setCustomisation] = useState<CustomisationForm>(() =>
    product
      ? customisationFormFrom({
          customisable: product.customisable,
          customisation_pct: product.customisation_pct,
          customisation_options: (Array.isArray(product.customisation_options) ? product.customisation_options : []) as CustomisationOption[],
          customisation_days: product.customisation_days,
        })
      : emptyCustomisationForm,
  );
  const needsOriginals = !!aiContentStatus && aiContentStatus !== "none";
  const [saving, setSaving] = useState(false);
  // Admins write under "products"; a boutique may only write under
  // "vendor-uploads" (the bucket's rules).
  const folder = isAdmin ? "products" : "vendor-uploads";

  const set = (k: keyof typeof empty, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (isAdmin && !vendorId) return toast.error("Select the boutique this product belongs to");
    const name = titleCase(form.name);
    if (!name) return toast.error("Product name is required");
    if (!form.category_id) return toast.error("Choose a category");
    // 3.2.1: SKU required, the boutique's own code, unique in the boutique
    // (the database checks it too - enforce_product_sku).
    const sku = form.sku.trim();
    if (!sku) return toast.error("Enter the SKU - your own code for this product");
    // 24 Nov 2026: every size/colour needs its own SKU too, never repeated
    // in the boutique (the database checks it too - enforce_variant_sku).
    const variantProblem = variantSkuProblem(sku, variants);
    if (variantProblem) return toast.error(variantProblem);
    if (!form.description.trim()) return toast.error("Add a description");
    const productValue = Number(form.product_value);
    if (!productValue || productValue <= 0) return toast.error("Enter a valid Product Value (excl. GST)");
    const stockCheck = checkStock(variants, form.stock_quantity, form.made_to_order, showMadeToOrder);
    if ("error" in stockCheck) return toast.error(stockCheck.error);
    const soldOut = soldOutPayload(form);
    if ("error" in soldOut) return toast.error(soldOut.error);
    const photoProblem = checkPhotos(media.images, variants);
    if (photoProblem) return toast.error(photoProblem);
    const netQuantity = parseNetQuantity(form.net_quantity);
    if (!netQuantity) return toast.error('Net Quantity must be a number followed by N, Set or Pair - e.g. "1 N"');
    const parcel = [
      ["Weight", form.weight_grams],
      ["Length", form.length_cm],
      ["Breadth", form.breadth_cm],
      ["Height", form.height_cm],
    ] as const;
    const zeroParcel = parcel.find(([, v]) => v !== "" && !(Number(v) > 0));
    if (zeroParcel) return toast.error(`${zeroParcel[0]} must be more than 0 - or leave it empty`);
    // Detail rows left empty are dropped, not shown blank on the product page.
    const details = specifications
      .map((d) => ({ label: d.label.trim(), value: d.value.trim() }))
      .filter((d) => d.label && d.value);
    if (!aiContentStatus) return toast.error("Please complete the AI content declaration");
    if (!aiContentAllowed(aiContentStatus)) return toast.error(AI_MADE_NOT_ALLOWED);
    if (needsOriginals && originalPhotos.length === 0)
      return toast.error("AI imagery needs at least one original product photo for verification");
    // While customisation is hidden its fields are left untouched.
    const custom = CUSTOMISATION_ENABLED ? customisationPayload(customisation) : { value: {} };
    if ("error" in custom) return toast.error(custom.error);

    const videoUrl = media.videoUrl ?? null;
    const videoPosition = videoUrl ? media.videoPosition ?? null : null;
    // Vendor: trusted partners publish instantly, others go to the review
    // queue ("pending_review" is the real constraint value). Admin: a new
    // product is approved; an edit leaves the review state alone, except a
    // product with no boutique yet, which is approved as it gets one.
    const approval = isAdmin
      ? !product || !product.vendor_id
        ? { approval_status: "approved" }
        : {}
      : { approval_status: isTrusted ? "approved" : "pending_review" };

    setSaving(true);
    try {
      if (vendorId) {
        // The product's SKU and its sizes'/colours' SKUs against every other
        // product of the boutique and their sizes/colours.
        const clash = await boutiqueSkuClash(
          vendorId,
          product?.id,
          sku,
          variants.map((v) => v.sku ?? ""),
        );
        if (clash) {
          toast.error(clash);
          return;
        }
      }
      const payload = {
        vendor_id: vendorId,
        name,
        description: form.description.trim() || null,
        category_id: form.category_id || null,
        product_value: productValue,
        compare_at_value: form.compare_at_value ? Number(form.compare_at_value) : null,
        sku,
        stock_quantity: stockCheck.stock,
        images: media.images,
        is_active: form.is_active,
        weight_grams: form.weight_grams ? Number(form.weight_grams) : null,
        length_cm: form.length_cm ? Number(form.length_cm) : null,
        breadth_cm: form.breadth_cm ? Number(form.breadth_cm) : null,
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        specifications: details,
        country_of_origin: form.country_of_origin.trim() || "India",
        net_quantity: netQuantity.value,
        is_returnable: form.is_returnable,
        cod_available: form.cod_available,
        prep_days:
          form.prep_days.trim() === "" ? null : Math.min(90, Math.max(0, Math.round(Number(form.prep_days) || 0))),
        made_to_order: form.made_to_order,
        ...soldOut.value,
        ...custom.value,
        ai_content_status: aiContentStatus,
        // Cleared on "No AI" - originals only belong with an AI declaration.
        ai_original_photo_paths: needsOriginals ? originalPhotos : [],
        video_url: videoUrl,
        video_is_primary: !!videoUrl && videoPosition === 0,
        video_position: videoPosition,
        ...approval,
      };

      let savedId: string;
      if (product) {
        const existing = await fetchProductWithVariants(product.id);
        await applyProductUpdate(product.id, payload, existing, undefined, stockCheck.variants);
        savedId = product.id;
        toast.success(isAdmin || isTrusted ? "Product updated" : "Product updated — sent for re-approval");
      } else {
        const id = await insertProductRecord(payload, media.images, stockCheck.variants);
        savedId = id;
        // The insert trigger sends a non-trusted boutique's new product for
        // review - not one AllBoutiqs adds itself.
        if (isAdmin) await approveProduct(id);
        toast.success(isAdmin || isTrusted ? "Product published to the storefront" : "Product submitted for approval");
      }
      onSaved(savedId);
    } catch (e) {
      console.error("save product error:", e);
      toast.error((e as { message?: string })?.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const overrideNote = isAdmin ? "The boutique sets this when listing; changing it here overrides their choice." : "AllBoutiqs may also change this.";
  const videoNote = isAdmin
    ? "Videos added here go live straight away."
    : isTrusted
      ? "As a trusted partner your video goes live with the listing."
      : product?.video_status === "rejected" && product.video_url === media.videoUrl
        ? "This video was not approved - upload a different one."
        : "The video shows to shoppers once the AllBoutiqs team approves it.";

  return (
    <>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* The product */}
        <div className="space-y-5">
          <Section title="Basic details">
            {isAdmin && (
              <ProductVendorSelect
                id="pe-vendor"
                value={vendorId}
                onChange={setVendorId}
                locked={!!product?.vendor_id}
              />
            )}
            <div className="space-y-2">
              <Label htmlFor="pe-name">Product name *</Label>
              <Input id="pe-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Banarasi Silk Saree" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pe-desc">Description *</Label>
              <Textarea
                id="pe-desc"
                rows={4}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Fabric, fit, care instructions..."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pe-category">Category *</Label>
                <Select value={form.category_id} onValueChange={(v) => set("category_id", v)}>
                  <SelectTrigger id="pe-category">
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
                <Label htmlFor="pe-sku">SKU *</Label>
                <Input
                  id="pe-sku"
                  value={form.sku}
                  maxLength={64}
                  onChange={(e) => set("sku", e.target.value)}
                  placeholder="Your own code, e.g. EX-0981"
                />
              </div>
            </div>
          </Section>

          <Section title="Price & stock">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="pe-price">Product Value (excl. GST) (₹) *</Label>
                <Input id="pe-price" type="number" min="0" value={form.product_value} onChange={(e) => set("product_value", e.target.value)} />
                <CustomerPriceHint value={form.product_value} categoryId={form.category_id} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pe-mrp">Compare-at value (excl. GST) (₹)</Label>
                <Input
                  id="pe-mrp"
                  type="number"
                  min="0"
                  placeholder="Optional"
                  value={form.compare_at_value}
                  onChange={(e) => set("compare_at_value", e.target.value)}
                />
                <CustomerPriceHint value={form.compare_at_value} categoryId={form.category_id} label="Crossed-out MRP" showCourierNote={false} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pe-stock">Stock {variants.length === 0 && !form.made_to_order && "*"}</Label>
                <Input
                  id="pe-stock"
                  type="number"
                  min="0"
                  placeholder="Pieces ready"
                  value={form.stock_quantity}
                  onChange={(e) => set("stock_quantity", e.target.value)}
                  disabled={variants.length > 0}
                />
                <p className="text-xs text-muted-foreground">
                  {variants.length > 0
                    ? "Set per variant below."
                    : showMadeToOrder || form.made_to_order
                      ? "The real number you have ready. 0 only for Made to order."
                      : "The real number you have ready."}
                </p>
              </div>
            </div>
          </Section>

          <Section
            title="Photos & video *"
            description={`At least ${MIN_PRODUCT_PHOTOS} real photos: front, back and close-up. Each extra colour needs 1 front photo too (under Sizes & colours). Drag to arrange - shoppers see them in this order, and the first is the cover on product cards.`}
          >
            <MediaArranger folder={folder} value={media} onChange={setMedia} withVideo videoNote={videoNote} />
            {media.images.length < MIN_PRODUCT_PHOTOS && (
              <p className="text-xs text-amber-700">
                {media.images.length} of {MIN_PRODUCT_PHOTOS} photos added - add {MIN_PRODUCT_PHOTOS - media.images.length} more to save.
              </p>
            )}
          </Section>

          <Section title="Sizes & colours" description="Pick the sizes and colours you make - one variant is made for each pair.">
            <VariantManager
              variants={variants}
              onChange={setVariants}
              basePrice={Number(form.product_value) || 0}
              mrpFor={(v) => (form.category_id ? gstBreakdown(gstRules.ruleFor(form.category_id), v)?.price ?? null : null)}
              uploadFolder={folder}
            />
          </Section>

          <Section title="Product details" description="Shown under Product details on the product page.">
            <ProductSpecificationsEditor specifications={specifications} onChange={setSpecifications} />
          </Section>

          {CUSTOMISATION_ENABLED && (
            <CustomisationEditor
              idPrefix="pe-cz"
              value={customisation}
              onChange={setCustomisation}
              note={overrideNote}
              className="rounded-xl bg-card p-4 sm:p-5"
              price={
                form.category_id
                  ? gstBreakdown(gstRules.ruleFor(form.category_id), Number(form.product_value))?.price ?? null
                  : null
              }
              baseDays={form.prep_days.trim() !== "" ? Number(form.prep_days) || null : null}
            />
          )}
        </div>

        {/* Its settings */}
        <div className="space-y-5">
          <Section title="Visibility & policies">
            <ToggleRow
              id="pe-active"
              label="Show on store"
              description="Off: kept in the catalogue, but customers can't see or buy it."
              checked={form.is_active}
              onChange={(v) => set("is_active", v)}
            />
            {showReturnable && (
              <div className="border-t border-border pt-4">
                <ToggleRow
                  id="pe-returnable"
                  label="Returnable"
                  description="Off for hygiene / opened-item products (innerwear, cosmetics) - blocks refunds only; exchange is still allowed."
                  checked={form.is_returnable}
                  onChange={(v) => set("is_returnable", v)}
                />
              </div>
            )}
            <div className="border-t border-border pt-4">
              <ToggleRow
                id="pe-cod"
                label="Cash on Delivery"
                description={`Off for high-value or custom-made pieces - customers then pay online. ${overrideNote}`}
                checked={form.cod_available}
                onChange={(v) => set("cod_available", v)}
              />
            </div>
            <div className="space-y-3 border-t border-border pt-4">
              {showMadeToOrder && (
                <ToggleRow
                  id="pe-mto"
                  label="Made to order"
                  description='Shows "Made to order: ships in N days" on the product page.'
                  checked={form.made_to_order}
                  onChange={(v) => set("made_to_order", v)}
                />
              )}
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="pe-prep" className="text-sm">
                  Ready to ship in (days)
                </Label>
                <Input
                  id="pe-prep"
                  type="number"
                  min={0}
                  max={90}
                  placeholder={isAdmin ? "Boutique default" : "Store default"}
                  value={form.prep_days}
                  onChange={(e) => set("prep_days", e.target.value)}
                  className="h-9 w-36"
                />
              </div>
              <p className="text-xs text-muted-foreground">Working days to make or pack it before the courier collects. Empty = the store's default.</p>
            </div>
            {!form.made_to_order && (
              <SoldOutSettings
                form={form}
                set={set}
                customerPrice={
                  form.category_id
                    ? gstBreakdown(gstRules.ruleFor(form.category_id), Number(form.product_value))?.price ?? null
                    : null
                }
              />
            )}
          </Section>

          <Section title="Parcel" description="Optional - for courier booking; defaults apply if left blank.">
            <div className="space-y-1">
              <Label htmlFor="pe-weight" className="text-xs">
                Weight (one piece, packed)
              </Label>
              <WeightInput
                id="pe-weight"
                grams={form.weight_grams ? Number(form.weight_grams) : null}
                onChange={(g) => set("weight_grams", g == null ? "" : String(g))}
                warnAboveGrams={10000}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["pe-length", "Length", "length_cm"],
                  ["pe-breadth", "Breadth", "breadth_cm"],
                  ["pe-height", "Height", "height_cm"],
                ] as const
              ).map(([id, label, key]) => (
                <div key={id} className="space-y-1">
                  <Label htmlFor={id} className="text-xs">
                    {label} (cm)
                  </Label>
                  <Input id={id} type="number" min="0" value={form[key]} onChange={(e) => set(key, e.target.value)} className="h-9" />
                </div>
              ))}
            </div>
          </Section>

          <Section title="Label details">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pe-origin" className="text-xs">
                  Country of origin
                </Label>
                <Input id="pe-origin" value={form.country_of_origin} onChange={(e) => set("country_of_origin", e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pe-netqty" className="text-xs">
                  Net quantity
                </Label>
                <Input
                  id="pe-netqty"
                  placeholder="1 N, 1 Set, 1 Pair"
                  value={form.net_quantity}
                  onChange={(e) => set("net_quantity", e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            {form.net_quantity.trim() && !parseNetQuantity(form.net_quantity) ? (
              <p className="text-xs text-destructive">Net quantity: a number followed by N, Set or Pair - e.g. 1 N</p>
            ) : (parseNetQuantity(form.net_quantity)?.count ?? 0) > NET_QTY_WARN_ABOVE ? (
              <p className="text-xs text-amber-700">More than {NET_QTY_WARN_ABOVE} in one listing - check this is right.</p>
            ) : null}
          </Section>

          <AiDeclarationField idPrefix="pe" value={aiContentStatus} onChange={setAiContentStatus} />
          {needsOriginals && (
            <AiOriginalPhotosField ownerFolder={vendorId || "platform"} value={originalPhotos} onChange={setOriginalPhotos} />
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 mt-6 flex items-center justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {product ? "Save changes" : "Create product"}
        </Button>
      </div>
    </>
  );
}
