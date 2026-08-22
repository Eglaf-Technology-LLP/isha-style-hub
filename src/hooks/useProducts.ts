import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  sku?: string;
  stock: number;
  options: Record<string, string>;
  image_url?: string | null;
}

// adjust_stock's _variant_id/_reason/_reference_order_id are nullable uuid/text
// columns in Postgres, but supabase gen types always marks RPC args as
// required strings - the cast below is narrowly working around that codegen
// gap, not a real type-safety hole (Postgres accepts NULL for all three).
async function adjustStock(args: {
  productId: string;
  variantId: string | null;
  delta: number;
  movementType: "sale" | "restock" | "manual_adjustment" | "return" | "correction";
  reason: string | null;
  referenceOrderId?: string | null;
}) {
  const { error } = await supabase.rpc("adjust_stock", {
    _product_id: args.productId,
    _variant_id: args.variantId,
    _delta: args.delta,
    _movement_type: args.movementType,
    _reason: args.reason,
    _reference_order_id: args.referenceOrderId ?? null,
  } as any);
  if (error) throw error;
}

export interface Product {
  id: string;
  category_id: string | null;
  vendor_id: string | null;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  sku: string | null;
  stock_quantity: number;
  is_active: boolean;
  images: string[];
  variants: ProductVariant[];
  approval_status: string;
  rejection_reason: string | null;
  weight_grams: number | null;
  length_cm: number | null;
  breadth_cm: number | null;
  height_cm: number | null;
  created_at: string;
  updated_at: string;
}

export function mapDbVariant(v: {
  id: string;
  name: string;
  price: number | null;
  sku: string | null;
  stock: number;
  options: unknown;
  image_url?: string | null;
}): ProductVariant {
  return {
    id: v.id,
    name: v.name,
    price: Number(v.price) || 0,
    sku: v.sku || undefined,
    stock: v.stock,
    options: (v.options as Record<string, string>) || {},
    image_url: v.image_url ?? null,
  };
}

export interface ProductFormData {
  name: string;
  description: string;
  category_id: string | null;
  price: number;
  compare_at_price: number | null;
  sku: string;
  stock_quantity: number;
  is_active: boolean;
  // Optional parcel weight/dimensions used when booking a real courier
  // shipment - left unset, "Ship Now" falls back to a platform default.
  weight_grams?: number | null;
  length_cm?: number | null;
  breadth_cm?: number | null;
  height_cm?: number | null;
  // Only vendor-facing callers (VendorProductDialog) set these; omitting
  // them leaves vendor_id/approval_status untouched, matching this hook's
  // long-standing admin-only behavior.
  vendor_id?: string | null;
  approval_status?: string;
  // Full replacement image list, set only by VendorProductDialog (a plain
  // URL textarea, not a file-upload flow) - see applyProductUpdate.
  images?: string[];
}

export async function uploadProductImages(images: File[]): Promise<string[]> {
  const imageUrls: string[] = [];
  for (const image of images) {
    const fileName = `${Date.now()}-${image.name}`;
    const { error: uploadError } = await supabase.storage
      .from("category-images")
      .upload(`products/${fileName}`, image);

    if (uploadError) {
      console.error("Image upload error:", uploadError);
      continue;
    }

    const { data: urlData } = supabase.storage
      .from("category-images")
      .getPublicUrl(`products/${fileName}`);

    if (urlData) imageUrls.push(urlData.publicUrl);
  }
  return imageUrls;
}

export async function fetchProductWithVariants(id: string): Promise<Product> {
  const { data, error } = await supabase
    .from("products")
    .select("*, product_variants(*)")
    .eq("id", id)
    .single();
  if (error) throw error;

  return {
    ...data,
    images: (data.images as string[]) || [],
    variants: (data.product_variants || []).map(mapDbVariant),
  };
}

