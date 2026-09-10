import { useState } from "react";
import { Link } from "react-router-dom";
import { Scale, X, ArrowRight, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getOptimizedImageUrl } from "@/lib/imageUrl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useComparisonStore, CompareProduct } from "@/stores/comparisonStore";
import { cn } from "@/lib/utils";

interface CompareButtonProps {
  product: CompareProduct;
  variant?: "icon" | "full";
  className?: string;
}

export function CompareButton({ product, variant = "icon", className }: CompareButtonProps) {
  const { isInComparison, addToComparison, removeFromComparison } = useComparisonStore();
  const isComparing = isInComparison(product.id);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isComparing) {
      removeFromComparison(product.id);
    } else {
      addToComparison(product);
    }
  };

  if (variant === "full") {
    return (
      <Button
        variant={isComparing ? "secondary" : "outline"}
        className={cn("gap-2", className)}
        onClick={handleClick}
      >
        <Scale className="h-4 w-4" />
        {isComparing ? "Remove from Compare" : "Compare"}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "rounded-full bg-background/80 shadow-sm backdrop-blur-sm hover:bg-background hover:shadow-md",
        isComparing && "text-primary",
        className
      )}
      onClick={handleClick}
    >
      <Scale className="h-5 w-5" />
    </Button>
  );
}

export function CompareDrawer() {
  const { compareProducts, removeFromComparison, clearComparison, maxItems } = useComparisonStore();
  const [open, setOpen] = useState(false);

  if (compareProducts.length === 0) {
    return null;
  }

  return (
    <>
      {/* Floating Compare Button */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            className="fixed bottom-4 right-4 z-50 gap-2 shadow-lg"
            size="lg"
          >
            <Scale className="h-5 w-5" />
            Compare ({compareProducts.length})
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
          <SheetHeader className="flex flex-row items-center justify-between">
            <SheetTitle>Compare Products ({compareProducts.length}/{maxItems})</SheetTitle>
            <Button variant="ghost" size="sm" onClick={clearComparison}>
              Clear All
            </Button>
          </SheetHeader>

          <div className="mt-6 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Product</TableHead>
                  {compareProducts.map((product) => (
                    <TableHead key={product.id} className="min-w-48">
                      <div className="relative">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6"
                          onClick={() => removeFromComparison(product.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Link to={`/product/${product.id}`} onClick={() => setOpen(false)}>
                          <div className="aspect-square w-24 bg-muted rounded-lg overflow-hidden mb-2">
                            {product.images?.[0] ? (
                              <img
                                src={getOptimizedImageUrl(product.images[0], { width: 200 })}
                                alt={product.name}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                                No image
                              </div>
                            )}
                          </div>
                          <h3 className="font-medium text-sm line-clamp-2">{product.name}</h3>
                        </Link>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Price</TableCell>
                  {compareProducts.map((product) => (
                    <TableCell key={product.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">₹{product.price.toLocaleString()}</span>
                        {product.compare_at_price && product.compare_at_price > product.price && (
                          <span className="text-sm text-muted-foreground line-through">
                            ₹{product.compare_at_price.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Description</TableCell>
                  {compareProducts.map((product) => (
                    <TableCell key={product.id}>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {product.description || "No description"}
                      </p>
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Variants</TableCell>
                  {compareProducts.map((product) => {
                    const variants = product.variants as { sizes?: string[]; colors?: string[] } | null;
                    return (
                      <TableCell key={product.id}>
                        <div className="space-y-1">
                          {variants?.sizes && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Sizes: </span>
                              {variants.sizes.join(", ")}
                            </div>
                          )}
                          {variants?.colors && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Colors: </span>
                              {variants.colors.join(", ")}
                            </div>
                          )}
                          {!variants?.sizes && !variants?.colors && (
                            <Minus className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Action</TableCell>
                  {compareProducts.map((product) => (
                    <TableCell key={product.id}>
                      <Button asChild size="sm" onClick={() => setOpen(false)}>
                        <Link to={`/product/${product.id}`}>
                          View Product <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
