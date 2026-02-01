import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";

export interface SearchResult {
  id: string;
  name: string;
  type: "product" | "category";
  image?: string;
  price?: number;
  slug?: string;
}

export function useGlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const debouncedQuery = useDebounce(query, 300);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("recentSearches");
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, []);

  // Save search to recent searches
  const saveRecentSearch = useCallback((term: string) => {
    if (!term.trim()) return;
    
    const updated = [term, ...recentSearches.filter(s => s !== term)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem("recentSearches", JSON.stringify(updated));
  }, [recentSearches]);

  // Clear recent searches
  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem("recentSearches");
  }, []);

  // Perform search
  useEffect(() => {
    const search = async () => {
      if (!debouncedQuery.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const searchTerm = `%${debouncedQuery}%`;

        // Search products
        const { data: products, error: productsError } = await supabase
          .from("products")
          .select("id, name, images, price")
          .eq("is_active", true)
          .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
          .limit(8);

        if (productsError) throw productsError;

        // Search categories
        const { data: categories, error: categoriesError } = await supabase
          .from("categories")
          .select("id, name, slug, image_url")
          .ilike("name", searchTerm)
          .limit(4);

        if (categoriesError) throw categoriesError;

        const productResults: SearchResult[] = (products || []).map(p => ({
          id: p.id,
          name: p.name,
          type: "product" as const,
          image: ((p.images as string[]) || [])[0],
          price: p.price,
        }));

        const categoryResults: SearchResult[] = (categories || []).map(c => ({
          id: c.id,
          name: c.name,
          type: "category" as const,
          image: c.image_url || undefined,
          slug: c.slug,
        }));

        setResults([...categoryResults, ...productResults]);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    search();
  }, [debouncedQuery]);

  return {
    query,
    setQuery,
    results,
    loading,
    recentSearches,
    saveRecentSearch,
    clearRecentSearches,
  };
}
