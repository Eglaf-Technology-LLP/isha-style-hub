import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { HeroSection } from "@/components/HeroSection";
import { CategorySection } from "@/components/CategorySection";
import { ProductGrid } from "@/components/ProductGrid";
import { FeaturesSection } from "@/components/FeaturesSection";
import { RecentlyViewedProducts } from "@/components/RecentlyViewedProducts";
import { ActiveFlashSales } from "@/components/ActiveFlashSales";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { GiftCardSection } from "@/components/GiftCardSection";

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <ActiveFlashSales />
      <HeroSection />
      <CategorySection />
      <ProductGrid title="Featured Products" limit={8} />
      <div className="container mx-auto px-4">
        <RecentlyViewedProducts />
      </div>
      <div className="container mx-auto px-4 py-8">
        <GiftCardSection />
      </div>
      <FeaturesSection />
      <div className="container mx-auto px-4 py-8">
        <NewsletterSignup />
      </div>
      <Footer />
    </div>
  );
}
