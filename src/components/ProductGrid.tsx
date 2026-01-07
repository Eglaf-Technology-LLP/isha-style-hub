import { useEffect, useState } from "react";
import { ProductCard } from "./ProductCard";
import { fetchProducts, ShopifyProduct } from "@/lib/shopify";
import { Loader2, ShoppingBag } from "lucide-react";

interface ProductGridProps {
  query?: string;
  title?: string;
  limit?: number;
}

export function ProductGrid({ query, title, limit = 12 }: ProductGridProps) {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      try {
        const data = await fetchProducts(limit, query);
        setProducts(data);
      } catch (error) {
        console.error('Failed to fetch products:', error);
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, [query, limit]);

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
              We're adding new products soon. Check back later or tell us what products you'd like to add!
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
            <ProductCard key={product.node.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
