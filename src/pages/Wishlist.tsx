import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { useWishlist } from "@/hooks/useWishlist";
import { useProducts } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Heart, ShoppingBag, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

export default function Wishlist() {
  const { wishlistItems, loading: wishlistLoading } = useWishlist();
  const { products, loading: productsLoading } = useProducts();

  const loading = wishlistLoading || productsLoading;

  const wishlistProducts = products.filter((product) =>
    wishlistItems.some((item) => item.product_id === product.id)
  );

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

      <section className="bg-gradient-to-r from-primary/10 to-accent py-12 md:py-16">
        <div className="container mx-auto px-4 text-center">
          <Heart className="h-12 w-12 mx-auto mb-4 text-primary" />
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">
            My Wishlist
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Your saved items for later
          </p>
        </div>
      </section>

      <main className="container mx-auto px-4 py-12">
        {wishlistProducts.length === 0 ? (
          <div className="text-center py-16">
            <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-semibold mb-2">Your wishlist is empty</h2>
            <p className="text-muted-foreground mb-6">
              Start adding items you love to your wishlist
            </p>
            <Link to="/">
              <Button size="lg">
                <ShoppingBag className="h-5 w-5 mr-2" />
                Start Shopping
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground mb-6">
              {wishlistProducts.length} item{wishlistProducts.length !== 1 ? "s" : ""} saved
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {wishlistProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
