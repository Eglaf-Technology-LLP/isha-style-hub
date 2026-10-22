import { useMemo } from "react";
import { ProductRail } from "@/components/storefront/ProductRail";
import { useStoreProducts } from "@/hooks/useStorefront";

interface RelatedProductsProps {
  currentProductId: string;
  categoryId: string | null;
  categorySlug?: string | null;
  vendor?: { id: string; name: string; slug: string } | null;
}

// Product page rows: "More from <boutique>" and "You may also like" (same
// category, topped up with the newest pieces), from the cached catalogue.
export function RelatedProducts({ currentProductId, categoryId, categorySlug, vendor }: RelatedProductsProps) {
  const { data: products = [], isLoading } = useStoreProducts();

  const { fromBoutique, similar } = useMemo(() => {
    const others = products.filter((p) => p.id !== currentProductId);
    const fromBoutique = vendor ? others.filter((p) => p.vendor_id === vendor.id).slice(0, 12) : [];
    const shown = new Set(fromBoutique.map((p) => p.id));
    const sameCategory = categoryId ? others.filter((p) => p.category_id === categoryId) : [];
    const fresh = sameCategory.filter((p) => !shown.has(p.id));
    let similar = fresh.length >= 4 ? fresh : sameCategory;
    if (similar.length < 8) {
      const ids = new Set(similar.map((p) => p.id));
      similar = [...similar, ...others.filter((p) => !ids.has(p.id) && !shown.has(p.id))].slice(0, 12);
    }
    return { fromBoutique, similar: similar.slice(0, 12) };
  }, [products, currentProductId, categoryId, vendor]);

  return (
    <>
      {vendor && fromBoutique.length > 0 && (
        <ProductRail
          eyebrow="From the same boutique"
          title="More from"
          accent={vendor.name}
          action={{ label: "Visit boutique", href: `/store/${vendor.slug}` }}
          products={fromBoutique}
          className="py-14 md:py-20"
        />
      )}
      <ProductRail
        eyebrow="Curated for you"
        title="You may"
        accent="also like"
        action={{ label: "View all", href: categorySlug ? `/category/${categorySlug}` : "/category/all" }}
        products={similar}
        loading={isLoading}
        className="border-t border-border py-14 md:py-20"
      />
    </>
  );
}
