import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  ArrowRight,
  Banknote,
  ChevronRight,
  Minus,
  Plus,
  RotateCcw,
  Scissors,
  ShieldCheck,
  Star,
  Truck,
} from "lucide-react";
import { COMPANY } from "@/lib/company";
import { useCustomerShipping } from "@/hooks/useCustomerShipping";
import { supabase } from "@/integrations/supabase/client";
import { useCartStore } from "@/stores/cartStore";
import { useUiStore } from "@/stores/uiStore";
import { toast } from "sonner";
import { Product, ProductVariant, mapDbVariant } from "@/hooks/useProducts";
import { useStoreBoutiques } from "@/hooks/useStorefront";
import { ProductMediaGallery } from "@/components/ProductMediaGallery";
import { OptionPicker } from "@/components/storefront/product/OptionPicker";
import { sortSizes } from "@/components/storefront/listing/useListing";
import { WishlistButton } from "@/components/WishlistButton";
import { ProductReviews } from "@/components/ProductReviews";
import { SizeGuideModal } from "@/components/SizeGuideModal";
import { SizeRecommender } from "@/components/SizeRecommender";
import { RelatedProducts } from "@/components/RelatedProducts";
import { CompleteTheLook } from "@/components/CompleteTheLook";
import { RecentlyViewedProducts } from "@/components/RecentlyViewedProducts";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { SocialShareButtons } from "@/components/SocialShareButtons";
import { StockNotificationButton } from "@/components/StockNotificationButton";
import { VirtualTryOn } from "@/components/VirtualTryOn";
import { AI_SIZE_FINDER_ENABLED, VIRTUAL_TRY_ON_ENABLED } from "@/lib/aiFeatures";
import { DeliveryEstimate } from "@/components/DeliveryEstimate";
import { VerifiedBoutiqueBadge } from "@/components/VerifiedBoutiqueBadge";
import { FoundingBoutiqueBadge } from "@/components/FoundingBoutiqueBadge";
import { ProductCustomiser, buildCustomisation, emptyCustomiser, type CustomiserState } from "@/components/ProductCustomiser";
import { CUSTOMISATION_ENABLED, customisationPrice, customisationSummary, inr, readSetup } from "@/lib/customisation";
import { useAuth } from "@/hooks/useAuth";
import { discountPercent, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FreeDeliveryBadge } from "@/components/storefront/FreeDeliveryBadge";

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
    is_verified: boolean;
    is_founding: boolean;
    return_window_days: number;
    returns_enabled: boolean;
    cod_enabled: boolean;
    address: Record<string, string> | null;
    contact_email: string | null;
    contact_phone: string | null;
    shipping_flat_rate: number;
    free_shipping_threshold: number | null;
    default_prep_days?: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const { shippingCharged } = useCustomerShipping();
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  // Required choices the customer left out when adding to cart (shown together).
  const [missingChoices, setMissingChoices] = useState<("size" | "color")[]>([]);
  const [customiser, setCustomiser] = useState<CustomiserState>(emptyCustomiser);
  const { user } = useAuth();

  const addItem = useCartStore((state) => state.addItem);
  const { trackProductView } = useRecentlyViewed();
  const setBagOpen = useUiStore((s) => s.setBagOpen);
  const { data: boutiques = [] } = useStoreBoutiques();

  // Star rating next to the title (the full reviews are further down).
  const { data: ratingSummary } = useQuery({
    queryKey: ["product-rating", handle],
    enabled: !!handle,
    queryFn: async () => {
      const { data } = await supabase.from("product_reviews").select("rating").eq("product_id", handle!);
      const rows = data || [];
      return { count: rows.length, avg: rows.length ? rows.reduce((sum, r) => sum + r.rating, 0) / rows.length : 0 };
    },
  });

  // Phones: an add-to-bag bar appears once the main buttons scroll away.
  const actionsRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  useEffect(() => {
    const el = actionsRef.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setShowStickyBar(el.getBoundingClientRect().bottom < 0);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [loading, product?.id]);

  // Track product view - with the name/photo/price, which a guest's
  // on-device "recently viewed" list has no other way to show.
  useEffect(() => {
    if (product && product.id === handle) {
      trackProductView(product.id, {
        id: product.id,
        name: product.name,
        price: product.price,
        compare_at_price: product.compare_at_price,
        images: product.images,
      });
    }
  }, [product, handle, trackProductView]);

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
              "name, slug, is_trusted, is_verified, is_founding, return_window_days, returns_enabled, cod_enabled, address, contact_email, contact_phone, shipping_flat_rate, free_shipping_threshold, default_prep_days"
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

  // One size and one color are always chosen: on opening a product, the
  // first variant in stock (else the first); changing one keeps the pair a
  // real variant (another color in that size, or another size in that color).
  const variantList = Array.isArray(product?.variants) ? (product!.variants as ProductVariant[]) : [];
  const sizeOf = (v: ProductVariant) => v.options?.size || v.options?.Size || null;
  const colorOf = (v: ProductVariant) => v.options?.color || v.options?.Color || null;
  useEffect(() => {
    if (!product) return;
    setMissingChoices([]);
    if (variantList.length > 0) {
      const pick = variantList.find((v) => (v.stock ?? 0) > 0) ?? variantList[0];
      setSelectedSize(sizeOf(pick));
      setSelectedColor(colorOf(pick));
    } else {
      const obj = product.variants as unknown as { sizes?: string[]; colors?: string[] } | null;
      setSelectedSize(obj?.sizes?.[0] ?? null);
      setSelectedColor(obj?.colors?.[0] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  const chooseSize = (size: string) => {
    setSelectedSize(size);
    setMissingChoices((m) => m.filter((x) => x !== "size"));
    if (variantList.length && selectedColor && !variantList.some((v) => sizeOf(v) === size && colorOf(v) === selectedColor)) {
      const alt = variantList.find((v) => sizeOf(v) === size && (v.stock ?? 0) > 0) ?? variantList.find((v) => sizeOf(v) === size);
      setSelectedColor(alt ? colorOf(alt) : null);
    }
  };
  const chooseColor = (color: string) => {
    setSelectedColor(color);
    setMissingChoices((m) => m.filter((x) => x !== "color"));
    if (variantList.length && selectedSize && !variantList.some((v) => colorOf(v) === color && sizeOf(v) === selectedSize)) {
      const alt = variantList.find((v) => colorOf(v) === color && (v.stock ?? 0) > 0) ?? variantList.find((v) => colorOf(v) === color);
      setSelectedSize(alt ? sizeOf(alt) : null);
    }
  };

  // Get current price and stock based on variant selection
  const currentPrice = selectedVariant?.price || product?.price || 0;
  // (Off while customisation is hidden - nothing to customise, no panel.)
  const customisationSetup = useMemo(() => readSetup(CUSTOMISATION_ENABLED ? (product as any) : null), [product]);
  const customised = buildCustomisation(customisationSetup, customiser);
  const customisationExtra = "choice" in customised ? customisationPrice(customised.choice) : 0;
  const currentStock = selectedVariant?.stock ?? product?.stock_quantity ?? 0;
  // Same rule OrderHistory applies after purchase: the product's own flag
  // AND the vendor's store-wide returns switch must both allow it.
  const isRefundable = (product?.is_returnable ?? true) && vendorInfo?.returns_enabled !== false;
  // Same rule checkout applies: the product and its boutique must both allow COD.
  const codAvailable = (product?.cod_available ?? true) && vendorInfo?.cod_enabled !== false;
  // A variant with its own photo (e.g. a color swatch) replaces the shared
  // gallery entirely while selected; falls back to the product's own
  // images otherwise.
  const galleryImages = selectedVariant?.image_url
    ? [selectedVariant.image_url]
    : product?.images || [];

  // Shared by both "Add to Cart" and "Buy Now" - the validation and the
  // item that ends up in the cart must be identical either way, since Shop
  // Now still goes through the same cart/checkout flow (add, then jump
  // straight to /checkout) rather than a separate order path.
  const addSelectedToCart = (): boolean => {
    if (!product) {
      toast.error("Product not available");
      return false;
    }
    // Size and color are required wherever the product has them - every
    // missing one is flagged at once, not one prompt at a time.
    const missing: ("size" | "color")[] = [
      ...(availableSizes.length > 0 && !selectedSize ? (["size"] as const) : []),
      ...(availableColors.length > 0 && !selectedColor ? (["color"] as const) : []),
    ];
    if (missing.length === 0 && variantList.length > 0 && !selectedVariant) {
      // The chosen pair isn't a variant of this product.
      missing.push(...(availableSizes.length ? (["size"] as const) : []), ...(availableColors.length ? (["color"] as const) : []));
    }
    if (missing.length > 0) {
      setMissingChoices(missing);
      toast.error(
        missing.length === 2 ? "Please select a size and a colour" : missing[0] === "size" ? "Please select a size" : "Please select a colour",
      );
      document.getElementById(`choose-${missing[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }

    if ("error" in customised) {
      toast.error(customised.error);
      return false;
    }
    const customisation = customised.choice;

    const variantId = selectedVariant?.id || `${product.id}-${selectedSize || 'default'}-${selectedColor || 'default'}`;
    const variantTitle = [selectedSize, selectedColor].filter(Boolean).join(" / ") || "Default";
    const selectedOptions = [];
    if (selectedSize) selectedOptions.push({ name: "Size", value: selectedSize });
    if (selectedColor) selectedOptions.push({ name: "Colour", value: selectedColor });

    addItem({
      productId: product.id,
      productName: product.name,
      productImage: product.images[0] || null,
      vendorId: product.vendor_id ?? null,
      variantId,
      variantTitle,
      price: {
        amount: (currentPrice + (customisation ? customisationPrice(customisation) : 0)).toString(),
        currencyCode: "INR",
      },
      quantity,
      selectedOptions,
      // A customised piece is its own cart line, priced with its customisation.
      ...(customisation
        ? { lineId: crypto.randomUUID(), customisation, basePrice: currentPrice.toString() }
        : {}),
    });
    if (customisation) setCustomiser(emptyCustomiser);

    return true;
  };

  const handleAddToCart = () => {
    if (!product || !addSelectedToCart()) return;

    const details = [product.name];
    if (selectedSize) details.push(`Size: ${selectedSize}`);
    if (selectedColor) details.push(`Colour: ${selectedColor}`);
    if ("choice" in customised && customised.choice) details.push(`Customised: ${customisationSummary(customised.choice)}`);
    details.push(`Qty: ${quantity}`);

    toast.success("Added to cart", {
      description: details.join(" • "),
      position: "top-center",
      action: { label: "View cart", onClick: () => setBagOpen(true) },
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
        <main className="store-container pb-20 pt-6 md:pt-10">
          <Skeleton className="mb-8 h-3 w-56 rounded-none" />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:gap-14 xl:gap-20">
            <div className="flex gap-4">
              <div className="hidden w-[76px] flex-col gap-3 lg:flex">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[3/4] w-full rounded-none" />
                ))}
              </div>
              <Skeleton className="aspect-[3/4] flex-1 rounded-none" />
            </div>
            <div className="space-y-5">
              <Skeleton className="h-3 w-32 rounded-none" />
              <Skeleton className="h-10 w-4/5 rounded-none" />
              <Skeleton className="h-7 w-32 rounded-none" />
              <Skeleton className="h-px w-full rounded-none" />
              <div className="flex gap-2.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-14 rounded-none" />
                ))}
              </div>
              <Skeleton className="h-12 w-full rounded-none" />
              <Skeleton className="h-12 w-full rounded-none" />
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
        <main className="store-container py-28 text-center">
          <p className="eyebrow text-gold">AllBoutiqs</p>
          <h1 className="mt-3 font-serif text-4xl md:text-5xl">This piece isn't available</h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            It may have sold out or been taken down by the boutique. There's plenty more to discover.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/category/all"
              className="inline-flex h-12 items-center bg-primary px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground hover:bg-primary/90"
            >
              Shop all
            </Link>
            <Link
              to="/"
              className="inline-flex h-12 items-center border border-foreground px-8 text-[11px] font-medium uppercase tracking-[0.22em] hover:bg-foreground hover:text-background"
            >
              Back to home
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // MRP is shown whenever it's above the price being charged right now.
  const mrp = product.compare_at_price && product.compare_at_price > currentPrice ? product.compare_at_price : null;
  const off = discountPercent(currentPrice, product.compare_at_price);
  const soldOut = currentStock <= 0;
  const madeToOrder = !!product.made_to_order;
  const prepDays = product.prep_days ?? vendorInfo?.default_prep_days ?? 2;
  const boutique = product.vendor_id ? boutiques.find((b) => b.id === product.vendor_id) : undefined;

  // Sizes/colours with nothing in stock (for the chosen colour, where there is
  // one) - shown crossed out but still selectable for "notify me".
  const unavailableSizes = new Set<string>();
  const unavailableColors = new Set<string>();
  if (variantList.length > 0) {
    for (const s of availableSizes) {
      const pool = variantList.filter((v) => sizeOf(v) === s);
      const inColour = selectedColor ? pool.filter((v) => colorOf(v) === selectedColor) : [];
      if (!(inColour.length ? inColour : pool).some((v) => (v.stock ?? 0) > 0)) unavailableSizes.add(s);
    }
    for (const c of availableColors) {
      if (!variantList.some((v) => colorOf(v) === c && (v.stock ?? 0) > 0)) unavailableColors.add(c);
    }
  }

  const vendorAddress = vendorInfo?.address?.address_line1
    ? `${vendorInfo.address.address_line1}${vendorInfo.address.address_line2 ? `, ${vendorInfo.address.address_line2}` : ""}, ${vendorInfo.address.city}, ${vendorInfo.address.state} - ${vendorInfo.address.pincode}, ${vendorInfo.address.country || "India"}`
    : null;

  const shippingTitle = !shippingCharged || vendorInfo?.free_shipping_threshold != null ? "Free Delivery" : "Shipping";
  // This piece alone ships free: delivery is free site-wide, or it's above
  // the boutique's free-delivery amount.
  const freeDelivery =
    !shippingCharged || (vendorInfo?.free_shipping_threshold != null && currentPrice >= Number(vendorInfo.free_shipping_threshold));
  const shippingText = !shippingCharged
    ? "On all orders"
    : vendorInfo?.free_shipping_threshold != null
      ? `On orders above ${formatINR(vendorInfo.free_shipping_threshold)}`
      : vendorInfo?.shipping_flat_rate
        ? `${formatINR(vendorInfo.shipping_flat_rate)} flat rate`
        : "Calculated at checkout";

  const services = [
    { icon: Truck, title: shippingTitle, text: shippingText },
    isRefundable
      ? { icon: RotateCcw, title: "Easy returns", text: `${vendorInfo?.return_window_days ?? 7}-day return policy` }
      : { icon: RotateCcw, title: "Non-refundable", text: "Not eligible for return & refund - exchange only" },
    codAvailable
      ? { icon: Banknote, title: "Cash on Delivery available", text: "Pay in cash when it arrives, or pay online" }
      : { icon: Banknote, title: "Prepaid only", text: "Cash on Delivery isn't available for this product - pay online at checkout" },
    { icon: ShieldCheck, title: "Quality-checked", text: "Checked by AllBoutiqs before it ships" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        <div className="store-container pb-14 pt-5 md:pb-20 md:pt-8">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground md:mb-8">
            <Link to="/" className="shrink-0 hover:text-foreground">
              Home
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0" />
            {category ? (
              <>
                <Link to={`/category/${category.slug}`} className="shrink-0 hover:text-foreground">
                  {category.name}
                </Link>
                <ChevronRight className="h-3 w-3 shrink-0" />
              </>
            ) : null}
            <span className="truncate text-foreground">{product.name}</span>
          </nav>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:gap-14 xl:gap-20">
            {/* Product media: optional approved video + image album */}
            <ProductMediaGallery
              images={galleryImages}
              productName={product.name}
              video={
                product.video_url && product.video_status === "approved"
                  ? { url: product.video_url, isPrimary: product.video_is_primary }
                  : null
              }
            />

            {/* Product Info */}
            <div className="min-w-0 lg:max-w-[560px]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {vendorInfo ? (
                  <Link to={`/store/${vendorInfo.slug}`} className="eyebrow text-gold transition-colors hover:text-primary">
                    {vendorInfo.name}
                  </Link>
                ) : (
                  <span className="eyebrow text-gold">AllBoutiqs</span>
                )}
                {vendorInfo?.is_verified && <VerifiedBoutiqueBadge size="sm" />}
                {vendorInfo?.is_founding && <FoundingBoutiqueBadge size="sm" />}
                {vendorInfo?.is_trusted && (
                  <span className="inline-flex items-center gap-1 border border-gold/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em]">
                    <ShieldCheck className="h-3 w-3 text-gold" /> Trusted Partner
                  </span>
                )}
              </div>

              <h1 className="mt-3 font-serif text-[2rem] leading-[1.1] tracking-tight md:text-[2.6rem]">{product.name}</h1>

              {!!ratingSummary?.count && (
                <a href="#reviews" className="mt-3 inline-flex items-center gap-2 text-sm hover:text-primary">
                  <span className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={cn("h-3.5 w-3.5", n <= Math.round(ratingSummary.avg) ? "fill-gold text-gold" : "text-foreground/20")} />
                    ))}
                  </span>
                  {ratingSummary.avg.toFixed(1)}
                  <span className="text-muted-foreground underline-offset-4 hover:underline">
                    ({ratingSummary.count} review{ratingSummary.count === 1 ? "" : "s"})
                  </span>
                </a>
              )}

              {/* Price */}
              <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-2xl font-medium tracking-tight">{formatINR(currentPrice)}</span>
                {mrp && <span className="text-base text-muted-foreground line-through">{formatINR(mrp)}</span>}
                {off && <span className="text-sm font-medium text-primary">{off}% off</span>}
              </div>
              {customisationExtra > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  + {inr(customisationExtra)} customisation = <strong className="text-foreground">{inr(currentPrice + customisationExtra)}</strong>
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Inclusive of all taxes</p>
              {freeDelivery && <FreeDeliveryBadge className="mt-2" />}

              {(madeToOrder || soldOut || currentStock <= 5) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {madeToOrder && (
                    <span className="inline-flex items-center gap-1.5 border border-gold/40 bg-ivory px-3 py-1.5 text-[11px] uppercase tracking-[0.16em]">
                      <Scissors className="h-3.5 w-3.5 text-gold" /> Made to order · ships in {prepDays} days
                    </span>
                  )}
                  {soldOut && (
                    <span className="inline-flex items-center bg-foreground px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-background">Out of Stock</span>
                  )}
                  {!soldOut && currentStock <= 5 && (
                    <span className="inline-flex items-center border border-primary/30 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-primary">
                      Only {currentStock} left
                    </span>
                  )}
                </div>
              )}

              <div className="my-7 h-px bg-border" />

              <div className="space-y-7">
                <OptionPicker
                  id="choose-color"
                  label="Colour"
                  type="color"
                  options={availableColors}
                  selected={selectedColor}
                  onSelect={chooseColor}
                  unavailable={unavailableColors}
                  error={missingChoices.includes("color") ? "Please select a colour" : null}
                />
                <OptionPicker
                  id="choose-size"
                  label="Size"
                  type="size"
                  options={sortSizes(availableSizes)}
                  selected={selectedSize}
                  onSelect={chooseSize}
                  unavailable={unavailableSizes}
                  error={missingChoices.includes("size") ? "Please select a size" : null}
                  aside={
                    <div className="flex items-center gap-3 [&_button]:text-xs [&_button]:uppercase [&_button]:tracking-[0.16em] [&_button]:text-muted-foreground hover:[&_button]:text-foreground">
                      <SizeGuideModal categoryId={product.category_id} vendorId={product.vendor_id} />
                      {AI_SIZE_FINDER_ENABLED && (
                        <SizeRecommender productId={product.id} availableSizes={availableSizes} onSizeRecommended={chooseSize} />
                      )}
                    </div>
                  }
                />
              </div>

              <div className={cn(CUSTOMISATION_ENABLED && "mt-7")}>
                <ProductCustomiser
                  setup={customisationSetup}
                  basePrice={currentPrice}
                  value={customiser}
                  onChange={setCustomiser}
                  userId={user?.id ?? null}
                />
              </div>

              {/* Actions */}
              <div ref={actionsRef} className="mt-8 space-y-3">
                <div className="flex gap-3">
                  <div className="flex h-12 shrink-0 items-center border border-foreground/20">
                    <button
                      type="button"
                      onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                      className="flex h-full w-10 items-center justify-center hover:text-primary disabled:opacity-30"
                      disabled={quantity <= 1}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((prev) => Math.min(currentStock, prev + 1))}
                      className="flex h-full w-10 items-center justify-center hover:text-primary disabled:opacity-30"
                      disabled={soldOut || quantity >= currentStock}
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={soldOut}
                    className="h-12 flex-1 bg-primary text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground transition-colors hover:bg-maroon-deep disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                  >
                    {soldOut ? "Out of Stock" : "Add to Cart"}
                  </button>
                  <WishlistButton
                    productId={product.id}
                    className="h-12 w-12 shrink-0 rounded-none border border-foreground/20 bg-transparent shadow-none backdrop-blur-none hover:border-foreground hover:bg-transparent hover:shadow-none"
                  />
                </div>
                {!soldOut && (
                  <button
                    type="button"
                    onClick={handleBuyNow}
                    className="h-12 w-full border border-foreground text-[11px] font-medium uppercase tracking-[0.22em] transition-colors hover:bg-foreground hover:text-background"
                  >
                    Buy Now
                  </button>
                )}
                {/* Stock Notification for Out of Stock */}
                {soldOut && <StockNotificationButton productId={product.id} productName={product.name} />}
              </div>

              <div className="mt-5 flex items-center justify-between gap-4">
                <SocialShareButtons
                  url={`${window.location.origin}${location.pathname}`}
                  title={product.name}
                  description={product.description || undefined}
                />
                <span className="text-xs text-muted-foreground">Code: {product.sku || product.id.slice(0, 8)}</span>
              </div>

              {/* Virtual Try-On (hidden for now - src/lib/aiFeatures.ts) */}
              {VIRTUAL_TRY_ON_ENABLED && (
                <div className="mt-6">
                  <VirtualTryOn productName={product.name} productImageUrl={product.images?.[0]} />
                </div>
              )}

              {/* Delivery + services */}
              <div className="mt-8 border border-border">
                {product.vendor_id && (
                  <div className="border-b border-border p-5">
                    <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.2em]">Check delivery date</p>
                    <DeliveryEstimate vendorId={product.vendor_id} productId={product.id} />
                    {madeToOrder && (
                      <p className="mt-2.5 text-xs text-muted-foreground">
                        Made for you after you order - the delivery date includes the {prepDays} days it takes.
                      </p>
                    )}
                  </div>
                )}
                <ul className="grid sm:grid-cols-2">
                  {services.map(({ icon: Icon, title, text }, i) => (
                    <li
                      key={title}
                      className={cn(
                        "flex gap-3 p-5",
                        i > 0 && "border-t border-border",
                        i === 1 && "sm:border-l sm:border-t-0",
                        i === 3 && "sm:border-l",
                      )}
                    >
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} />
                      <div>
                        <p className="text-sm font-medium">{title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Details */}
              <Accordion type="multiple" defaultValue={["description"]} className="mt-8 border-t border-border">
                <AccordionItem value="description" className="border-border">
                  <AccordionTrigger className="py-5 text-[12px] font-medium uppercase tracking-[0.2em] hover:no-underline">
                    Description
                  </AccordionTrigger>
                  <AccordionContent className="whitespace-pre-line pb-6 text-[15px] leading-relaxed text-foreground/80">
                    {product.description || "No description available."}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="details" className="border-border">
                  <AccordionTrigger className="py-5 text-[12px] font-medium uppercase tracking-[0.2em] hover:no-underline">
                    Product details
                  </AccordionTrigger>
                  <AccordionContent className="pb-6">
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                      {product.specifications.map((spec, i) => (
                        <div key={i}>
                          <dt className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{spec.label}</dt>
                          <dd className="mt-0.5 text-sm">{spec.value || "-"}</dd>
                        </div>
                      ))}
                      <div>
                        <dt className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Availability</dt>
                        <dd className="mt-0.5 text-sm">
                          {product.stock_quantity > 0 ? `In stock (${product.stock_quantity} available)` : "Out of stock"}
                        </dd>
                      </div>
                      {vendorInfo && (
                        <div>
                          <dt className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Returns</dt>
                          <dd className="mt-0.5 text-sm">
                            {isRefundable ? `${vendorInfo.return_window_days}-day window` : "Non-refundable (exchange only)"}
                          </dd>
                        </div>
                      )}
                      {madeToOrder && (
                        <div>
                          <dt className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Made to order</dt>
                          <dd className="mt-0.5 text-sm">Ships in {prepDays} days</dd>
                        </div>
                      )}
                    </dl>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="legal" className="border-border">
                  <AccordionTrigger className="py-5 text-[12px] font-medium uppercase tracking-[0.2em] hover:no-underline">
                    Seller & product information
                  </AccordionTrigger>
                  <AccordionContent className="pb-6">
                    <dl className="space-y-3 text-sm">
                      <InfoRow label="Product code">{product.sku || product.id.slice(0, 8)}</InfoRow>
                      <InfoRow label="MRP">{formatINR(product.compare_at_price ?? product.price)} inclusive of all taxes</InfoRow>
                      <InfoRow label="Sold by">
                        {vendorInfo ? (
                          <Link to={`/store/${vendorInfo.slug}`} className="underline-offset-4 hover:text-primary hover:underline">
                            {vendorInfo.name}
                          </Link>
                        ) : (
                          "AllBoutiqs"
                        )}
                      </InfoRow>
                      <InfoRow label="Marketed / manufactured by">
                        {vendorInfo?.name || "AllBoutiqs"}
                        {vendorAddress && `, ${vendorAddress}`}
                      </InfoRow>
                      <InfoRow label="Net quantity">{product.net_quantity}</InfoRow>
                      <InfoRow label="Country of origin">{product.country_of_origin}</InfoRow>
                      <InfoRow label="Customer care address">
                        {vendorInfo ? (
                          <>
                            {vendorAddress && `${vendorAddress}. `}
                            {vendorInfo.contact_phone && `Ph: ${vendorInfo.contact_phone}. `}
                            {vendorInfo.contact_email && `Email: ${vendorInfo.contact_email}`}
                          </>
                        ) : (
                          `${COMPANY.supportEmail} · ${COMPANY.supportPhone}`
                        )}
                      </InfoRow>
                      <InfoRow label="AllBoutiqs customer care">
                        {COMPANY.supportEmail} · {COMPANY.supportPhone} · WhatsApp {COMPANY.whatsapp}
                      </InfoRow>
                      <InfoRow label="Commodity">{category?.name || "Fashion"}</InfoRow>
                    </dl>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* The boutique */}
              {vendorInfo && (
                <Link to={`/store/${vendorInfo.slug}`} className="group mt-8 flex items-center gap-4 bg-ivory p-5">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gold/30 bg-background">
                    {boutique?.logo_url ? (
                      <img src={boutique.logo_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <span className="font-serif text-2xl text-primary">{vendorInfo.name.charAt(0).toUpperCase()}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="eyebrow block text-muted-foreground">Sold by</span>
                    <span className="mt-1 block font-serif text-xl leading-tight group-hover:text-primary">{vendorInfo.name}</span>
                    {boutique?.description && (
                      <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">{boutique.description}</span>
                    )}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* AI Complete the Look */}
        <CompleteTheLook productId={product.id} />

        {/* Product Reviews Section */}
        <section id="reviews" className="scroll-mt-32 border-t border-border py-14 md:py-20">
          <div className="store-container">
            <ProductReviews productId={product.id} />
          </div>
        </section>

        <RelatedProducts
          currentProductId={product.id}
          categoryId={product.category_id}
          categorySlug={category?.slug}
          vendor={vendorInfo && product.vendor_id ? { id: product.vendor_id, name: vendorInfo.name, slug: vendorInfo.slug } : null}
        />

        <div className="border-t border-border">
          <RecentlyViewedProducts excludeProductId={product.id} />
        </div>
      </main>

      <Footer />

      {/* Phones: add-to-cart bar once the main buttons scroll away */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-ivory/95 backdrop-blur-md transition-transform duration-300 lg:hidden",
          showStickyBar ? "translate-y-0" : "translate-y-full",
        )}
        aria-hidden={!showStickyBar}
      >
        <div className="store-container flex items-center gap-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{product.name}</p>
            <p className="text-sm font-medium">
              {formatINR(currentPrice)}
              {[selectedSize, selectedColor].filter(Boolean).length > 0 && (
                <span className="ml-2 font-normal text-muted-foreground">{[selectedSize, selectedColor].filter(Boolean).join(" / ")}</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={soldOut}
            tabIndex={showStickyBar ? 0 : -1}
            className="h-12 shrink-0 bg-primary px-7 text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
          >
            {soldOut ? "Out of Stock" : "Add to Cart"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
