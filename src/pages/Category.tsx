import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useStoreBoutiques, useStoreCategories, useStoreProducts } from "@/hooks/useStorefront";
import { ProductListing } from "@/components/storefront/listing/ProductListing";
import { SmartImage } from "@/components/storefront/SmartImage";
import { cn } from "@/lib/utils";

export default function Category() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const { data: products = [], isLoading } = useStoreProducts();
  const { data: categories = [], isLoading: categoriesLoading } = useStoreCategories();
  const { data: boutiques = [] } = useStoreBoutiques();

  const isAll = !slug || slug === "all";
  const category = isAll ? null : categories.find((c) => c.slug === slug) ?? null;
  const notFound = !isAll && !categoriesLoading && !category;

  const search = params.get("search") ?? params.get("q") ?? "";
  const boutiqueId = params.get("boutique");
  const boutique = boutiqueId && !boutiqueId.includes(",") ? boutiques.find((b) => b.id === boutiqueId) : null;

  const title = search
    ? `“${search}”`
    : category?.name ?? (params.get("sale") === "1" ? "The Sale" : params.get("sort") === "newest" ? "New In" : "Shop All");
  const eyebrow = search ? "Search results" : category ? "Collection" : "AllBoutiqs";
  const description = search
    ? "Pieces matching your search, from every boutique."
    : category?.description ||
      (category
        ? `${category.name} from India's finest independent boutiques.`
        : "Every piece from every boutique on AllBoutiqs, in one place.");

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="relative overflow-hidden border-b border-border bg-ivory">
          {category?.image_url && (
            <div className="absolute inset-y-0 right-0 hidden w-[42%] md:block">
              <SmartImage src={category.image_url} alt={category.name} width={1000} className="h-full w-full object-cover" fallback={null} />
              <div className="absolute inset-0 bg-gradient-to-r from-ivory via-ivory/20 to-transparent" />
            </div>
          )}
          <div className="store-container relative py-10 md:py-16">
            <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground">
                Home
              </Link>
              <ChevronRight className="h-3 w-3" />
              {category || search ? (
                <>
                  <Link to="/category/all" className="hover:text-foreground">
                    Shop
                  </Link>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-foreground">{category?.name ?? "Search"}</span>
                </>
              ) : (
                <span className="text-foreground">Shop</span>
              )}
            </nav>
            <p className="eyebrow text-gold">{eyebrow}</p>
            <h1 className="mt-3 max-w-2xl font-serif text-4xl leading-[1.05] md:text-6xl">
              {notFound ? "Collection not found" : title}
              {boutique && <em className="block text-2xl text-primary md:text-3xl">by {boutique.name}</em>}
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              {notFound ? "This collection may have moved. Explore everything instead." : description}
            </p>
          </div>
          {categories.length > 0 && (
            <div className="store-container relative">
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-6 sm:mx-0 sm:px-0">
                <CategoryPill to="/category/all" label="All" active={isAll && !search} />
                {categories.map((c) => (
                  <CategoryPill key={c.id} to={`/category/${c.slug}`} label={c.name} active={c.slug === slug} />
                ))}
              </div>
            </div>
          )}
        </section>

        <ProductListing
          products={notFound ? [] : products}
          loading={isLoading || categoriesLoading}
          categories={categories}
          boutiques={boutiques}
          scopeCategoryId={category?.id ?? null}
          emptyText={search ? `Nothing matches “${search}” yet - try another word.` : undefined}
        />
      </main>
      <Footer />
    </div>
  );
}

function CategoryPill({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "shrink-0 border px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-foreground/15 bg-background hover:border-primary hover:text-primary",
      )}
    >
      {label}
    </Link>
  );
}
