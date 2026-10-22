import { useMemo } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { RecentlyViewedProducts } from "@/components/RecentlyViewedProducts";
import { ActiveFlashSales } from "@/components/ActiveFlashSales";
import { HeroCarousel } from "@/components/storefront/home/HeroCarousel";
import { CategoryArches } from "@/components/storefront/home/CategoryArches";
import { OccasionSplit } from "@/components/storefront/home/OccasionSplit";
import { BoutiqueSpotlight } from "@/components/storefront/home/BoutiqueSpotlight";
import { VideoReels } from "@/components/storefront/home/VideoReels";
import { BudgetTiles } from "@/components/storefront/home/BudgetTiles";
import { PromiseBand } from "@/components/storefront/home/PromiseBand";
import { SellBand } from "@/components/storefront/home/SellBand";
import { ProductRail } from "@/components/storefront/ProductRail";
import { useStoreProducts } from "@/hooks/useStorefront";
import { shuffleArray } from "@/lib/shuffleArray";

export default function Index() {
  const { data: products = [], isLoading } = useStoreProducts();
  // Products come newest first; "Handpicked" is a fresh mix on every visit
  // (there's no best-seller data to rank by yet).
  const newest = products.slice(0, 12);
  const handpicked = useMemo(() => shuffleArray(products.slice(12).length >= 6 ? products.slice(12) : products).slice(0, 12), [products]);
  const onSale = products.filter((p) => p.compare_at_price && p.compare_at_price > p.price);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroCarousel />
        <div className="store-container">
          <ActiveFlashSales />
        </div>
        <CategoryArches />
        <ProductRail
          eyebrow="Just landed"
          title="New"
          accent="arrivals"
          action={{ label: "View all", href: "/category/all?sort=newest" }}
          products={newest}
          loading={isLoading}
          className="pb-16 md:pb-24"
        />
        <OccasionSplit />
        <ProductRail
          eyebrow="Curated for you"
          title="Handpicked"
          accent="pieces"
          action={{ label: "Shop all", href: "/category/all" }}
          products={handpicked}
          loading={isLoading}
          className="pt-16 md:pt-24"
        />
        <BoutiqueSpotlight />
        <VideoReels />
        {onSale.length >= 4 && (
          <ProductRail
            eyebrow="Limited time"
            title="On"
            accent="sale"
            action={{ label: "Shop the sale", href: "/category/all?sale=1" }}
            products={onSale.slice(0, 12)}
            className="py-16 md:py-24"
          />
        )}
        <BudgetTiles />
        <PromiseBand />
        <RecentlyViewedProducts />
        <SellBand />
      </main>
      <Footer />
    </div>
  );
}
