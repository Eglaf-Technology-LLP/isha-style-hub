import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowRight } from "lucide-react";
import { getOptimizedImageUrl } from "@/lib/imageUrl";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
}

// Now that --primary/--secondary/--foreground are all near-black (matching
// the real brand's true-black buttons), a fallback tile mixing only those
// would render as a flat, uninteresting near-solid black. Blending in
// --brand-accent (the confirmed rust accent) keeps these on-brand with the
// same black+rust language the rest of the palette uses, instead of the
// old pink/purple/blue rainbow set this replaced.
const gradients = [
  "bg-[linear-gradient(135deg,hsl(var(--brand-accent)),hsl(var(--primary)))]",
  "bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--brand-accent)))]",
  "bg-[linear-gradient(135deg,hsl(var(--brand-accent)/0.85),hsl(var(--foreground)))]",
  "bg-[linear-gradient(135deg,hsl(var(--foreground)),hsl(var(--brand-accent)))]",
  "bg-[linear-gradient(150deg,hsl(var(--primary)),hsl(var(--brand-accent)/0.9))]",
  "bg-[linear-gradient(150deg,hsl(var(--brand-accent)),hsl(var(--foreground)))]",
];

export function CategorySection() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const { data, error } = await supabase
          .from("categories")
          .select("*")
          .order("name")
          .limit(6);

        if (error) throw error;
        setCategories(data || []);
      } catch (error) {
        console.error("Error fetching categories:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchCategories();
  }, []);

  if (loading) {
    return (
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif font-bold mb-4">
              Shop by Category
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Explore our curated collections designed for every occasion
            </p>
          </div>
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      </section>
    );
  }

  if (categories.length === 0) {
    return (
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif font-bold mb-4">
              Shop by Category
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Categories coming soon! Add categories from the admin panel.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 bg-card">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif font-bold tracking-tight mb-4">
            Shop by <span className="italic text-brand">Category</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Explore our curated collections designed for every occasion
          </p>
        </div>

        <div className={`grid gap-4 md:gap-6 ${
          categories.length === 1 
            ? "grid-cols-1 max-w-md mx-auto" 
            : categories.length === 2 
              ? "grid-cols-2 max-w-2xl mx-auto"
              : "grid-cols-2 lg:grid-cols-3"
        }`}>
          {categories.map((category, index) => (
            <Link
              key={category.id}
              to={`/category/${category.slug}`}
              className="group relative overflow-hidden rounded-lg aspect-[4/3] shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              {category.image_url ? (
                <>
                  <img
                    src={getOptimizedImageUrl(category.image_url, { width: 500 })}
                    alt={category.name}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                </>
              ) : (
                <div
                  className={`absolute inset-0 ${gradients[index % gradients.length]} opacity-90 group-hover:opacity-100 transition-opacity`}
                />
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4">
                <h3 className="text-xl md:text-2xl font-serif font-bold mb-2 text-center">
                  {category.name}
                </h3>
                {category.description && (
                  <p className="text-sm text-white/80 text-center line-clamp-2 mb-3">
                    {category.description}
                  </p>
                )}
                <span className="flex items-center gap-1 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Shop Now <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
