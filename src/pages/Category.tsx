import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductGrid } from "@/components/ProductGrid";
import { FeaturesSection } from "@/components/FeaturesSection";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export default function Category() {
  const { slug } = useParams<{ slug: string }>();
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCategory() {
      if (!slug) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("categories")
          .select("*")
          .eq("slug", slug)
          .single();

        if (error) throw error;
        setCategory(data);
      } catch (error) {
        console.error("Error fetching category:", error);
        setCategory(null);
      } finally {
        setLoading(false);
      }
    }

    fetchCategory();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex justify-center items-center py-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Category Hero */}
      <section className="bg-gradient-to-r from-primary/10 to-accent py-12 md:py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">
            {category?.name || "All Products"}
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {category?.description || "Explore our complete collection"}
          </p>
        </div>
      </section>

      {/* Products */}
      <ProductGrid categorySlug={slug} limit={24} />

      <FeaturesSection />
      <Footer />
    </div>
  );
}
