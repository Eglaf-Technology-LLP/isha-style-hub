import { Link } from "react-router-dom";
import { Play, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Product, ProductVariant } from "@/hooks/useProducts";
import { useCartStore } from "@/stores/cartStore";
import { useUiStore } from "@/stores/uiStore";
import { WishlistButton } from "@/components/WishlistButton";
import { CompareButton } from "@/components/ProductComparison";
import { SmartImage } from "@/components/storefront/SmartImage";
import { BrandPlaceholder } from "@/components/storefront/BrandPlaceholder";
import { colorOf, inStock, isNewArrival, productColors, sizeOf } from "@/hooks/useStorefront";
import { discountPercent, formatINR } from "@/lib/format";
import { isMulticolour, swatchColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: Product & { vendor?: { name: string; slug?: string | null } | null };
  // Load the first image eagerly (above-the-fold cards).
  priority?: boolean;
}

export function ProductCard({ product, priority = false }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const setBagOpen = useUiStore((s) => s.setBagOpen);

  const [first, second] = product.images;
  const off = discountPercent(product.price, product.compare_at_price);
  const available = inStock(product);
  const colors = productColors(product);
  const hasVideo = !!product.video_url && product.video_status === "approved";
  const variants = product.variants || [];

  // Quick add straight from the card: a product with no options, or one
  // whose only choice is the size (a single colour at most). Anything with
  // several colours goes to the product page to choose.
  const sizeVariants: { size: string; variant: ProductVariant }[] = [];
  if (variants.length > 0 && colors.length <= 1) {
    for (const v of variants) {
      const size = sizeOf(v);
      if (size && !sizeVariants.some((s) => s.size === size)) sizeVariants.push({ size, variant: v });
    }
  }
  const quickAddSizes = sizeVariants.length > 0 && sizeVariants.length === variants.length;
  const quickAddPlain = variants.length === 0;

  const add = (variant: ProductVariant | null) => {
    const size = variant ? sizeOf(variant) : null;
    const color = variant ? colorOf(variant) : null;
    const selectedOptions = [
      ...(size ? [{ name: "Size", value: size }] : []),
      ...(color ? [{ name: "Color", value: color }] : []),
    ];
    addItem({
      productId: product.id,
      productName: product.name,
      productImage: product.images[0] || null,
      vendorId: product.vendor_id ?? null,
      variantId: variant ? variant.id : `${product.id}-default`,
      variantTitle: [size, color].filter(Boolean).join(" / ") || "Default",
      price: { amount: String(variant?.price || product.price), currencyCode: "INR" },
      quantity: 1,
      selectedOptions,
    });
    toast.success("Added to your bag", {
      description: [product.name, size && `Size ${size}`].filter(Boolean).join(" · "),
      position: "top-center",
      action: { label: "View bag", onClick: () => setBagOpen(true) },
    });
  };

  const onQuick = (e: React.MouseEvent, variant: ProductVariant | null) => {
    e.preventDefault();
    e.stopPropagation();
    add(variant);
  };

  return (
    <div className="group relative">
      <Link to={`/product/${product.id}`} className="block" aria-label={product.name}>
        <div className="relative aspect-[3/4] overflow-hidden bg-ivory">
          <SmartImage
            src={first}
            alt={product.name}
            width={640}
            priority={priority}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]",
              second && "group-hover:opacity-0",
            )}
            fallback={<BrandPlaceholder caption="Photo coming soon" />}
          />
          {second && (
            <SmartImage
              src={second}
              alt=""
              width={640}
              className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 group-hover:!opacity-100"
              fallback={null}
            />
          )}

          {/* Badges */}
          <div className="absolute left-0 top-3 flex flex-col items-start gap-1.5">
            {off && (
              <span className="bg-primary px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-primary-foreground">
                {off}% off
              </span>
            )}
            {isNewArrival(product) && !off && (
              <span className="bg-ivory/95 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-primary">
                New
              </span>
            )}
            {product.made_to_order && (
              <span className="bg-ink/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-ivory">
                Made to order
              </span>
            )}
          </div>

          {hasVideo && (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 bg-ivory/90 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-foreground transition-opacity md:group-hover:opacity-0">
              <Play className="h-3 w-3 fill-current" /> Video
            </span>
          )}

          {!available && (
            <span className="absolute inset-x-0 bottom-0 bg-ivory/90 py-2 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Sold out
            </span>
          )}

          {/* Quick add (desktop hover) */}
          {available && (quickAddSizes || quickAddPlain) && (
            <div className="absolute inset-x-0 bottom-0 hidden translate-y-full bg-ivory/95 px-3 py-3 backdrop-blur-sm transition-transform duration-300 ease-out group-hover:translate-y-0 md:block">
              {quickAddSizes ? (
                <>
                  <p className="eyebrow mb-2 text-center text-muted-foreground">Quick add</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {sizeVariants.map(({ size, variant }) => {
                      const out = (variant.stock ?? 0) <= 0;
                      return (
                        <button
                          key={size}
                          type="button"
                          disabled={out}
                          onClick={(e) => onQuick(e, variant)}
                          className={cn(
                            "min-w-9 border px-2 py-1 text-xs transition-colors",
                            out
                              ? "cursor-not-allowed border-border text-muted-foreground/50 line-through"
                              : "border-foreground/20 hover:border-primary hover:bg-primary hover:text-primary-foreground",
                          )}
                          aria-label={`Add size ${size} to bag`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={(e) => onQuick(e, null)}
                  className="flex w-full items-center justify-center gap-2 bg-primary py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90"
                >
                  <ShoppingBag className="h-3.5 w-3.5" /> Add to bag
                </button>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* Wishlist / compare */}
      <div className="absolute right-2.5 top-2.5 flex flex-col gap-2">
        <WishlistButton productId={product.id} className="h-9 w-9 bg-ivory/85" />
        <div className="hidden opacity-0 transition-opacity group-hover:opacity-100 md:block">
          <CompareButton
            product={{
              id: product.id,
              name: product.name,
              price: product.price,
              compare_at_price: product.compare_at_price || null,
              images: product.images,
              description: product.description || null,
              variants: product.variants,
              category_id: product.category_id || null,
            }}
          />
        </div>
      </div>

      <Link to={`/product/${product.id}`} className="mt-3.5 block space-y-1">
        <p className="eyebrow truncate text-[10px] text-muted-foreground">{product.vendor?.name || "AllBoutiqs"}</p>
        <h3 className="line-clamp-1 text-[15px] leading-snug text-foreground transition-colors group-hover:text-primary">
          {product.name}
        </h3>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[15px] font-medium text-foreground">{formatINR(product.price)}</span>
          {off && (
            <>
              <span className="text-xs text-muted-foreground line-through">{formatINR(product.compare_at_price)}</span>
              <span className="text-xs font-medium text-primary">{off}% off</span>
            </>
          )}
        </div>
        {colors.length > 1 && (
          <div className="flex items-center gap-1.5 pt-1" aria-label={`${colors.length} colours`}>
            {colors.slice(0, 5).map((c) => (
              <span
                key={c}
                title={c}
                className="h-3 w-3 rounded-full border border-foreground/15"
                style={
                  isMulticolour(c)
                    ? { background: "conic-gradient(#b3261e, #e8c53a, #3f7a4a, #2f5d9e, #6a3d8f, #b3261e)" }
                    : { backgroundColor: swatchColor(c) ?? "hsl(var(--muted))" }
                }
              />
            ))}
            {colors.length > 5 && <span className="text-[11px] text-muted-foreground">+{colors.length - 5}</span>}
          </div>
        )}
      </Link>
    </div>
  );
}
