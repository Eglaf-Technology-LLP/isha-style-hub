import { useParams } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { FeaturesSection } from "@/components/FeaturesSection";
import { ProductFilters, FilterState } from "@/components/ProductFilters";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useProducts, Product, ProductVariant } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";

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
  const { products, loading: productsLoading } = useProducts();
  const { categories } = useCategories();
  
  const isAllProducts = slug === "all" || !slug;

  const defaultFilters: FilterState = {
    search: "",
    priceRange: [0, 50000],
    categories: [],
    sizes: [],
    colors: [],
    inStock: false,
    sortBy: "popular",
  };

  // Filter state
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  // Reset filters when navigating to a different category
  useEffect(() => {
    setFilters(defaultFilters);
  }, [slug]);

  // Extract available sizes and colors from all products
  const { availableSizes, availableColors, maxPrice } = useMemo(() => {
    const sizes = new Set<string>();
    const colors = new Set<string>();
    let max = 0;

    products.forEach((product) => {
      if (product.price > max) max = product.price;
      if (product.variants) {
        if (Array.isArray(product.variants)) {
          product.variants.forEach((variant: ProductVariant) => {
            if (variant.options?.size) sizes.add(variant.options.size);
            if (variant.options?.Size) sizes.add(variant.options.Size);
            if (variant.options?.color) colors.add(variant.options.color);
            if (variant.options?.Color) colors.add(variant.options.Color);
          });
        } else {
          const variantObj = product.variants as unknown as { sizes?: string[]; colors?: string[] };
          if (variantObj.sizes) variantObj.sizes.forEach(s => sizes.add(s));
          if (variantObj.colors) variantObj.colors.forEach(c => colors.add(c));
        }
      }
    });

    return {
      availableSizes: Array.from(sizes),
      availableColors: Array.from(colors),
      maxPrice: Math.ceil(max / 1000) * 1000 || 50000,
    };
  }, [products]);

  useEffect(() => {
    async function fetchCategory() {
      if (!slug || slug === "all") {
        setCategory(null);
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

  // Filter products based on category and filters
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (isAllProducts) return true;
        return p.category_id === category?.id;
      })
      .filter((p) => p.price >= filters.priceRange[0] && p.price <= filters.priceRange[1])
      .filter((p) => {
        if (filters.search) {
          return p.name.toLowerCase().includes(filters.search.toLowerCase());
        }
        return true;
      })
      .filter((p) => {
        if (filters.inStock) {
          return p.stock_quantity > 0;
        }
        return true;
      })
      .filter((p) => {
        if (filters.categories.length > 0) {
          return p.category_id && filters.categories.includes(p.category_id);
        }
        return true;
      })
      .sort((a, b) => {
        switch (filters.sortBy) {
          case "popular": {
            // Prioritize high margin (compare_at_price - price) and then by price descending
            const marginA = (a.compare_at_price || 0) > a.price ? (a.compare_at_price! - a.price) : 0;
            const marginB = (b.compare_at_price || 0) > b.price ? (b.compare_at_price! - b.price) : 0;
            if (marginB !== marginA) return marginB - marginA;
            return b.price - a.price;
          }
          case "price-low":
            return a.price - b.price;
          case "price-high":
            return b.price - a.price;
          case "name":
            return a.name.localeCompare(b.name);
          case "newest":
          default:
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
      });
  }, [products, isAllProducts, category, filters]);

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

      {/* Filters and Products */}
      <div className="container mx-auto px-4 py-8">
        <ProductFilters
          filters={filters}
          onFiltersChange={setFilters}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          availableSizes={availableSizes}
          availableColors={availableColors}
          maxPrice={maxPrice}
        />

        {/* Products Grid */}
        <main className="mt-6">
          {productsLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted-foreground">No products found matching your criteria</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {filteredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      <FeaturesSection />
      <Footer />
    </div>
  );
}
