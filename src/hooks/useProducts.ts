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
  created_at: string;
  updated_at: string;
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
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      const typedProducts: Product[] = (data || []).map(p => ({
        ...p,
        images: (p.images as string[]) || [],
        variants: (p.variants as unknown as ProductVariant[]) || [],
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
      // Upload images first
      const imageUrls: string[] = [];
      
      for (const image of images) {
        const fileName = `${Date.now()}-${image.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("category-images")
          .upload(`products/${fileName}`, image);

        if (uploadError) {
          console.error("Image upload error:", uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("category-images")
          .getPublicUrl(`products/${fileName}`);

        if (urlData) {
          imageUrls.push(urlData.publicUrl);
        }
      }

      // Calculate total stock from variants if variants exist
      const totalStock = variants.length > 0 
        ? variants.reduce((sum, v) => sum + (v.stock || 0), 0)
        : productData.stock_quantity;

      const { data, error } = await supabase
        .from("products")
        .insert({
          name: productData.name,
          description: productData.description || null,
          category_id: productData.category_id || null,
          price: productData.price,
          compare_at_price: productData.compare_at_price || null,
          sku: productData.sku || null,
          stock_quantity: totalStock,
          is_active: productData.is_active,
          images: imageUrls,
          variants: variants as unknown as undefined,
        })
        .select()
        .single();

      if (error) throw error;

      const newProduct: Product = {
        ...data,
        images: (data.images as string[]) || [],
        variants: (data.variants as unknown as ProductVariant[]) || [],
      };

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
      let imageUrls: string[] | undefined;

      if (newImages && newImages.length > 0) {
        imageUrls = [];
        for (const image of newImages) {
          const fileName = `${Date.now()}-${image.name}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("category-images")
            .upload(`products/${fileName}`, image);

          if (uploadError) {
            console.error("Image upload error:", uploadError);
            continue;
          }

          const { data: urlData } = supabase.storage
            .from("category-images")
            .getPublicUrl(`products/${fileName}`);

          if (urlData) {
            imageUrls.push(urlData.publicUrl);
          }
        }
      }

      // Calculate total stock from variants if variants exist
      const totalStock = variants && variants.length > 0 
        ? variants.reduce((sum, v) => sum + (v.stock || 0), 0)
        : productData.stock_quantity;

      const updateData: Record<string, unknown> = {
        name: productData.name,
        description: productData.description,
        category_id: productData.category_id,
        price: productData.price,
        compare_at_price: productData.compare_at_price,
        sku: productData.sku,
        stock_quantity: totalStock,
        is_active: productData.is_active,
      };

      if (imageUrls) {
        const existingProduct = products.find(p => p.id === id);
        updateData.images = [...(existingProduct?.images || []), ...imageUrls];
      }

      if (variants !== undefined) {
        updateData.variants = variants;
      }

      const { error } = await supabase
        .from("products")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

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
