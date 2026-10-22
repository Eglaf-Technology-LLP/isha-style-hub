import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { OCCASIONS } from "@/content/storefront";
import { categoryCover, useStoreCategories, useStoreProducts } from "@/hooks/useStorefront";
import { SmartImage } from "../SmartImage";
import { BrandPlaceholder } from "../BrandPlaceholder";

// "For every occasion": copy on the left, four occasion tiles on the right.
export function OccasionSplit() {
  const { data: categories = [] } = useStoreCategories();
  const { data: products = [] } = useStoreProducts();
  const tiles = OCCASIONS.map((o) => ({ ...o, category: categories.find((c) => c.slug === o.categorySlug) })).filter(
    (t) => t.category,
  );
  if (tiles.length === 0) return null;

  return (
    <section className="bg-ivory py-16 md:py-24">
      <div className="store-container grid gap-10 lg:grid-cols-[minmax(0,340px)_1fr] lg:items-center lg:gap-16">
        <div>
          <p className="eyebrow mb-3 text-gold">For every occasion</p>
          <h2 className="font-serif text-4xl leading-[1.1] md:text-5xl">
            Dressed for <em className="text-primary">every moment</em>
          </h2>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            From the haldi to the reception, from office Mondays to festive evenings - find the piece that fits the moment.
          </p>
          <Link
            to="/category/all"
            className="mt-8 inline-flex h-12 items-center gap-3 border border-foreground px-8 text-[11px] font-medium uppercase tracking-[0.22em] transition-colors hover:bg-foreground hover:text-background"
          >
            Explore all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
          {tiles.map((t) => (
            <Link key={t.label} to={`/category/${t.categorySlug}`} className="group">
              <div className="relative aspect-[3/4] overflow-hidden bg-background">
                <SmartImage
                  src={t.category!.image_url || categoryCover(t.category!.id, products)}
                  alt={t.label}
                  width={600}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] group-hover:scale-105"
                  fallback={<BrandPlaceholder label={t.label} />}
                />
              </div>
              <p className="mt-4 text-[12px] font-medium uppercase tracking-[0.2em] group-hover:text-primary">{t.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t.blurb}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
