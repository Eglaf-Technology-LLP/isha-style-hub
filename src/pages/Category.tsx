import { useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductGrid } from "@/components/ProductGrid";
import { FeaturesSection } from "@/components/FeaturesSection";

const categoryInfo: Record<string, { title: string; description: string; query?: string }> = {
  dresses: {
    title: "Dresses",
    description: "Discover our collection of elegant dresses for every occasion",
    query: "product_type:dress OR title:dress"
  },
  shirts: {
    title: "Shirts",
    description: "From casual to formal, find your perfect shirt",
    query: "product_type:shirt OR title:shirt"
  },
  pants: {
    title: "Pants",
    description: "Comfortable and stylish pants for everyday wear",
    query: "product_type:pants OR title:pants OR title:trouser"
  },
  ethnic: {
    title: "Ethnic Wear",
    description: "Traditional beauty with modern elegance",
    query: "product_type:ethnic OR tag:ethnic OR title:kurta OR title:saree"
  },
  new: {
    title: "New Arrivals",
    description: "Be the first to shop our latest additions",
    query: "tag:new"
  },
};

export default function Category() {
  const { slug } = useParams<{ slug: string }>();
  const category = categoryInfo[slug || ''] || {
    title: "All Products",
    description: "Explore our complete collection",
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Category Hero */}
      <section className="bg-gradient-to-r from-primary/10 to-accent py-12 md:py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">
            {category.title}
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {category.description}
          </p>
        </div>
      </section>

      {/* Products */}
      <ProductGrid query={category.query} limit={24} />

      <FeaturesSection />
      <Footer />
    </div>
  );
}
