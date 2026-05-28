import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag } from "lucide-react";
import { Product } from "@/hooks/useProducts";
import { useCartStore } from "@/stores/cartStore";
import { toast } from "sonner";
import { WishlistButton } from "@/components/WishlistButton";
import { CompareButton } from "@/components/ProductComparison";
import { CompareProduct } from "@/stores/comparisonStore";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const [imageError, setImageError] = useState(false);

  const mainImage = product.images[0];
  const showImage = mainImage && !imageError;
  const hasDiscount =
    product.compare_at_price && product.compare_at_price > product.price;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    addItem({
      product: {
        node: {
          id: product.id,
          title: product.name,
          handle: product.id,
          vendor: "Isha Fashion Hub",
          description: product.description || "",
          descriptionHtml: product.description || "",
          productType: "",
          tags: [],
          priceRange: {
            minVariantPrice: {
              amount: product.price.toString(),
              currencyCode: "INR",
            },
            maxVariantPrice: {
              amount: product.price.toString(),
              currencyCode: "INR",
            },
          },
          images: {
            edges: product.images.map((img) => ({
              node: { url: img, altText: product.name },
            })),
          },
          options: [],
          variants: {
            edges: [
              {
                node: {
                  id: `${product.id}-default`,
                  title: "Default",
                  price: {
                    amount: product.price.toString(),
                    currencyCode: "INR",
                  },
                  availableForSale: product.stock_quantity > 0,
                  selectedOptions: [],
                },
              },
            ],
          },
        },
      },
      variantId: `${product.id}-default`,
      variantTitle: "Default",
      price: {
        amount: product.price.toString(),
        currencyCode: "INR",
      },
      quantity: 1,
      selectedOptions: [],
    });

    toast.success("Added to cart!", {
      description: product.name,
      position: "top-center",
    });
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
      <div className="relative overflow-hidden rounded-2xl bg-muted/30 aspect-[3/4]">
        {/* Image */}
        {showImage ? (
          <img
            src={mainImage}
            alt={product.name}
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

        {/* Quick Add Button */}
        <div className="absolute bottom-4 left-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <Button
            onClick={handleAddToCart}
            className="w-full"
            size="sm"
            disabled={product.stock_quantity <= 0}
          >
            <ShoppingBag className="h-4 w-4 mr-2" />
            {product.stock_quantity > 0 ? "Add to Cart" : "Out of Stock"}
          </Button>
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
          Isha Fashion Hub
        </p>
        <h3 className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
          {product.name}
        </h3>
        <div className="flex items-center gap-2">
          <p className="text-lg font-semibold text-primary">
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
