import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, Zap } from "lucide-react";
import { Product } from "@/hooks/useProducts";
import { useCartStore } from "@/stores/cartStore";
import { toast } from "sonner";
import { WishlistButton } from "@/components/WishlistButton";
import { CompareButton } from "@/components/ProductComparison";
import { CompareProduct } from "@/stores/comparisonStore";
import { getOptimizedImageUrl } from "@/lib/imageUrl";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);

  const mainImage = product.images[0];
  const showImage = mainImage && !imageError;
  const hasDiscount =
    product.compare_at_price && product.compare_at_price > product.price;
  const hasVariants = product.variants.length > 0;

  const addDefaultToCart = () => {
    addItem({
      productId: product.id,
      productName: product.name,
      productImage: product.images[0] || null,
      vendorId: product.vendor_id ?? null,
      variantId: `${product.id}-default`,
      variantTitle: "Default",
      price: {
        amount: product.price.toString(),
        currencyCode: "INR",
      },
      quantity: 1,
      selectedOptions: [],
    });
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    // Products with real variants need a size/color picked and their own
    // stock checked - both only happen on the product page - so this quick
    // button becomes a plain link there instead of guessing a variant.
    if (hasVariants) return;

    e.preventDefault();
    e.stopPropagation();

    addDefaultToCart();

    toast.success("Added to cart!", {
      description: product.name,
      position: "top-center",
    });
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    // Variant products still need the picker on the detail page, so this
    // button only exists for non-variant cards (see the guard below).
    e.preventDefault();
    e.stopPropagation();

    addDefaultToCart();
    navigate("/checkout");
  };

  const compareProduct = {
    id: product.id,
    name: product.name,
    price: product.price,
    compare_at_price: product.compare_at_price || null,
    images: product.images,
    description: product.description || null,
    variants: product.variants,
    category_id: product.category_id || null,
  };

  return (
    <Link to={`/product/${product.id}`} className="group">
      <div className="relative overflow-hidden rounded-lg bg-muted/30 aspect-[3/4] shadow-sm transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-xl">
        {/* Image */}
        {showImage ? (
          <img
            src={getOptimizedImageUrl(mainImage, { width: 500 })}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onError={() => setImageError(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <ShoppingBag className="h-12 w-12 text-muted-foreground" />
          </div>
        )}

        {/* Overlay Actions */}
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors duration-300" />

        {/* Action Buttons */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <WishlistButton productId={product.id} />
          <CompareButton product={compareProduct} />
        </div>

        {/* Quick Add Buttons */}
        <div className="absolute bottom-4 left-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex gap-2">
          <Button
            onClick={handleAddToCart}
            className="flex-1"
            variant={hasVariants ? "default" : "outline"}
            size="sm"
            disabled={product.stock_quantity <= 0}
          >
            <ShoppingBag className="h-4 w-4 mr-2" />
            {product.stock_quantity <= 0
              ? "Out of Stock"
              : hasVariants
                ? "Select Options"
                : "Add to Cart"}
          </Button>
          {!hasVariants && (
            <Button
              onClick={handleBuyNow}
              className="flex-1"
              size="sm"
              disabled={product.stock_quantity <= 0}
            >
              <Zap className="h-4 w-4 mr-2" />
              Shop Now
            </Button>
          )}
        </div>

        {/* Tags */}
        {hasDiscount && (
          <Badge className="absolute top-4 left-4 bg-destructive text-destructive-foreground">
            Sale
          </Badge>
        )}
      </div>

      {/* Product Info */}
      <div className="mt-4 space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {product.vendor?.name || "AllBoutiqs"}
        </p>
        <h3 className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
          {product.name}
        </h3>
        <div className="flex items-center gap-2">
          <p className="text-lg font-serif font-semibold text-primary">
            ₹{product.price.toFixed(0)}
          </p>
          {hasDiscount && (
            <p className="text-sm text-muted-foreground line-through">
              ₹{product.compare_at_price?.toFixed(0)}
            </p>
          )}
        </div>

        {/* Stock indicator */}
        {product.stock_quantity <= 5 && product.stock_quantity > 0 && (
          <p className="text-xs text-destructive">
            Only {product.stock_quantity} left!
          </p>
        )}
      </div>
    </Link>
  );
}
