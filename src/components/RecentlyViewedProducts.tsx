import { Link } from "react-router-dom";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { useStoreProductsByIds } from "@/hooks/useStorefront";
import { SectionHeading } from "@/components/storefront/SectionHeading";
import { SmartImage } from "@/components/storefront/SmartImage";
import { BrandPlaceholder } from "@/components/storefront/BrandPlaceholder";
import { Rail } from "@/components/storefront/Rail";
import { formatINR } from "@/lib/format";

// "Recently viewed" row - only shown once the shopper has looked at something.
export function RecentlyViewedProducts({ excludeProductId }: { excludeProductId?: string } = {}) {
  const { recentlyViewed, loading, clearRecentlyViewed } = useRecentlyViewed();
  const viewed = recentlyViewed.filter((i) => i.product_id !== excludeProductId);
  const { data: live, isLoading: liveLoading } = useStoreProductsByIds(viewed.map((i) => i.product_id));
  // Pieces no longer on sale are left out; items saved without their
  // details (older guest entries) are filled in from the live products.
  const byId = new Map((live ?? []).map((p) => [p.id, p]));
  const items = viewed
    .filter((i) => byId.has(i.product_id))
    .map((i) => ({ ...i, product: i.product ?? byId.get(i.product_id) }))
    .slice(0, 10);
  if (loading || (viewed.length > 0 && liveLoading) || items.length === 0) return null;

  return (
    <section className="py-14 md:py-20">
      <div className="store-container">
        <Rail
          header={
            <div className="flex items-end gap-6">
              <SectionHeading eyebrow="For you" title="Recently" accent="viewed" className="mb-0 md:mb-0" />
              <button
                type="button"
                onClick={clearRecentlyViewed}
                className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          }
          itemClassName="basis-[36%] sm:basis-[24%] lg:basis-[15.5%]"
        >
          {items.map((item) => (
            <Link key={item.id} to={`/product/${item.product_id}`} className="group block">
              <div className="relative aspect-[3/4] overflow-hidden bg-ivory">
                <SmartImage
                  src={item.product?.images?.[0]}
                  alt={item.product?.name || "Product"}
                  width={320}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  fallback={<BrandPlaceholder />}
                />
              </div>
              <p className="mt-2.5 line-clamp-1 text-sm group-hover:text-primary">{item.product?.name || "Product"}</p>
              {item.product?.price != null && <p className="text-sm text-muted-foreground">{formatINR(item.product.price)}</p>}
            </Link>
          ))}
        </Rail>
      </div>
    </section>
  );
}
