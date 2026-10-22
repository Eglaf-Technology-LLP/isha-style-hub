import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Clock, Loader2, Search, X } from "lucide-react";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { useUiStore } from "@/stores/uiStore";
import { useStoreCategories } from "@/hooks/useStorefront";
import { POPULAR_SEARCHES } from "@/content/storefront";
import { SmartImage } from "./SmartImage";
import { BrandPlaceholder } from "./BrandPlaceholder";
import { formatINR } from "@/lib/format";

// Full-width search panel that drops down under the header: live product and
// category results, recent and popular searches. Enter opens the full
// results page (/category/all?search=...).
export function SearchPanel() {
  const { searchOpen, setSearchOpen } = useUiStore();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { query, setQuery, results, loading, recentSearches, saveRecentSearch, clearRecentSearches } = useGlobalSearch();
  const { data: categories = [] } = useStoreCategories();

  useEffect(() => {
    if (!searchOpen) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSearchOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [searchOpen, setSearchOpen]);

  if (!searchOpen) return null;

  const close = () => {
    setSearchOpen(false);
    setQuery("");
  };
  const go = (term: string) => {
    if (!term.trim()) return;
    saveRecentSearch(term.trim());
    close();
    navigate(`/category/all?search=${encodeURIComponent(term.trim())}`);
  };

  const products = results.filter((r) => r.type === "product");
  const cats = results.filter((r) => r.type === "category");

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Search">
      <button type="button" aria-label="Close search" className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={close} />
      <div className="relative max-h-[90vh] overflow-y-auto bg-ivory shadow-xl animate-fade-in">
        <div className="store-container py-6 md:py-10">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go(query);
            }}
            className="flex items-center gap-3 border-b border-foreground/20 pb-3"
          >
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for sarees, lehengas, boutiques..."
              className="min-w-0 flex-1 bg-transparent font-serif text-2xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none md:text-3xl"
            />
            {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            <button type="button" onClick={close} aria-label="Close search" className="p-1 text-muted-foreground hover:text-foreground">
              <X className="h-6 w-6" />
            </button>
          </form>

          {query.trim() ? (
            <div className="mt-8 grid gap-10 md:grid-cols-[220px_1fr]">
              <div>
                <p className="eyebrow mb-4 text-gold">Categories</p>
                {cats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No matching categories</p>
                ) : (
                  <ul className="space-y-2">
                    {cats.map((c) => (
                      <li key={c.id}>
                        <Link to={`/category/${c.slug}`} onClick={close} className="link-draw text-[15px] hover:text-primary">
                          {c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="eyebrow mb-4 text-gold">Products</p>
                {products.length === 0 && !loading ? (
                  <p className="text-sm text-muted-foreground">No products match "{query}" yet.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {products.slice(0, 8).map((p) => (
                      <Link key={p.id} to={`/product/${p.id}`} onClick={() => { saveRecentSearch(query); close(); }} className="group">
                        <div className="relative aspect-[3/4] overflow-hidden bg-ivory">
                          <SmartImage src={p.image} alt={p.name} width={320} className="absolute inset-0 h-full w-full object-cover" fallback={<BrandPlaceholder />} />
                        </div>
                        <p className="mt-2 line-clamp-1 text-sm group-hover:text-primary">{p.name}</p>
                        {p.price != null && <p className="text-sm text-muted-foreground">{formatINR(p.price)}</p>}
                      </Link>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => go(query)}
                  className="mt-6 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-primary"
                >
                  <span className="link-draw">See all results for "{query}"</span> <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-8 grid gap-10 md:grid-cols-3">
              {recentSearches.length > 0 && (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <p className="eyebrow text-gold">Recent</p>
                    <button type="button" onClick={clearRecentSearches} className="text-xs text-muted-foreground hover:text-foreground">
                      Clear
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {recentSearches.map((t) => (
                      <li key={t}>
                        <button type="button" onClick={() => go(t)} className="flex items-center gap-2 text-[15px] hover:text-primary">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" /> {t}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="eyebrow mb-4 text-gold">Popular searches</p>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_SEARCHES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => go(t)}
                      className="border border-foreground/15 px-3.5 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="eyebrow mb-4 text-gold">Shop by category</p>
                <ul className="space-y-2">
                  {categories.map((c) => (
                    <li key={c.id}>
                      <Link to={`/category/${c.slug}`} onClick={close} className="link-draw text-[15px] hover:text-primary">
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
