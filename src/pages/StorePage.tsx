import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/ProductCard";
import { supabase } from "@/integrations/supabase/client";
import { Product, mapDbVariant } from "@/hooks/useProducts";
import { Loader2, Store, Truck, RotateCcw, Star, ShieldCheck } from "lucide-react";

interface StoreVendor {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  is_trusted: boolean;
  rating: number | null;
  shipping_flat_rate: number;
  free_shipping_threshold: number | null;
  return_window_days: number;
  return_policy: string | null;
}

export default function StorePage() {
  const { slug } = useParams<{ slug: string }>();
  const [vendor, setVendor] = useState<StoreVendor | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!slug) return;
      setLoading(true);
      try {
        const { data: v, error } = await supabase
          .from("vendors")
          .select(
            "id, name, slug, description, logo_url, banner_url, is_trusted, rating, shipping_flat_rate, free_shipping_threshold, return_window_days, return_policy"
          )
          .eq("slug", slug)
          .eq("status", "approved")
          .maybeSingle();

        if (error) throw error;
        if (!v) {
          setVendor(null);
          return;
        }
        setVendor(v as StoreVendor);

        const { data: prods } = await supabase
          .from("products")
          .select("*, product_variants(*)")
          .eq("vendor_id", v.id)
          .eq("is_active", true)
          .eq("approval_status", "approved")
          .order("created_at", { ascending: false });

        setProducts(
          (prods || []).map((p: any) => ({
            ...p,
            images: (p.images as string[]) || [],
            variants: (p.product_variants || []).map(mapDbVariant),
            // Every product on this page belongs to the same vendor - no
            // need for a redundant join, the page already has it loaded.
            vendor: { name: v.name },
          }))
        );
      } catch (e) {
        console.error("store load error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex justify-center py-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-24 text-center space-y-4">
          <h1 className="text-3xl font-serif font-bold">Store not found</h1>
          <p className="text-muted-foreground">
            This store may be inactive or awaiting approval.
          </p>
          <Link to="/">
            <Button>Back to home</Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="relative h-40 md:h-56 bg-secondary/40 overflow-hidden">
        {vendor.banner_url && (
          <img
            src={vendor.banner_url}
            alt={`${vendor.name} store banner`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
      </div>

      <div className="container mx-auto px-4">
        <div className="-mt-10 md:-mt-12 relative flex flex-wrap items-end gap-4 pb-6">
          <div className="h-20 w-20 md:h-24 md:w-24 rounded-xl bg-card border border-border flex items-center justify-center overflow-hidden shadow-sm">
            {vendor.logo_url ? (
              <img
                src={vendor.logo_url}
                alt={`${vendor.name} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <Store className="h-8 w-8 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-serif font-bold">
                {vendor.name}
              </h1>
              {vendor.is_trusted && (
                <Badge variant="secondary" className="gap-1">
                  <ShieldCheck className="h-3 w-3" /> Trusted partner
                </Badge>
              )}
              {!!vendor.rating && (
                <Badge variant="outline" className="gap-1">
                  <Star className="h-3 w-3 fill-current" /> {vendor.rating}
                </Badge>
              )}
            </div>
            {vendor.description && (
              <p className="text-muted-foreground mt-1 max-w-2xl">
                {vendor.description}
              </p>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pb-8">
          <div className="flex items-start gap-3 rounded-lg border border-border p-4">
            <Truck className="h-5 w-5 text-primary mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Shipping</p>
              <p className="text-muted-foreground">
                Flat ₹{Number(vendor.shipping_flat_rate).toFixed(0)} per order
                {vendor.free_shipping_threshold
                  ? ` · Free above ₹${Number(vendor.free_shipping_threshold).toFixed(0)}`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border p-4">
            <RotateCcw className="h-5 w-5 text-primary mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Returns</p>
              <p className="text-muted-foreground">
                {vendor.return_policy ||
                  `${vendor.return_window_days}-day return window`}
              </p>
            </div>
          </div>
        </div>

        <section className="pb-16">
          <h2 className="text-xl font-serif font-bold mb-6">
            Products ({products.length})
          </h2>
          {products.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center">
              This store has no live products yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>
      </div>

      <Footer />
    </div>
  );
}
