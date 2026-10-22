import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { StoreBoutique, useStoreBoutiques, useStoreProducts } from "@/hooks/useStorefront";
import { SectionHeading } from "../SectionHeading";
import { SmartImage } from "../SmartImage";
import { BrandPlaceholder } from "../BrandPlaceholder";
import { Rail } from "../Rail";

export function BoutiqueCard({ boutique, pieces, cover }: { boutique: StoreBoutique; pieces: number; cover: string | null }) {
  return (
    <Link to={`/store/${boutique.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden bg-maroon-deep">
        <SmartImage
          src={boutique.banner_url || cover}
          alt={boutique.name}
          width={700}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] group-hover:scale-105"
          fallback={<BrandPlaceholder tone="dark" label={boutique.name} />}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-ivory md:p-6">
          <div className="mb-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-ivory/40 bg-ivory">
            {boutique.logo_url ? (
              <img src={boutique.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="font-serif text-2xl text-primary">{boutique.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <p className="flex items-center gap-2 font-serif text-2xl leading-tight">
            {boutique.name}
            {boutique.is_verified && <BadgeCheck className="h-5 w-5 shrink-0 text-gold" aria-label="Verified boutique" />}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-ivory/75">
            <span>
              {pieces} {pieces === 1 ? "piece" : "pieces"}
              {boutique.is_founding && " · Founding boutique"}
            </span>
            <span className="flex items-center gap-1.5 text-ivory group-hover:text-gold">
              Explore <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// "Meet the boutiques": the marketplace's independent labels, each with its
// banner (or a product photo), logo and live piece count.
export function BoutiqueSpotlight() {
  const { data: boutiques = [] } = useStoreBoutiques();
  const { data: products = [] } = useStoreProducts();
  const live = boutiques
    .map((b) => ({
      boutique: b,
      pieces: products.filter((p) => p.vendor_id === b.id).length,
      cover: products.find((p) => p.vendor_id === b.id && p.images?.[0])?.images[0] ?? null,
    }))
    .filter((b) => b.pieces > 0)
    .sort((a, b) => b.pieces - a.pieces);
  if (live.length === 0) return null;

  const heading = (
    <SectionHeading
      eyebrow="Meet the boutiques"
      title="Independent labels,"
      accent="one address"
      subtitle="Every boutique on AllBoutiqs is verified - shop their full collections in one place."
      action={{ label: "All boutiques", href: "/boutiques" }}
      className="mb-0 md:mb-0"
    />
  );
  const cards = live.map((b) => <BoutiqueCard key={b.boutique.id} {...b} />);

  return (
    <section className="py-16 md:py-24">
      <div className="store-container">
        <Rail header={heading} itemClassName="basis-[78%] sm:basis-[46%] lg:basis-[31.5%]">
          {cards}
        </Rail>
      </div>
    </section>
  );
}
