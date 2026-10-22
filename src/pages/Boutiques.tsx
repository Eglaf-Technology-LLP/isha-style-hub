import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useStoreBoutiques, useStoreProducts } from "@/hooks/useStorefront";
import { BoutiqueCard } from "@/components/storefront/home/BoutiqueSpotlight";
import { Ornament } from "@/components/storefront/Ornament";
import { Skeleton } from "@/components/ui/skeleton";

// Every approved boutique, with its banner/logo and live piece count.
export default function Boutiques() {
  const { data: boutiques = [], isLoading } = useStoreBoutiques();
  const { data: products = [] } = useStoreProducts();
  const cards = boutiques
    .map((b) => ({
      boutique: b,
      pieces: products.filter((p) => p.vendor_id === b.id).length,
      cover: products.find((p) => p.vendor_id === b.id && p.images?.[0])?.images[0] ?? null,
    }))
    .sort((a, b) => b.pieces - a.pieces);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="border-b border-border bg-ivory py-14 text-center md:py-20">
          <div className="store-container">
            <p className="eyebrow text-gold">The boutiques</p>
            <h1 className="mt-3 font-serif text-4xl md:text-6xl">
              Independent labels, <em className="text-primary">one address</em>
            </h1>
            <Ornament className="mt-6" />
            <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              Every boutique on AllBoutiqs is checked and verified before it sells. Explore each one's full collection.
            </p>
          </div>
        </section>
        <section className="py-14 md:py-20">
          <div className="store-container">
            {isLoading ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[4/5] rounded-none" />
                ))}
              </div>
            ) : cards.length === 0 ? (
              <p className="py-16 text-center text-muted-foreground">Boutiques are joining soon.</p>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((c) => (
                  <BoutiqueCard key={c.boutique.id} {...c} />
                ))}
              </div>
            )}
            <div className="mt-16 text-center">
              <p className="text-muted-foreground">Own a boutique?</p>
              <Link to="/sell-with-us" className="mt-2 inline-block font-serif text-2xl text-primary link-draw">
                Sell on AllBoutiqs
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
