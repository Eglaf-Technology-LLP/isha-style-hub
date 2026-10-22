import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";
import { StoreProduct } from "@/hooks/useStorefront";
import { Rail } from "./Rail";
import { SectionHeading } from "./SectionHeading";

interface ProductRailProps {
  eyebrow?: string;
  title: string;
  accent?: string;
  subtitle?: string;
  action?: { label: string; href: string };
  products: StoreProduct[];
  loading?: boolean;
  className?: string;
}

// A titled, swipeable row of product cards.
export function ProductRail({ eyebrow, title, accent, subtitle, action, products, loading, className }: ProductRailProps) {
  if (!loading && products.length === 0) return null;
  const items = loading
    ? Array.from({ length: 5 }).map((_, i) => <ProductCardSkeleton key={i} />)
    : products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 2} />);
  return (
    <section className={className}>
      <div className="store-container">
        <Rail header={<SectionHeading eyebrow={eyebrow} title={title} accent={accent} subtitle={subtitle} action={action} className="mb-0 md:mb-0" />}>
          {items}
        </Rail>
      </div>
    </section>
  );
}
