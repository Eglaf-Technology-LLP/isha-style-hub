import { Link } from "react-router-dom";
import { X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { getOptimizedImageUrl } from "@/lib/imageUrl";

export function RecentlyViewedProducts() {
  const { recentlyViewed, loading, clearRecentlyViewed } = useRecentlyViewed();

  if (loading || recentlyViewed.length === 0) {
    return null;
  }

  return (
    <section className="py-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Recently Viewed</h2>
        <Button variant="ghost" size="sm" onClick={clearRecentlyViewed}>
          Clear
        </Button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4">
        {recentlyViewed.slice(0, 6).map((item) => (
          <Link
            key={item.id}
            to={`/product/${item.product_id}`}
            className="flex-shrink-0 w-40"
          >
            <Card className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-0">
                <div className="aspect-square bg-muted">
                  {item.product?.images?.[0] ? (
                    <img
                      src={getOptimizedImageUrl(item.product.images[0], { width: 300 })}
                      alt={item.product.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-medium truncate">
                    {item.product?.name || "Product"}
                  </h3>
                  {item.product?.price && (
                    <p className="text-sm font-semibold mt-1">
                      ₹{item.product.price.toLocaleString()}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
