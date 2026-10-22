import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { BUDGETS } from "@/content/storefront";
import { StoreBoutique, StoreCategory } from "@/hooks/useStorefront";
import { formatINR } from "@/lib/format";
import { isMulticolour, swatchColor } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { ListingFilters, sortSizes, useListing } from "./useListing";

type Listing = ReturnType<typeof useListing>;

interface FilterPanelProps {
  listing: Listing;
  categories: StoreCategory[];
  boutiques: StoreBoutique[];
  // The page's own category (always included) / boutique (fixed) - hidden
  // from the facets that would duplicate it.
  scopeCategoryId: string | null;
  hideBoutiques?: boolean;
}

export function FilterPanel({ listing, categories, boutiques, scopeCategoryId, hideBoutiques }: FilterPanelProps) {
  const { filters, setFilters, toggle, facets } = listing;
  const catOptions = categories.filter((c) => c.id !== scopeCategoryId && (facets.categories.get(c.id) ?? 0) + (filters.categories.includes(c.id) ? 1 : 0) > 0);
  const boutiqueOptions = boutiques.filter((b) => (facets.boutiques.get(b.id) ?? 0) > 0 || filters.boutiques.includes(b.id));
  const sizes = sortSizes([...facets.sizes.keys()]);
  const colors = [...facets.colors.keys()].sort();

  return (
    <div className="divide-y divide-border border-y border-border">
      {catOptions.length > 0 && (
        <Section title={scopeCategoryId ? "Add categories" : "Category"} count={filters.categories.length}>
          {catOptions.map((c) => (
            <CheckRow
              key={c.id}
              label={c.name}
              count={facets.categories.get(c.id) ?? 0}
              checked={filters.categories.includes(c.id)}
              onClick={() => toggle("categories", c.id)}
            />
          ))}
        </Section>
      )}

      {!hideBoutiques && boutiqueOptions.length > 0 && (
        <Section title="Boutique" count={filters.boutiques.length}>
          {boutiqueOptions.map((b) => (
            <CheckRow
              key={b.id}
              label={b.name}
              count={facets.boutiques.get(b.id) ?? 0}
              checked={filters.boutiques.includes(b.id)}
              onClick={() => toggle("boutiques", b.id)}
            />
          ))}
        </Section>
      )}

      <Section title="Price" count={filters.min != null || filters.max != null ? 1 : 0}>
        <PriceFilter filters={filters} setFilters={setFilters} floor={facets.priceMin} ceiling={facets.priceMax} />
      </Section>

      {sizes.length > 0 && (
        <Section title="Size" count={filters.sizes.length}>
          <div className="flex flex-wrap gap-2 pt-1">
            {sizes.map((s) => {
              const active = filters.sizes.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle("sizes", s)}
                  className={cn(
                    "min-w-11 border px-3 py-1.5 text-xs transition-colors",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-foreground/15 hover:border-primary",
                  )}
                  aria-pressed={active}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {colors.length > 0 && (
        <Section title="Colour" count={filters.colors.length}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 pt-1">
            {colors.map((c) => {
              const active = filters.colors.includes(c);
              return (
                <button key={c} type="button" onClick={() => toggle("colors", c)} className="flex items-center gap-2.5 text-left text-sm" aria-pressed={active}>
                  <span
                    className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", active ? "border-primary ring-1 ring-primary ring-offset-2 ring-offset-background" : "border-foreground/20")}
                    style={
                      isMulticolour(c)
                        ? { background: "conic-gradient(#b3261e, #e8c53a, #3f7a4a, #2f5d9e, #6a3d8f, #b3261e)" }
                        : { backgroundColor: swatchColor(c) ?? "hsl(var(--muted))" }
                    }
                  />
                  <span className={cn("truncate capitalize", active && "text-primary")}>{c}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{facets.colors.get(c) ?? 0}</span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Availability" count={(filters.availability !== "all" ? 1 : 0) + (filters.inStock ? 1 : 0)}>
        <CheckRow
          label="Ready to ship"
          count={facets.ready}
          checked={filters.availability === "ready"}
          onClick={() => setFilters({ availability: filters.availability === "ready" ? "all" : "ready" })}
        />
        <CheckRow
          label="Made to order"
          count={facets.madeToOrder}
          checked={filters.availability === "made-to-order"}
          onClick={() => setFilters({ availability: filters.availability === "made-to-order" ? "all" : "made-to-order" })}
        />
        <CheckRow label="In stock only" count={facets.inStock} checked={filters.inStock} onClick={() => setFilters({ inStock: !filters.inStock })} />
      </Section>

      {(facets.sale > 0 || filters.sale) && (
        <Section title="Offers" count={filters.sale ? 1 : 0}>
          <CheckRow label="On sale" count={facets.sale} checked={filters.sale} onClick={() => setFilters({ sale: !filters.sale })} />
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="py-5">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left" aria-expanded={open}>
        <span className="text-[12px] font-medium uppercase tracking-[0.2em]">
          {title}
          {count > 0 && <span className="ml-2 text-primary">({count})</span>}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-4 space-y-2.5">{children}</div>}
    </div>
  );
}

function CheckRow({ label, count, checked, onClick }: { label: string; count: number; checked: boolean; onClick: () => void }) {
  const disabled = count === 0 && !checked;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("flex w-full items-center gap-3 text-left text-sm", disabled && "opacity-40")}
      aria-pressed={checked}
    >
      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center border", checked ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30")}>
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className={cn("flex-1", checked && "text-primary")}>{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </button>
  );
}

function PriceFilter({
  filters,
  setFilters,
  floor,
  ceiling,
}: {
  filters: ListingFilters;
  setFilters: (f: Partial<ListingFilters>) => void;
  floor: number;
  ceiling: number;
}) {
  const lo = Math.floor(floor / 100) * 100;
  const hi = Math.max(Math.ceil(ceiling / 100) * 100, lo + 100);
  const [range, setRange] = useState<[number, number]>([filters.min ?? lo, filters.max ?? hi]);
  useEffect(() => setRange([filters.min ?? lo, filters.max ?? hi]), [filters.min, filters.max, lo, hi]);

  const commit = ([a, b]: number[]) => setFilters({ min: a <= lo ? null : a, max: b >= hi ? null : b });
  const activeBudget = (min?: number, max?: number) => (filters.min ?? null) === (min ?? null) && (filters.max ?? null) === (max ?? null);

  return (
    <div className="space-y-5 pt-1">
      <Slider value={range} min={lo} max={hi} step={100} onValueChange={(v) => setRange(v as [number, number])} onValueCommit={commit} />
      <div className="flex items-center justify-between text-sm">
        <span>{formatINR(range[0])}</span>
        <span className="text-muted-foreground">to</span>
        <span>{formatINR(range[1])}{range[1] >= hi ? "+" : ""}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {BUDGETS.map((b) => {
          const active = activeBudget(b.min, b.max);
          return (
            <button
              key={b.label}
              type="button"
              onClick={() => setFilters(active ? { min: null, max: null } : { min: b.min ?? null, max: b.max ?? null })}
              className={cn(
                "border px-2.5 py-1 text-xs transition-colors",
                active ? "border-primary bg-primary text-primary-foreground" : "border-foreground/15 hover:border-primary",
              )}
            >
              {b.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
