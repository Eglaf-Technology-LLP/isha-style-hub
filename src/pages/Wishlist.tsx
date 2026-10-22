import { Link } from "react-router-dom";
import { ChevronRight, Heart, Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { ProductRail } from "@/components/storefront/ProductRail";
import { useWishlist } from "@/hooks/useWishlist";
import { useAuth } from "@/hooks/useAuth";
import { useStoreCategories, useStoreProducts } from "@/hooks/useStorefront";

export default function Wishlist() {
  const { user, loading: authLoading } = useAuth();
  const { wishlistItems, loading: wishlistLoading } = useWishlist();
  const { data: products = [], isLoading: productsLoading } = useStoreProducts();
  const { data: categories = [] } = useStoreCategories();

  const loading = authLoading || wishlistLoading || productsLoading;

  const wishlistProducts = products.filter((product) =>
    wishlistItems.some((item) => item.product_id === product.id)
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        <section className="border-b border-border bg-ivory">
          <div className="store-container py-10 md:py-16">
            <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground">
                Home
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">Wishlist</span>
            </nav>
            <p className="eyebrow text-gold">Saved for later</p>
            <h1 className="mt-3 font-serif text-4xl leading-[1.05] md:text-6xl">
              Your <em className="font-normal text-primary">wishlist</em>
            </h1>
            <p className="mt-4 text-[15px] text-muted-foreground">
              {loading || !user
                ? "The pieces you love, kept in one place."
                : `${wishlistProducts.length} ${wishlistProducts.length === 1 ? "piece" : "pieces"} saved`}
            </p>
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-32">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !user || wishlistProducts.length === 0 ? (
          <>
            <div className="store-container py-20 text-center md:py-24">
              <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-gold/40 bg-ivory">
                <Heart className="h-8 w-8 text-gold" strokeWidth={1.5} />
              </span>
              <h2 className="mt-8 font-serif text-3xl md:text-4xl">
                {user ? "Your wishlist is empty" : "Sign in to see your wishlist"}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                {user
                  ? "Tap the heart on any piece to save it here for later."
                  : "Save the pieces you love and find them again on any device."}
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {!user && (
                  <Link
                    to="/account"
                    className="inline-flex h-12 items-center bg-primary px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground hover:bg-maroon-deep"
                  >
                    Sign in
                  </Link>
                )}
                <Link
                  to="/category/all"
                  className="inline-flex h-12 items-center border border-foreground px-8 text-[11px] font-medium uppercase tracking-[0.22em] hover:bg-foreground hover:text-background"
                >
                  Start shopping
                </Link>
              </div>
              {categories.length > 0 && (
                <div className="mt-10 flex flex-wrap justify-center gap-2">
                  {categories.map((c) => (
                    <Link
                      key={c.id}
                      to={`/category/${c.slug}`}
                      className="border border-foreground/15 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors hover:border-primary hover:text-primary"
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <ProductRail
              eyebrow="Just in"
              title="New"
              accent="arrivals"
              action={{ label: "Shop new in", href: "/category/all?sort=newest" }}
              products={products.slice(0, 12)}
              className="border-t border-border py-14 md:py-20"
            />
          </>
        ) : (
          <div className="store-container py-10 pb-24 md:py-14">
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6 md:gap-y-12 xl:grid-cols-4">
              {wishlistProducts.map((product, i) => (
                <ProductCard key={product.id} product={product} priority={i < 4} />
              ))}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
