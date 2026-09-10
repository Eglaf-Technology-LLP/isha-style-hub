import { useEffect, useState } from "react";
import { ProductCard } from "./ProductCard";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
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
          .select("*, product_variants(*), vendor:vendors(name)")
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
          specifications: (p.specifications as unknown as Product["specifications"]) || [],
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
            <h2 className="text-3xl md:text-4xl font-serif font-bold tracking-tight text-center mb-12">
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

  // ProductGrid is only ever used once in this app - the homepage's
  // "Featured Products" section, stacked among several other sections. A
  // "No products found, check back later" block sitting mid-homepage when
  // there's simply nothing to feature yet looks broken, not helpful - the
  // section should just not exist rather than announce its own emptiness.
  if (products.length === 0) {
    return null;
  }

  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        {title && (
          <h2 className="text-3xl md:text-4xl font-serif font-bold tracking-tight text-center mb-12">
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
