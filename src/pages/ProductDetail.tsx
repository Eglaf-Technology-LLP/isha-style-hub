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
  Ruler,
  Loader2
} from "lucide-react";
import { fetchProductByHandle, formatPrice } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { toast } from "sonner";

export default function ProductDetail() {
  const { handle } = useParams<{ handle: string }>();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  
  const addItem = useCartStore((state) => state.addItem);

  useEffect(() => {
    async function loadProduct() {
      if (!handle) return;
      setLoading(true);
      try {
        const data = await fetchProductByHandle(handle);
        setProduct(data);
        
        // Initialize selected options with first values
        if (data?.options) {
          const initialOptions: Record<string, string> = {};
          data.options.forEach((opt: any) => {
            initialOptions[opt.name] = opt.values[0];
          });
          setSelectedOptions(initialOptions);
        }
      } catch (error) {
        console.error('Failed to fetch product:', error);
      } finally {
        setLoading(false);
      }
    }
    loadProduct();
  }, [handle]);

  const getSelectedVariant = () => {
    if (!product?.variants?.edges) return null;
    
    return product.variants.edges.find((variant: any) => {
      return variant.node.selectedOptions.every((opt: any) => 
        selectedOptions[opt.name] === opt.value
      );
    });
  };

  const selectedVariant = getSelectedVariant();

  const handleAddToCart = () => {
    if (!selectedVariant || !product) {
      toast.error("Please select all options");
      return;
    }

    const productWrapper = {
      node: product
    };

    addItem({
      product: productWrapper,
      variantId: selectedVariant.node.id,
      variantTitle: selectedVariant.node.title,
      price: selectedVariant.node.price,
      quantity,
      selectedOptions: selectedVariant.node.selectedOptions,
    });

    toast.success("Added to cart!", {
      description: `${product.title} x ${quantity}`,
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

  const images = product.images?.edges || [];
  const price = selectedVariant?.node?.price || product.priceRange?.minVariantPrice;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Breadcrumb */}
      <div className="container mx-auto px-4 py-4">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-primary">Home</Link>
          <span>/</span>
          <Link to={`/category/${product.productType?.toLowerCase() || 'all'}`} className="hover:text-primary">
            {product.productType || 'Products'}
          </Link>
          <span>/</span>
          <span className="text-foreground">{product.title}</span>
        </nav>
      </div>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Image Gallery */}
          <div className="space-y-4">
            {/* Main Image */}
            <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted">
              {images[selectedImage]?.node ? (
                <img
                  src={images[selectedImage].node.url}
                  alt={images[selectedImage].node.altText || product.title}
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
                    onClick={() => setSelectedImage(prev => prev === 0 ? images.length - 1 : prev - 1)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-card/80 backdrop-blur-sm hover:bg-card transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setSelectedImage(prev => prev === images.length - 1 ? 0 : prev + 1)}
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
                {images.map((image: any, index: number) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`flex-shrink-0 w-20 h-24 rounded-lg overflow-hidden border-2 transition-colors ${
                      selectedImage === index ? 'border-primary' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={image.node.url}
                      alt={image.node.altText || `${product.title} - Image ${index + 1}`}
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
                {product.vendor || 'Isha Fashion Hub'}
              </p>
              <h1 className="text-3xl md:text-4xl font-serif font-bold">{product.title}</h1>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-primary">
                {price && formatPrice(price.amount, price.currencyCode)}
              </span>
              {!selectedVariant?.node?.availableForSale && selectedVariant && (
                <Badge variant="secondary">Out of Stock</Badge>
              )}
            </div>

            <Separator />

            {/* Options */}
            {product.options?.map((option: any) => (
              <div key={option.name} className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-medium">
                    {option.name}: <span className="text-muted-foreground">{selectedOptions[option.name]}</span>
                  </label>
                  {option.name.toLowerCase() === 'size' && (
                    <button className="text-sm text-primary flex items-center gap-1 hover:underline">
                      <Ruler className="h-4 w-4" />
                      Size Guide
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {option.values.map((value: string) => {
                    const isSelected = selectedOptions[option.name] === value;
                    const isColor = option.name.toLowerCase() === 'color';
                    
                    if (isColor) {
                      return (
                        <button
                          key={value}
                          onClick={() => setSelectedOptions(prev => ({ ...prev, [option.name]: value }))}
                          className={`w-10 h-10 rounded-full border-2 transition-all ${
                            isSelected ? 'border-primary ring-2 ring-primary ring-offset-2' : 'border-border'
                          }`}
                          style={{ backgroundColor: value.toLowerCase() }}
                          title={value}
                        />
                      );
                    }
                    
                    return (
                      <button
                        key={value}
                        onClick={() => setSelectedOptions(prev => ({ ...prev, [option.name]: value }))}
                        className={`px-4 py-2 rounded-lg border transition-all ${
                          isSelected 
                            ? 'border-primary bg-primary text-primary-foreground' 
                            : 'border-border hover:border-primary'
                        }`}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Quantity */}
            <div className="space-y-3">
              <label className="font-medium">Quantity</label>
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-border rounded-lg">
                  <button
                    onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                    className="p-3 hover:bg-muted transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-12 text-center font-medium">{quantity}</span>
                  <button
                    onClick={() => setQuantity(prev => prev + 1)}
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
                disabled={!selectedVariant?.node?.availableForSale}
              >
                <ShoppingBag className="h-5 w-5 mr-2" />
                Add to Cart
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
                  <p className="text-sm text-muted-foreground">On orders above ₹999</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <RotateCcw className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Easy Returns</p>
                  <p className="text-sm text-muted-foreground">7 days return policy</p>
                </div>
              </div>
            </div>

            {/* Product Details Tabs */}
            <Tabs defaultValue="description" className="mt-8">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="description">Description</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="measurements">Measurements</TabsTrigger>
              </TabsList>
              <TabsContent value="description" className="mt-4">
                <div 
                  className="prose prose-sm max-w-none text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: product.descriptionHtml || product.description || 'No description available.' }}
                />
              </TabsContent>
              <TabsContent value="details" className="mt-4">
                <ul className="space-y-2 text-muted-foreground">
                  <li><span className="font-medium text-foreground">Brand:</span> {product.vendor || 'Isha Fashion Hub'}</li>
                  <li><span className="font-medium text-foreground">Category:</span> {product.productType || 'Fashion'}</li>
                  {product.tags?.length > 0 && (
                    <li>
                      <span className="font-medium text-foreground">Tags:</span>{' '}
                      {product.tags.join(', ')}
                    </li>
                  )}
                </ul>
              </TabsContent>
              <TabsContent value="measurements" className="mt-4">
                <div className="space-y-4">
                  <p className="text-muted-foreground">
                    Please refer to our size chart for accurate measurements. If you're between sizes, we recommend sizing up.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 font-medium">Size</th>
                          <th className="text-left py-2 font-medium">Chest (in)</th>
                          <th className="text-left py-2 font-medium">Waist (in)</th>
                          <th className="text-left py-2 font-medium">Length (in)</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        <tr className="border-b border-border">
                          <td className="py-2">S</td>
                          <td className="py-2">34-36</td>
                          <td className="py-2">28-30</td>
                          <td className="py-2">27</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-2">M</td>
                          <td className="py-2">38-40</td>
                          <td className="py-2">32-34</td>
                          <td className="py-2">28</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-2">L</td>
                          <td className="py-2">42-44</td>
                          <td className="py-2">36-38</td>
                          <td className="py-2">29</td>
                        </tr>
                        <tr>
                          <td className="py-2">XL</td>
                          <td className="py-2">46-48</td>
                          <td className="py-2">40-42</td>
                          <td className="py-2">30</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