// Shared by useProducts()'s addProduct and VendorProductDialog, so there is
// exactly one place that creates a product + its variants - previously
// VendorProductDialog wrote directly to Supabase and never touched variants
// at all, which is how the two write paths drifted out of sync in the first
// place. Every unit of starting stock is routed through adjust_stock (rather
// than written directly) so it lands in stock_movements too - the audit
// trail is complete from creation, not just from the first edit.
export async function insertProductRecord(
  productData: ProductFormData,
  imageUrls: string[],
  variants: ProductVariant[] = []
): Promise<string> {
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: productData.name,
      description: productData.description || null,
      category_id: productData.category_id || null,
      price: productData.price,
      compare_at_price: productData.compare_at_price || null,
      sku: productData.sku || null,
      stock_quantity: 0,
      is_active: productData.is_active,
      images: imageUrls,
      weight_grams: productData.weight_grams || null,
      length_cm: productData.length_cm || null,
      breadth_cm: productData.breadth_cm || null,
      height_cm: productData.height_cm || null,
      ...(productData.vendor_id !== undefined ? { vendor_id: productData.vendor_id } : {}),
      ...(productData.approval_status !== undefined
        ? { approval_status: productData.approval_status, rejection_reason: null }
        : {}),
    })
    .select()
    .single();

  if (error) throw error;

  if (variants.length > 0) {
    for (const variant of variants) {
      const { data: variantRow, error: variantError } = await supabase
        .from("product_variants")
        .insert({
          product_id: data.id,
          name: variant.name,
          sku: variant.sku || null,
          options: variant.options,
          price: variant.price,
          image_url: variant.image_url || null,
          stock: 0,
        })
        .select()
        .single();
      if (variantError) throw variantError;

      if (variant.stock > 0) {
        await adjustStock({
          productId: data.id,
          variantId: variantRow.id,
          delta: variant.stock,
          movementType: "restock",
          reason: "Initial stock on product creation",
        });
      }
    }
  } else if (productData.stock_quantity > 0) {
    await adjustStock({
      productId: data.id,
      variantId: null,
      delta: productData.stock_quantity,
      movementType: "restock",
      reason: "Initial stock on product creation",
    });
  }

  return data.id;
}

