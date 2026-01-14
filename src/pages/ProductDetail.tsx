import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
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
  Heart,
  Share2,
  Truck,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCartStore } from "@/stores/cartStore";
import { toast } from "sonner";
import { Product, ProductVariant } from "@/hooks/useProducts";

export default function ProductDetail() {
  const { handle } = useParams<{ handle: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [category, setCategory] = useState<{ name: string; slug: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);

  const addItem = useCartStore((state) => state.addItem);

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

  const handleAddToCart = () => {
    if (!product) {
      toast.error("Product not available");
      return;
    }

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
      quantity,
      selectedOptions: [],
    });

    toast.success("Added to cart!", {
      description: `${product.name} x ${quantity}`,
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

  const images = product.images || [];
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
          {/* Image Gallery */}
          <div className="space-y-4">
            {/* Main Image */}
            <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted">
              {images[selectedImage] ? (
                <img
                  src={images[selectedImage]}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag className="h-16 w-16 text-muted-foreground" />
                </div>
              )}

              {/* Navigation Arrows */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setSelectedImage((prev) =>
                        prev === 0 ? images.length - 1 : prev - 1
                      )
                    }
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-card/80 backdrop-blur-sm hover:bg-card transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() =>
                      setSelectedImage((prev) =>
                        prev === images.length - 1 ? 0 : prev + 1
                      )
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-card/80 backdrop-blur-sm hover:bg-card transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`flex-shrink-0 w-20 h-24 rounded-lg overflow-hidden border-2 transition-colors ${
                      selectedImage === index
                        ? "border-primary"
                        : "border-transparent"
                    }`}
                  >
                    <img
                      src={image}
                      alt={`${product.name} - Image ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

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
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-primary">
                ₹{product.price.toFixed(0)}
              </span>
              {hasDiscount && (
                <span className="text-xl text-muted-foreground line-through">
                  ₹{product.compare_at_price?.toFixed(0)}
                </span>
              )}
              {product.stock_quantity <= 0 && (
                <Badge variant="secondary">Out of Stock</Badge>
              )}
              {product.stock_quantity > 0 && product.stock_quantity <= 5 && (
                <Badge variant="destructive">
                  Only {product.stock_quantity} left!
                </Badge>
              )}
            </div>

            <Separator />

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
                        Math.min(product.stock_quantity, prev + 1)
                      )
                    }
                    className="p-3 hover:bg-muted transition-colors"
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
                disabled={product.stock_quantity <= 0}
              >
                <ShoppingBag className="h-5 w-5 mr-2" />
                {product.stock_quantity > 0 ? "Add to Cart" : "Out of Stock"}
              </Button>
              <Button size="lg" variant="outline">
                <Heart className="h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline">
                <Share2 className="h-5 w-5" />
              </Button>
            </div>

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
      </main>

      <Footer />
    </div>
  );
}
