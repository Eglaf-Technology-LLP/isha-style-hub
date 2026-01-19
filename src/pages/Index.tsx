import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { HeroSection } from "@/components/HeroSection";
import { CategorySection } from "@/components/CategorySection";
import { ProductGrid } from "@/components/ProductGrid";
import { FeaturesSection } from "@/components/FeaturesSection";
import { RecentlyViewedProducts } from "@/components/RecentlyViewedProducts";

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <HeroSection />
      <CategorySection />
      <ProductGrid title="Featured Products" limit={8} />
      <RecentlyViewedProducts />
      <FeaturesSection />
      <Footer />
    </div>
  );
}
