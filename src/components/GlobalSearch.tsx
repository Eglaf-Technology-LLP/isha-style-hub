import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGlobalSearch, SearchResult } from "@/hooks/useGlobalSearch";
import { Search, X, Clock, Tag, FolderOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlobalSearchProps {
  className?: string;
  onClose?: () => void;
  autoFocus?: boolean;
}

export function GlobalSearch({ className, onClose, autoFocus = false }: GlobalSearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const {
    query,
    setQuery,
    results,
    loading,
    recentSearches,
    saveRecentSearch,
    clearRecentSearches,
  } = useGlobalSearch();

  // Auto focus when opened
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Handle clicks outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (result: SearchResult) => {
    saveRecentSearch(result.name);
    setQuery("");
    setIsOpen(false);
    onClose?.();

    if (result.type === "product") {
      navigate(`/product/${result.id}`);
    } else if (result.type === "category") {
      navigate(`/category/${result.slug}`);
    }
  };

  const handleRecentSearch = (term: string) => {
    setQuery(term);
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      saveRecentSearch(query);
      // Navigate to search results page (can be implemented later)
      navigate(`/category/all?search=${encodeURIComponent(query)}`);
      setIsOpen(false);
      onClose?.();
    }
  };

  const showDropdown = isOpen && (query.length > 0 || recentSearches.length > 0);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search products, categories..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsOpen(true)}
            className="pl-10 pr-10"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => setQuery("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>

      {/* Search Results Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-background border border-border rounded-lg shadow-lg z-50 max-h-[400px] overflow-auto">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Results */}
          {!loading && results.length > 0 && (
            <div className="p-2">
              {results.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted rounded-lg transition-colors text-left"
                  onClick={() => handleSelect(result)}
                >
                  {result.image ? (
                    <img
                      src={result.image}
                      alt={result.name}
                      className="h-10 w-10 object-cover rounded"
                    />
                  ) : (
                    <div className="h-10 w-10 bg-muted rounded flex items-center justify-center">
                      {result.type === "category" ? (
                        <FolderOpen className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <Tag className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{result.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {result.type === "category" ? "Category" : "Product"}
                      </Badge>
                      {result.price && (
                        <span className="text-sm text-primary font-medium">
                          ₹{result.price}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* No Results */}
          {!loading && query.length > 0 && results.length === 0 && (
            <div className="p-4 text-center text-muted-foreground">
              <p>No results found for "{query}"</p>
              <p className="text-sm mt-1">Try different keywords</p>
            </div>
          )}

          {/* Recent Searches */}
          {!loading && query.length === 0 && recentSearches.length > 0 && (
            <div className="p-2">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Recent Searches
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={clearRecentSearches}
                >
                  Clear all
                </Button>
              </div>
              {recentSearches.map((term, index) => (
                <button
                  key={index}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted rounded-lg transition-colors text-left"
                  onClick={() => handleRecentSearch(term)}
                >
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{term}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