// Shared by useProducts()'s updateProduct and VendorProductDialog. Note
// stock_quantity is deliberately never written directly here - it's
// protected at the DB level (see protect_stock_columns in the inventory
// migration) and can only change through adjustStock, which keeps it in
// sync with the variant sum (or, for variant-less products, adjusts it
// directly).
export async function applyProductUpdate(
  id: string,
  productData: Partial<ProductFormData>,
  existingProduct: Pick<Product, "images" | "variants" | "stock_quantity"> | undefined,
  imageUrls: string[] | undefined,
  variants: ProductVariant[] | undefined
): Promise<void> {
  const updateData: Record<string, unknown> = {
    name: productData.name,
    description: productData.description,
    category_id: productData.category_id,
    price: productData.price,
    compare_at_price: productData.compare_at_price,
    sku: productData.sku,
    is_active: productData.is_active,
  };
  if (productData.weight_grams !== undefined) updateData.weight_grams = productData.weight_grams || null;
  if (productData.length_cm !== undefined) updateData.length_cm = productData.length_cm || null;
  if (productData.breadth_cm !== undefined) updateData.breadth_cm = productData.breadth_cm || null;
  if (productData.height_cm !== undefined) updateData.height_cm = productData.height_cm || null;

  if (productData.vendor_id !== undefined) {
    updateData.vendor_id = productData.vendor_id;
  }
  if (productData.approval_status !== undefined) {
    updateData.approval_status = productData.approval_status;
    updateData.rejection_reason = null;
  }
  if (productData.images !== undefined) {
    // Vendor form: the textarea holds the complete desired image list, so
    // this replaces it outright rather than appending.
    updateData.images = productData.images;
  } else if (imageUrls) {
    // Admin form: newly uploaded files are appended to what's already
    // there; existing images are removed separately via removeProductImage.
    updateData.images = [...(existingProduct?.images || []), ...imageUrls];
  }

  const { error } = await supabase.from("products").update(updateData).eq("id", id);
  if (error) throw error;

  if (variants !== undefined) {
    const existingVariants = existingProduct?.variants || [];
    const incomingIds = new Set(variants.map((v) => v.id));

    // Removed: zero out its stock through adjust_stock first (so the
    // removal itself leaves an audit trail and the product's aggregate
    // stays in sync), then delete the now-empty row.
    for (const existing of existingVariants) {
      if (incomingIds.has(existing.id)) continue;
      if (existing.stock !== 0) {
        await adjustStock({
          productId: id,
          variantId: existing.id,
          delta: -existing.stock,
          movementType: "correction",
          reason: "Variant removed",
        });
      }
      const { error: deleteError } = await supabase
        .from("product_variants")
        .delete()
        .eq("id", existing.id);
      if (deleteError) throw deleteError;
    }

    for (const incoming of variants) {
      const existing = existingVariants.find((v) => v.id === incoming.id);

      if (!existing) {
        // New variant (VariantManager assigns it a client-side id) -
        // insert at zero stock, then adjust_stock brings it up to the
        // real starting quantity so that quantity is audited too.
        const { data: variantRow, error: insertError } = await supabase
          .from("product_variants")
          .insert({
            product_id: id,
            name: incoming.name,
            sku: incoming.sku || null,
            options: incoming.options,
            price: incoming.price,
            image_url: incoming.image_url || null,
            stock: 0,
          })
          .select()
          .single();
        if (insertError) throw insertError;

        if (incoming.stock > 0) {
          await adjustStock({
            productId: id,
            variantId: variantRow.id,
            delta: incoming.stock,
            movementType: "restock",
            reason: "New variant added",
          });
        }
        continue;
      }

      const { error: fieldsError } = await supabase
        .from("product_variants")
        .update({
          name: incoming.name,
          sku: incoming.sku || null,
          options: incoming.options,
          price: incoming.price,
          image_url: incoming.image_url || null,
        })
        .eq("id", existing.id);
      if (fieldsError) throw fieldsError;

      if (incoming.stock !== existing.stock) {
        await adjustStock({
          productId: id,
          variantId: existing.id,
          delta: incoming.stock - existing.stock,
          movementType: "manual_adjustment",
          reason: "Product edit",
        });
      }
    }
  } else if (
    productData.stock_quantity !== undefined &&
    existingProduct &&
    existingProduct.variants.length === 0 &&
    productData.stock_quantity !== existingProduct.stock_quantity
  ) {
    // Variant-less product, stock_quantity edited directly.
    await adjustStock({
      productId: id,
      variantId: null,
      delta: productData.stock_quantity - existingProduct.stock_quantity,
      movementType: "manual_adjustment",
      reason: "Product edit",
    });
  }
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_variants(*)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const typedProducts: Product[] = (data || []).map((p) => ({
        ...p,
        images: (p.images as string[]) || [],
        variants: (p.product_variants || []).map(mapDbVariant),
      }));

      setProducts(typedProducts);
    } catch (error: any) {
      console.error("Error fetching products:", error);
      toast.error("Failed to fetch products");
    } finally {
      setLoading(false);
    }
  };

  const addProduct = async (
    productData: ProductFormData,
    images: File[],
    variants: ProductVariant[] = []
  ): Promise<Product | null> => {
    try {
      const imageUrls = await uploadProductImages(images);
      const newId = await insertProductRecord(productData, imageUrls, variants);
      const newProduct = await fetchProductWithVariants(newId);

      setProducts((prev) => [newProduct, ...prev]);
      toast.success("Product added successfully");
      return newProduct;
    } catch (error: any) {
      console.error("Error adding product:", error);
      toast.error(error.message || "Failed to add product");
      return null;
    }
  };

  const updateProduct = async (
    id: string,
    productData: Partial<ProductFormData>,
    newImages?: File[],
    variants?: ProductVariant[]
  ): Promise<boolean> => {
    try {
      const imageUrls = newImages && newImages.length > 0 ? await uploadProductImages(newImages) : undefined;
      const existingProduct = products.find((p) => p.id === id);

      await applyProductUpdate(id, productData, existingProduct, imageUrls, variants);

      await fetchProducts();
      toast.success("Product updated successfully");
      return true;
    } catch (error: any) {
      console.error("Error updating product:", error);
      toast.error(error.message || "Failed to update product");
      return false;
    }
  };

  const deleteProduct = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setProducts((prev) => prev.filter((p) => p.id !== id));
      toast.success("Product deleted successfully");
      return true;
    } catch (error: any) {
      console.error("Error deleting product:", error);
      toast.error(error.message || "Failed to delete product");
      return false;
    }
  };

  const toggleProductStatus = async (id: string, isActive: boolean): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("products")
        .update({ is_active: isActive })
        .eq("id", id);

      if (error) throw error;

      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, is_active: isActive } : p))
      );
      toast.success(`Product ${isActive ? "activated" : "deactivated"}`);
      return true;
    } catch (error: any) {
      console.error("Error toggling product status:", error);
      toast.error(error.message || "Failed to update product status");
      return false;
    }
  };

  const removeProductImage = async (productId: string, imageUrl: string): Promise<boolean> => {
    try {
      const product = products.find(p => p.id === productId);
      if (!product) return false;

      const updatedImages = product.images.filter(img => img !== imageUrl);

      const { error } = await supabase
        .from("products")
        .update({ images: updatedImages })
        .eq("id", productId);

      if (error) throw error;

      setProducts(prev =>
        prev.map(p => p.id === productId ? { ...p, images: updatedImages } : p)
      );
      toast.success("Image removed");
      return true;
    } catch (error: any) {
      console.error("Error removing image:", error);
      toast.error("Failed to remove image");
      return false;
    }
  };

  return {
    products,
    loading,
    addProduct,
    updateProduct,
    deleteProduct,
    toggleProductStatus,
    removeProductImage,
    refetch: fetchProducts,
  };
}
