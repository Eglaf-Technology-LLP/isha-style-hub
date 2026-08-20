import { useEffect, useState } from "react";
import { ProductCard } from "./ProductCard";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShoppingBag } from "lucide-react";
import { Product, mapDbVariant } from "@/hooks/useProducts";

interface ProductGridProps {
  categoryId?: string | null;
  categorySlug?: string;
  title?: string;
  limit?: number;
}

export function ProductGrid({ categoryId, categorySlug, title, limit = 12 }: ProductGridProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      try {
        let query = supabase
          .from("products")
          .select("*, product_variants(*)")
          .eq("is_active", true)
          .eq("approval_status", "approved")
          .order("created_at", { ascending: false });

        // If categorySlug is provided, first get the category ID
        if (categorySlug) {
          const { data: categoryData } = await supabase
            .from("categories")
            .select("id")
            .eq("slug", categorySlug)
            .single();

          if (categoryData) {
            query = query.eq("category_id", categoryData.id);
          }
        } else if (categoryId) {
          query = query.eq("category_id", categoryId);
        }

        if (limit) {
          query = query.limit(limit);
        }

        const { data, error } = await query;

        if (error) throw error;

        const typedProducts: Product[] = (data || []).map((p) => ({
          ...p,
          images: (p.images as string[]) || [],
          variants: (p.product_variants || []).map(mapDbVariant),
        }));

        setProducts(typedProducts);
      } catch (error) {
        console.error("Failed to fetch products:", error);
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, [categoryId, categorySlug, limit]);

  if (loading) {
    return (
      <div className="py-16">
        <div className="container mx-auto px-4">
          {title && (
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-center mb-12">
              {title}
            </h2>
          )}
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="py-16">
        <div className="container mx-auto px-4">
          {title && (
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-center mb-12">
              {title}
            </h2>
          )}
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShoppingBag className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-medium mb-2">No products found</h3>
            <p className="text-muted-foreground max-w-md">
              We're adding new products soon. Check back later!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        {title && (
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-center mb-12">
            {title}
          </h2>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
