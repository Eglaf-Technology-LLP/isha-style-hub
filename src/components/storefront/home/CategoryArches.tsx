import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { categoryCover, useStoreCategories, useStoreProducts } from "@/hooks/useStorefront";
import { SectionHeading } from "../SectionHeading";
import { SmartImage } from "../SmartImage";
import { BrandPlaceholder } from "../BrandPlaceholder";

// "Shop by category": each category in an Indian arch frame, using its own
// image, else a product photo from it, else the pattern design.
export function CategoryArches() {
  const { data: categories = [] } = useStoreCategories();
  const { data: products = [] } = useStoreProducts();
  if (categories.length === 0) return null;

  const count = (id: string) => products.filter((p) => p.category_id === id).length;

  return (
    <section className="py-16 md:py-24">
      <div className="store-container">
        <SectionHeading eyebrow="Shop by category" title="Find your" accent="silhouette" align="center" />
        <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-6 sm:overflow-visible sm:px-0 lg:grid-cols-5">
          {categories.map((c) => (
            <Link key={c.id} to={`/category/${c.slug}`} className="group w-[42vw] shrink-0 snap-start sm:w-auto">
              <div className="arch relative aspect-[3/4] overflow-hidden bg-ivory ring-1 ring-gold/30 ring-offset-4 ring-offset-background">
                <SmartImage
                  src={c.image_url || categoryCover(c.id, products)}
                  alt={c.name}
                  width={600}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] group-hover:scale-105"
                  fallback={<BrandPlaceholder label={c.name} />}
                />
              </div>
              <div className="mt-5 text-center">
                <p className="font-serif text-xl group-hover:text-primary">{c.name}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {count(c.id)} {count(c.id) === 1 ? "piece" : "pieces"}
                </p>
              </div>
            </Link>
          ))}
          <Link to="/category/all" className="group w-[42vw] shrink-0 snap-start sm:w-auto">
            <div className="arch relative flex aspect-[3/4] flex-col items-center justify-center overflow-hidden bg-maroon-deep pattern-jaal-dark text-ivory ring-1 ring-gold/30 ring-offset-4 ring-offset-background">
              <p className="eyebrow text-gold">Everything</p>
              <p className="mt-2 font-serif text-3xl">Shop all</p>
              <ArrowRight className="mt-4 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </div>
            <div className="mt-5 text-center">
              <p className="font-serif text-xl group-hover:text-primary">All pieces</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{products.length} pieces</p>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
