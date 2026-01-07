import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, ShoppingBag } from "lucide-react";
import { ShopifyProduct, formatPrice } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { toast } from "sonner";

interface ProductCardProps {
  product: ShopifyProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const { node } = product;
  
  const mainImage = node.images.edges[0]?.node;
  const price = node.priceRange.minVariantPrice;
  const firstVariant = node.variants.edges[0]?.node;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!firstVariant) {
      toast.error("Product variant not available");
      return;
    }

    addItem({
      product,
      variantId: firstVariant.id,
      variantTitle: firstVariant.title,
      price: firstVariant.price,
      quantity: 1,
      selectedOptions: firstVariant.selectedOptions,
    });

    toast.success("Added to cart!", {
      description: node.title,
      position: "top-center",
    });
  };

  return (
    <Link to={`/product/${node.handle}`} className="group">
      <div className="relative overflow-hidden rounded-2xl bg-muted/30 aspect-[3/4]">
        {/* Image */}
        {mainImage ? (
          <img
            src={mainImage.url}
            alt={mainImage.altText || node.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <ShoppingBag className="h-12 w-12 text-muted-foreground" />
          </div>
        )}

        {/* Overlay Actions */}
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors duration-300" />
        
        {/* Wishlist Button */}
        <button className="absolute top-4 right-4 p-2 rounded-full bg-card/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-card">
          <Heart className="h-4 w-4" />
        </button>

        {/* Quick Add Button */}
        <div className="absolute bottom-4 left-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <Button 
            onClick={handleAddToCart}
            className="w-full"
            size="sm"
          >
            <ShoppingBag className="h-4 w-4 mr-2" />
            Add to Cart
          </Button>
        </div>

        {/* Tags */}
        {node.tags.includes('new') && (
          <Badge className="absolute top-4 left-4 bg-primary text-primary-foreground">
            New
          </Badge>
        )}
      </div>

      {/* Product Info */}
      <div className="mt-4 space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {node.vendor || 'Isha Fashion Hub'}
        </p>
        <h3 className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
          {node.title}
        </h3>
        <p className="text-lg font-semibold text-primary">
          {formatPrice(price.amount, price.currencyCode)}
        </p>
        
        {/* Available Colors Indicator */}
        {node.options.find(opt => opt.name.toLowerCase() === 'color') && (
          <div className="flex gap-1 pt-2">
            {node.options
              .find(opt => opt.name.toLowerCase() === 'color')
              ?.values.slice(0, 4)
              .map((color, index) => (
                <span
                  key={index}
                  className="w-4 h-4 rounded-full border border-border"
                  style={{ backgroundColor: color.toLowerCase() }}
                  title={color}
                />
              ))}
            {(node.options.find(opt => opt.name.toLowerCase() === 'color')?.values.length || 0) > 4 && (
              <span className="text-xs text-muted-foreground">
                +{(node.options.find(opt => opt.name.toLowerCase() === 'color')?.values.length || 0) - 4}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
