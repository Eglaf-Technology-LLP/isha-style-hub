import { useEffect, useState } from "react";
import { Check, LayoutGrid, Rows3, SlidersHorizontal, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";
import { StoreBoutique, StoreCategory, StoreProduct } from "@/hooks/useStorefront";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FilterPanel } from "./FilterPanel";
import { SORT_LABELS, SortKey, useListing } from "./useListing";

const PAGE = 24;

interface ProductListingProps {
  products: StoreProduct[];
  loading?: boolean;
  categories: StoreCategory[];
  boutiques: StoreBoutique[];
  scopeCategoryId: string | null;
  hideBoutiques?: boolean;
  emptyText?: string;
}

// Filterable, sortable product grid with a sticky filter sidebar (desktop)
// and Sort / Filter sheets (phones). Filters live in the URL.
export function ProductListing({
  products,
  loading,
  categories,
  boutiques,
  scopeCategoryId,
  hideBoutiques,
  emptyText = "No pieces match these filters yet.",
}: ProductListingProps) {
  const listing = useListing(products, scopeCategoryId);
  const { filters, setFilters, toggle, clearAll, results, activeCount } = listing;
  const [shown, setShown] = useState(PAGE);
  const [dense, setDense] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // Back to the first page whenever the filters change.
  useEffect(() => setShown(PAGE), [filters]);

  const name = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? id;
  const chips: { label: string; clear: () => void }[] = [
    ...filters.categories.map((id) => ({ label: name(categories, id), clear: () => toggle("categories", id) })),
    ...filters.boutiques.map((id) => ({ label: name(boutiques, id), clear: () => toggle("boutiques", id) })),
    ...(filters.min != null || filters.max != null
      ? [
          {
            label:
              filters.min != null && filters.max != null
                ? `${formatINR(filters.min)} – ${formatINR(filters.max)}`
                : filters.min != null
                  ? `From ${formatINR(filters.min)}`
                  : `Up to ${formatINR(filters.max)}`,
            clear: () => setFilters({ min: null, max: null }),
          },
        ]
      : []),
    ...filters.sizes.map((s) => ({ label: `Size ${s}`, clear: () => toggle("sizes", s) })),
    ...filters.colors.map((c) => ({ label: c, clear: () => toggle("colors", c) })),
    ...(filters.availability === "ready" ? [{ label: "Ready to ship", clear: () => setFilters({ availability: "all" }) }] : []),
    ...(filters.availability === "made-to-order" ? [{ label: "Made to order", clear: () => setFilters({ availability: "all" }) }] : []),
    ...(filters.inStock ? [{ label: "In stock", clear: () => setFilters({ inStock: false }) }] : []),
    ...(filters.sale ? [{ label: "On sale", clear: () => setFilters({ sale: false }) }] : []),
  ];

  const panel = (
    <FilterPanel
      listing={listing}
      categories={categories}
      boutiques={boutiques}
      scopeCategoryId={scopeCategoryId}
      hideBoutiques={hideBoutiques}
    />
  );
  const visible = results.slice(0, shown);

  return (
    <div className="store-container pb-24 pt-8 md:pt-10">
      <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-12">
        {/* Sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-36 max-h-[calc(100vh-10rem)] overflow-y-auto pr-2 no-scrollbar">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-medium uppercase tracking-[0.2em]">Filters</p>
              {activeCount > 0 && (
                <button type="button" onClick={clearAll} className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
                  Clear all
                </button>
              )}
            </div>
            {panel}
          </div>
        </aside>

        <div className="min-w-0">
          {/* Toolbar */}
          <div className="mb-5 flex items-center justify-between gap-4 border-b border-border pb-4">
            <p className="text-sm text-muted-foreground">
              {loading ? "Loading pieces…" : `${results.length} ${results.length === 1 ? "piece" : "pieces"}`}
            </p>
            <div className="hidden items-center gap-5 lg:flex">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Sort by</span> {SORT_LABELS[filters.sort]}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                    <DropdownMenuItem key={k} onClick={() => setFilters({ sort: k })} className="justify-between">
                      {SORT_LABELS[k]} {filters.sort === k && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex items-center gap-1 border-l border-border pl-5">
                <button type="button" onClick={() => setDense(false)} aria-label="Larger pictures" className={cn("p-1.5", !dense ? "text-primary" : "text-muted-foreground")}>
                  <Rows3 className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setDense(true)} aria-label="More per row" className={cn("p-1.5", dense ? "text-primary" : "text-muted-foreground")}>
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={c.clear}
                  className="inline-flex items-center gap-1.5 border border-foreground/15 bg-ivory px-3 py-1.5 text-xs capitalize hover:border-primary"
                >
                  {c.label} <X className="h-3 w-3" />
                </button>
              ))}
              <button type="button" onClick={clearAll} className="px-2 text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
                Clear all
              </button>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="py-24 text-center">
              <p className="font-serif text-2xl">Nothing here just yet</p>
              <p className="mt-2 text-sm text-muted-foreground">{emptyText}</p>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="mt-6 h-11 border border-foreground px-6 text-[11px] font-medium uppercase tracking-[0.2em] hover:bg-foreground hover:text-background"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className={cn("grid grid-cols-2 gap-x-4 gap-y-10 md:gap-x-6 md:gap-y-12", dense ? "md:grid-cols-3 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-3")}>
                {visible.map((p, i) => (
                  <ProductCard key={p.id} product={p} priority={i < 4} />
                ))}
              </div>
              {results.length > shown && (
                <div className="mt-14 flex flex-col items-center gap-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Showing {visible.length} of {results.length}
                  </p>
                  <div className="h-px w-48 bg-border">
                    <div className="h-px bg-primary" style={{ width: `${(visible.length / results.length) * 100}%` }} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + PAGE)}
                    className="h-12 border border-foreground px-10 text-[11px] font-medium uppercase tracking-[0.22em] transition-colors hover:bg-foreground hover:text-background"
                  >
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Phones: sticky Sort / Filter bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 border-t border-border bg-ivory/95 backdrop-blur-md lg:hidden">
        <button type="button" onClick={() => setSortOpen(true)} className="flex h-14 items-center justify-center gap-2 border-r border-border text-[12px] font-medium uppercase tracking-[0.18em]">
          Sort
        </button>
        <button type="button" onClick={() => setFiltersOpen(true)} className="flex h-14 items-center justify-center gap-2 text-[12px] font-medium uppercase tracking-[0.18em]">
          <SlidersHorizontal className="h-4 w-4" /> Filter {activeCount > 0 && <span className="text-primary">({activeCount})</span>}
        </button>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 bg-ivory p-0 sm:max-w-sm">
          <SheetHeader className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <SheetTitle className="font-serif text-xl font-normal">Filters</SheetTitle>
            {activeCount > 0 && (
              <button type="button" onClick={clearAll} className="mr-8 text-xs text-muted-foreground underline">
                Clear all
              </button>
            )}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5">{panel}</div>
          <div className="border-t border-border p-4">
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="h-12 w-full bg-primary text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground"
            >
              Show {results.length} {results.length === 1 ? "piece" : "pieces"}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={sortOpen} onOpenChange={setSortOpen}>
        <SheetContent side="bottom" className="bg-ivory">
          <SheetHeader>
            <SheetTitle className="font-serif text-xl font-normal">Sort by</SheetTitle>
          </SheetHeader>
          <ul className="mt-4 divide-y divide-border">
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => {
                    setFilters({ sort: k });
                    setSortOpen(false);
                  }}
                  className={cn("flex w-full items-center justify-between py-3.5 text-[15px]", filters.sort === k && "text-primary")}
                >
                  {SORT_LABELS[k]} {filters.sort === k && <Check className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}
