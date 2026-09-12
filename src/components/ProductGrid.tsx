import { useEffect, useState } from "react";
import { ProductCard } from "./ProductCard";
import { ProductCardSkeleton } from "./ProductCardSkeleton";
import { supabase } from "@/integrations/supabase/client";
import { Product, mapDbVariant } from "@/hooks/useProducts";

interface ProductGridProps {
  categoryId?: string | null;
  categorySlug?: string;
  title?: string;
  limit?: number;
}

// Ordering by created_at DESC and truncating to `limit` hands the entire
// "Featured Products" section to whichever vendor most recently bulk-added
// or re-saved products - one vendor updating 40 products in a batch used
// to fill every single featured slot, crowding out every other vendor
// entirely. Round-robins one product per vendor per pass instead (each
// vendor's own products stay ordered most-recent-first within their own
// turn), so every vendor represented in the fetched pool gets a fair turn
// before any vendor gets a second slot.
function diversifyByVendor(products: Product[], limit: number): Product[] {
  const byVendor = new Map<string, Product[]>();
  for (const p of products) {
    const key = p.vendor_id ?? "__none__";
    if (!byVendor.has(key)) byVendor.set(key, []);
    byVendor.get(key)!.push(p);
  }
  const vendorGroups = [...byVendor.values()];

  const result: Product[] = [];
  let round = 0;
  while (result.length < limit) {
    let addedAny = false;
    for (const group of vendorGroups) {
      if (round < group.length) {
        result.push(group[round]);
        addedAny = true;
        if (result.length >= limit) break;
      }
    }
    if (!addedAny) break;
    round++;
  }
  return result;
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

        // A modest multiple of `limit` still isn't enough of a pool to
        // diversify fairly: if one or two vendors have bulk-added dozens of
        // products more recently than a third vendor's entire catalog, that
        // third vendor's products can be older than every single row in
        // even a 6x-limit pool and never appear at all - confirmed exactly
        // this happening with real data (a 40/40/20-product 3-vendor
        // catalog, a 48-row pool, and the 20-product vendor entirely
        // excluded). A flat, generous cap - independent of `limit` - keeps
        // every vendor's products in play regardless of when any other
        // vendor happened to add theirs; this app's realistic catalog size
        // is nowhere near where fetching 500 rows here would matter.
        if (limit) {
          query = query.limit(500);
        }

        const { data, error } = await query;

        if (error) throw error;

        const typedProducts: Product[] = (data || []).map((p) => ({
          ...p,
          images: (p.images as string[]) || [],
          variants: (p.product_variants || []).map(mapDbVariant),
          specifications: (p.specifications as unknown as Product["specifications"]) || [],
        }));

        setProducts(limit ? diversifyByVendor(typedProducts, limit) : typedProducts);
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {Array.from({ length: limit }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
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
