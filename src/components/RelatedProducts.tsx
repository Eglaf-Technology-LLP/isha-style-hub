import { Link } from "react-router-dom";
import { ProductCard } from "@/components/ProductCard";
import { useProducts } from "@/hooks/useProducts";

interface RelatedProductsProps {
  currentProductId: string;
  categoryId: string | null;
  tags?: string[];
}

export function RelatedProducts({ currentProductId, categoryId, tags }: RelatedProductsProps) {
  const { products, loading } = useProducts();

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-square bg-muted rounded-lg mb-2" />
            <div className="h-4 bg-muted rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  // Filter related products by category or tags
  const relatedProducts = products
    .filter((p) => p.id !== currentProductId)
    .filter((p) => {
      if (categoryId && p.category_id === categoryId) return true;
      return false;
    })
    .slice(0, 4);

  if (relatedProducts.length === 0) {
    return null;
  }

  return (
    <section className="py-8">
      <h2 className="text-2xl font-semibold mb-6">You May Also Like</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {relatedProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
