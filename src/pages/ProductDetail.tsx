import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Minus,
  Plus,
  ShoppingBag,
  Zap,
  Truck,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCartStore } from "@/stores/cartStore";
import { toast } from "sonner";
import { Product, ProductVariant, mapDbVariant } from "@/hooks/useProducts";
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
import { VirtualTryOn } from "@/components/VirtualTryOn";
import { DeliveryEstimate } from "@/components/DeliveryEstimate";

export default function ProductDetail() {
  const { handle } = useParams<{ handle: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [category, setCategory] = useState<{ name: string; slug: string } | null>(null);
  const [vendorInfo, setVendorInfo] = useState<{
    name: string;
    slug: string;
    is_trusted: boolean;
    return_window_days: number;
    address: Record<string, string> | null;
    contact_email: string | null;
    contact_phone: string | null;
    shipping_flat_rate: number;
    free_shipping_threshold: number | null;
  } | null>(null);
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
          .select("*, product_variants(*)")
          .eq("id", handle)
          .single();

        if (error) throw error;

        const typedProduct: Product = {
          ...data,
          images: (data.images as string[]) || [],
          variants: (data.product_variants || []).map(mapDbVariant),
          specifications: (data.specifications as unknown as Product["specifications"]) || [],
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

        // Fetch the selling vendor
        if ((data as any).vendor_id) {
          const { data: vData } = await supabase
            .from("vendors")
            .select(
              "name, slug, is_trusted, return_window_days, address, contact_email, contact_phone, shipping_flat_rate, free_shipping_threshold"
            )
            .eq("id", (data as any).vendor_id)
            .maybeSingle();
          if (vData) setVendorInfo(vData as any);
        } else {
          setVendorInfo(null);
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
  // A variant with its own photo (e.g. a color swatch) replaces the shared
  // gallery entirely while selected; falls back to the product's own
  // images otherwise.
  const galleryImages = selectedVariant?.image_url
    ? [selectedVariant.image_url]
    : product?.images || [];

  // Shared by both "Add to Cart" and "Shop Now" - the validation and the
  // item that ends up in the cart must be identical either way, since Shop
  // Now still goes through the same cart/checkout flow (add, then jump
  // straight to /checkout) rather than a separate order path.
  const addSelectedToCart = (): boolean => {
    if (!product) {
      toast.error("Product not available");
      return false;
    }
    if (availableSizes.length > 0 && !selectedSize) {
      toast.error("Please select a size");
      return false;
    }
    if (availableColors.length > 0 && !selectedColor) {
      toast.error("Please select a color");
      return false;
    }

    const variantId = selectedVariant?.id || `${product.id}-${selectedSize || 'default'}-${selectedColor || 'default'}`;
    const variantTitle = [selectedSize, selectedColor].filter(Boolean).join(" / ") || "Default";
    const selectedOptions = [];
    if (selectedSize) selectedOptions.push({ name: "Size", value: selectedSize });
    if (selectedColor) selectedOptions.push({ name: "Color", value: selectedColor });

    addItem({
      productId: product.id,
      productName: product.name,
      productImage: product.images[0] || null,
      vendorId: product.vendor_id ?? null,
      variantId,
      variantTitle,
      price: {
        amount: currentPrice.toString(),
        currencyCode: "INR",
      },
      quantity,
      selectedOptions,
    });

    return true;
  };

  const handleAddToCart = () => {
    if (!product || !addSelectedToCart()) return;

    const details = [product.name];
    if (selectedSize) details.push(`Size: ${selectedSize}`);
    if (selectedColor) details.push(`Color: ${selectedColor}`);
    details.push(`Qty: ${quantity}`);

    toast.success("Added to cart!", {
      description: details.join(" • "),
      position: "top-center",
    });
  };

  // Straight to checkout, no stop at the cart page/drawer - same item the
  // regular Add to Cart would add, just skips the "review your cart" step
  // for a customer who already knows they want it now.
  const handleBuyNow = () => {
    if (!addSelectedToCart()) return;
    navigate("/checkout");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
            <Skeleton className="rounded-lg aspect-[3/4]" />
            <div className="space-y-6">
              <div className="space-y-3">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-9 w-4/5" />
              </div>
              <Skeleton className="h-8 w-1/4" />
              <Skeleton className="h-px w-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <div className="flex gap-2">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-10 w-10 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          </div>
        </main>
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
            images={galleryImages}
            productName={product.name}
          />

          {/* Product Info */}
          <div className="space-y-6">
            {/* Brand & Title */}
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {vendorInfo ? (
                  <Link
                    to={`/store/${vendorInfo.slug}`}
                    className="text-sm text-muted-foreground uppercase tracking-wide hover:text-primary transition-colors"
                  >
                    Sold by {vendorInfo.name}
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground uppercase tracking-wide">
                    AllBoutiqs
                  </p>
                )}
                {vendorInfo?.is_trusted && (
                  <Badge variant="secondary" className="text-xs">
                    Trusted partner
                  </Badge>
                )}
              </div>
              <h1 className="text-3xl md:text-4xl font-serif font-bold">
                {product.name}
              </h1>
            </div>


            {/* Price */}
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-serif font-bold text-primary">
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
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1"
                  onClick={handleAddToCart}
                  disabled={currentStock <= 0}
                >
                  <ShoppingBag className="h-5 w-5 mr-2" />
                  {currentStock > 0 ? "Add to Cart" : "Out of Stock"}
                </Button>
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={handleBuyNow}
                  disabled={currentStock <= 0}
                >
                  <Zap className="h-5 w-5 mr-2" />
                  Shop Now
                </Button>
              </div>
              <div className="flex gap-3">
              <WishlistButton productId={product.id} />
              <SocialShareButtons
                url={`${window.location.origin}${location.pathname}`}
                title={product.name}
                description={product.description || undefined}
              />
              </div>
            </div>

            {/* Virtual Try-On */}
            <VirtualTryOn
              productName={product.name}
              productImageUrl={product.images?.[0]}
            />


            {/* Stock Notification for Out of Stock */}
            {currentStock <= 0 && (
              <StockNotificationButton productId={product.id} productName={product.name} />
            )}

            {/* Delivery Info */}
            <div className="space-y-4 p-4 border border-border rounded-lg bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Truck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">
                    {vendorInfo?.free_shipping_threshold != null
                      ? "Free Delivery"
                      : "Shipping"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {vendorInfo?.free_shipping_threshold != null
                      ? `On orders above ₹${vendorInfo.free_shipping_threshold}`
                      : vendorInfo?.shipping_flat_rate
                        ? `₹${vendorInfo.shipping_flat_rate} flat rate`
                        : "Calculated at checkout"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <RotateCcw className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Easy Returns</p>
                  <p className="text-sm text-muted-foreground">
                    {vendorInfo?.return_window_days ?? 7}-day return policy
                  </p>
                </div>
              </div>
              {product.vendor_id && (
                <div className="pt-1 border-t border-border/60">
                  <p className="text-sm font-medium mb-2">Check delivery date</p>
                  <DeliveryEstimate vendorId={product.vendor_id} productId={product.id} />
                </div>
              )}
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
              <TabsContent value="details" className="mt-4 space-y-6">
                <ul className="space-y-2 text-muted-foreground">
                  {vendorInfo && (
                    <li>
                      <span className="font-medium text-foreground">Returns:</span>{" "}
                      {vendorInfo.return_window_days}-day window
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

                {product.specifications.length > 0 && (
                  <div>
                    <h3 className="font-medium text-foreground mb-3">Product Details</h3>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                      {product.specifications.map((spec, i) => (
                        <div key={i}>
                          <dt className="text-sm font-medium text-foreground">{spec.label}</dt>
                          <dd className="text-sm text-muted-foreground">{spec.value || "-"}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                <div>
                  <h3 className="font-medium text-foreground mb-3">Product Information</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>
                      <span className="font-medium text-foreground">Product Code:</span>{" "}
                      {product.sku || product.id.slice(0, 8)}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">MRP:</span>{" "}
                      ₹{(product.compare_at_price ?? product.price).toFixed(2)} inclusive of all taxes
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Sold By:</span>{" "}
                      {vendorInfo ? (
                        <Link to={`/store/${vendorInfo.slug}`} className="hover:text-primary transition-colors">
                          {vendorInfo.name}
                        </Link>
                      ) : (
                        "AllBoutiqs"
                      )}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Marketed By / Manufactured By:</span>{" "}
                      {vendorInfo?.name || "AllBoutiqs"}
                      {vendorInfo?.address && (
                        <>
                          , {vendorInfo.address.address_line1}
                          {vendorInfo.address.address_line2 ? `, ${vendorInfo.address.address_line2}` : ""}, {vendorInfo.address.city}, {vendorInfo.address.state} - {vendorInfo.address.pincode}, {vendorInfo.address.country || "India"}
                        </>
                      )}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Net Quantity:</span> {product.net_quantity}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Country of Origin:</span> {product.country_of_origin}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Customer Care Address:</span>{" "}
                      {vendorInfo ? (
                        <>
                          {vendorInfo.address?.address_line1 && (
                            <>
                              {vendorInfo.address.address_line1}
                              {vendorInfo.address.address_line2 ? `, ${vendorInfo.address.address_line2}` : ""}, {vendorInfo.address.city}, {vendorInfo.address.state} - {vendorInfo.address.pincode}, {vendorInfo.address.country || "India"}.{" "}
                            </>
                          )}
                          {vendorInfo.contact_phone && `Ph: ${vendorInfo.contact_phone}. `}
                          {vendorInfo.contact_email && `Email: ${vendorInfo.contact_email}`}
                        </>
                      ) : (
                        "customercare@allboutiqs.com"
                      )}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Commodity:</span>{" "}
                      {category?.name || "Fashion"}
                    </li>
                  </ul>
                </div>
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
