import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWishlist } from "@/hooks/useWishlist";
import { cn } from "@/lib/utils";

interface WishlistButtonProps {
  productId: string;
  variant?: "icon" | "full";
  className?: string;
}

export function WishlistButton({ productId, variant = "icon", className }: WishlistButtonProps) {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const isWishlisted = isInWishlist(productId);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await toggleWishlist(productId);
  };

  if (variant === "full") {
    return (
      <Button
        variant={isWishlisted ? "secondary" : "outline"}
        className={cn("gap-2", className)}
        onClick={handleClick}
      >
        <Heart className={cn("h-4 w-4", isWishlisted && "fill-current text-destructive")} />
        {isWishlisted ? "In Wishlist" : "Add to Wishlist"}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "rounded-full bg-background/80 hover:bg-background",
        className
      )}
      onClick={handleClick}
    >
      <Heart
        className={cn(
          "h-5 w-5 transition-colors",
          isWishlisted ? "fill-destructive text-destructive" : "text-muted-foreground"
        )}
      />
    </Button>
  );
}
