import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Minus,
  Plus,
  ShoppingBag,
  Truck,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCartStore } from "@/stores/cartStore";
import { toast } from "sonner";
import { Product, ProductVariant } from "@/hooks/useProducts";
import { ImageGalleryWithZoom } from "@/components/ImageGalleryWithZoom";
import { VariantSelector } from "@/components/VariantSelector";
import { WishlistButton } from "@/components/WishlistButton";
import { ProductReviews } from "@/components/ProductReviews";
import { SizeGuideModal } from "@/components/SizeGuideModal";
import { SizeRecommender } from "@/components/SizeRecommender";
import { RelatedProducts } from "@/components/RelatedProducts";
import { CompleteTheLook } from "@/components/CompleteTheLook";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { SocialShareButtons } from "@/components/SocialShareButtons";
import { StockNotificationButton } from "@/components/StockNotificationButton";

export default function ProductDetail() {
  const { handle } = useParams<{ handle: string }>();
  const location = useLocation();
  const [product, setProduct] = useState<Product | null>(null);
  const [category, setCategory] = useState<{ name: string; slug: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const addItem = useCartStore((state) => state.addItem);
  const { trackProductView } = useRecentlyViewed();

  // Track product view
  useEffect(() => {
    if (handle) {
      trackProductView(handle);
    }
  }, [handle, trackProductView]);

  useEffect(() => {
    async function loadProduct() {
      if (!handle) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("id", handle)
          .single();

        if (error) throw error;

        const typedProduct: Product = {
          ...data,
          images: (data.images as string[]) || [],
          variants: (data.variants as unknown as ProductVariant[]) || [],
        };

        setProduct(typedProduct);

        // Fetch category if exists
        if (data.category_id) {
          const { data: catData } = await supabase
            .from("categories")
            .select("name, slug")
            .eq("id", data.category_id)
            .single();

          if (catData) {
            setCategory(catData);
          }
        }
      } catch (error) {
        console.error("Failed to fetch product:", error);
      } finally {
        setLoading(false);
      }
    }
    loadProduct();
  }, [handle]);

  // Extract available sizes and colors from variants
  const { availableSizes, availableColors, selectedVariant } = useMemo(() => {
    if (!product || !product.variants) {
      return { availableSizes: [], availableColors: [], selectedVariant: null };
    }

    const sizes = new Set<string>();
    const colors = new Set<string>();

    // Handle variants as either an array of ProductVariant or a plain object with sizes/colors arrays
    if (Array.isArray(product.variants)) {
      product.variants.forEach((variant) => {
        if (variant.options?.size) sizes.add(variant.options.size);
        if (variant.options?.Size) sizes.add(variant.options.Size);
        if (variant.options?.color) colors.add(variant.options.color);
        if (variant.options?.Color) colors.add(variant.options.Color);
      });
    } else {
      // Handle plain object format: { sizes: string[], colors: string[] }
      const variantObj = product.variants as unknown as { sizes?: string[]; colors?: string[] };
      if (variantObj.sizes) variantObj.sizes.forEach(s => sizes.add(s));
      if (variantObj.colors) variantObj.colors.forEach(c => colors.add(c));
    }

    // Find matching variant based on selection
    let matchedVariant: ProductVariant | null = null;
    if ((selectedSize || selectedColor) && Array.isArray(product.variants)) {
      matchedVariant = product.variants.find((v) => {
        const variantSize = v.options?.size || v.options?.Size;
        const variantColor = v.options?.color || v.options?.Color;
        
        const sizeMatch = !selectedSize || variantSize === selectedSize;
        const colorMatch = !selectedColor || variantColor === selectedColor;
        
        return sizeMatch && colorMatch;
      }) || null;
    }

    return {
      availableSizes: Array.from(sizes),
      availableColors: Array.from(colors),
      selectedVariant: matchedVariant,
    };
  }, [product, selectedSize, selectedColor]);

  // Get current price and stock based on variant selection
  const currentPrice = selectedVariant?.price || product?.price || 0;
  const currentStock = selectedVariant?.stock ?? product?.stock_quantity ?? 0;

  const handleAddToCart = () => {
    if (!product) {
      toast.error("Product not available");
      return;
    }

    // Validate size/color selection if variants exist
    if (availableSizes.length > 0 && !selectedSize) {
      toast.error("Please select a size");
      return;
    }
    if (availableColors.length > 0 && !selectedColor) {
      toast.error("Please select a color");
      return;
    }

    const variantId = selectedVariant?.id || `${product.id}-${selectedSize || 'default'}-${selectedColor || 'default'}`;
    const variantTitle = [selectedSize, selectedColor].filter(Boolean).join(" / ") || "Default";
    const selectedOptions = [];
    if (selectedSize) selectedOptions.push({ name: "Size", value: selectedSize });
    if (selectedColor) selectedOptions.push({ name: "Color", value: selectedColor });

    addItem({
      product: {
        node: {
          id: product.id,
          title: product.name,
          handle: product.id,
          vendor: "Isha Fashion Hub",
          description: product.description || "",
          descriptionHtml: product.description || "",
          productType: category?.name || "",
          tags: [],
          priceRange: {
            minVariantPrice: {
              amount: currentPrice.toString(),
              currencyCode: "INR",
            },
            maxVariantPrice: {
              amount: currentPrice.toString(),
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
                  id: variantId,
                  title: variantTitle,
                  price: {
                    amount: currentPrice.toString(),
                    currencyCode: "INR",
                  },
                  availableForSale: currentStock > 0,
                  selectedOptions,
                },
              },
            ],
          },
        },
      },
      variantId,
      variantTitle,
      price: {
        amount: currentPrice.toString(),
        currencyCode: "INR",
      },
      quantity,
      selectedOptions,
    });

    const details = [product.name];
    if (selectedSize) details.push(`Size: ${selectedSize}`);
    if (selectedColor) details.push(`Color: ${selectedColor}`);
    details.push(`Qty: ${quantity}`);

    toast.success("Added to cart!", {
      description: details.join(" • "),
      position: "top-center",
    });
  };

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

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-4">Product not found</h1>
          <Link to="/">
            <Button>Back to Home</Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const hasDiscount =
    product.compare_at_price && product.compare_at_price > product.price;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Breadcrumb */}
      <div className="container mx-auto px-4 py-4">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>
          <span>/</span>
          {category ? (
            <>
              <Link
                to={`/category/${category.slug}`}
                className="hover:text-primary"
              >
                {category.name}
              </Link>
              <span>/</span>
            </>
          ) : null}
          <span className="text-foreground">{product.name}</span>
        </nav>
      </div>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Image Gallery with Zoom */}
          <ImageGalleryWithZoom 
            images={product.images || []} 
            productName={product.name} 
          />

          {/* Product Info */}
          <div className="space-y-6">
            {/* Brand & Title */}
            <div>
              <p className="text-sm text-muted-foreground uppercase tracking-wide mb-2">
                Isha Fashion Hub
              </p>
              <h1 className="text-3xl md:text-4xl font-serif font-bold">
                {product.name}
              </h1>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-bold text-primary">
                ₹{currentPrice.toFixed(0)}
              </span>
              {hasDiscount && !selectedVariant && (
                <span className="text-xl text-muted-foreground line-through">
                  ₹{product.compare_at_price?.toFixed(0)}
                </span>
              )}
              {currentStock <= 0 && (
                <Badge variant="secondary">Out of Stock</Badge>
              )}
              {currentStock > 0 && currentStock <= 5 && (
                <Badge variant="destructive">
                  Only {currentStock} left!
                </Badge>
              )}
            </div>

            <Separator />

            {/* Color Selection */}
            {availableColors.length > 0 && (
              <VariantSelector
                label="Color"
                options={availableColors}
                selected={selectedColor}
                onSelect={setSelectedColor}
                type="color"
              />
            )}

            {/* Size Selection with Size Guide */}
            {availableSizes.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <VariantSelector
                    label="Size"
                    options={availableSizes}
                    selected={selectedSize}
                    onSelect={setSelectedSize}
                    type="size"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <SizeGuideModal categoryId={product.category_id} />
                  <SizeRecommender
                    productId={product.id}
                    availableSizes={availableSizes}
                    onSizeRecommended={setSelectedSize}
                  />
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="space-y-3">
              <label className="font-medium">Quantity</label>
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-border rounded-lg">
                  <button
                    onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                    className="p-3 hover:bg-muted transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-12 text-center font-medium">{quantity}</span>
                  <button
                    onClick={() =>
                      setQuantity((prev) =>
                        Math.min(currentStock, prev + 1)
                      )
                    }
                    className="p-3 hover:bg-muted transition-colors"
                    disabled={currentStock <= 0}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                size="lg"
                className="flex-1"
                onClick={handleAddToCart}
                disabled={currentStock <= 0}
              >
                <ShoppingBag className="h-5 w-5 mr-2" />
                {currentStock > 0 ? "Add to Cart" : "Out of Stock"}
              </Button>
              <WishlistButton productId={product.id} />
              <SocialShareButtons 
                url={`${window.location.origin}${location.pathname}`}
                title={product.name}
                description={product.description || undefined}
              />
            </div>

            {/* Stock Notification for Out of Stock */}
            {currentStock <= 0 && (
              <StockNotificationButton productId={product.id} productName={product.name} />
            )}

            {/* Delivery Info */}
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <Truck className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Free Delivery</p>
                  <p className="text-sm text-muted-foreground">
                    On orders above ₹999
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <RotateCcw className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Easy Returns</p>
                  <p className="text-sm text-muted-foreground">
                    7 days return policy
                  </p>
                </div>
              </div>
            </div>

            {/* Product Details Tabs */}
            <Tabs defaultValue="description" className="mt-8">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="description">Description</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>
              <TabsContent value="description" className="mt-4">
                <p className="text-muted-foreground">
                  {product.description || "No description available."}
                </p>
              </TabsContent>
              <TabsContent value="details" className="mt-4">
                <ul className="space-y-2 text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">Brand:</span>{" "}
                    Isha Fashion Hub
                  </li>
                  {category && (
                    <li>
                      <span className="font-medium text-foreground">
                        Category:
                      </span>{" "}
                      {category.name}
                    </li>
                  )}
                  {product.sku && (
                    <li>
                      <span className="font-medium text-foreground">SKU:</span>{" "}
                      {product.sku}
                    </li>
                  )}
                  <li>
                    <span className="font-medium text-foreground">
                      Availability:
                    </span>{" "}
                    {product.stock_quantity > 0
                      ? `In Stock (${product.stock_quantity} available)`
                      : "Out of Stock"}
                  </li>
                </ul>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* AI Complete the Look */}
        <CompleteTheLook productId={product.id} />

        {/* Product Reviews Section */}
        <ProductReviews productId={product.id} />

        {/* Related Products Section */}
        <RelatedProducts 
          currentProductId={product.id} 
          categoryId={product.category_id} 
        />
      </main>

      <Footer />
    </div>
  );
}
