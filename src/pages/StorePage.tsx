import { useEffect, useState } from "react";
import { useCustomerShipping } from "@/hooks/useCustomerShipping";
import { useParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RotateCcw, ShieldCheck, Star, Truck } from "lucide-react";
import { VerifiedBoutiqueBadge } from "@/components/VerifiedBoutiqueBadge";
import { FoundingBoutiqueBadge } from "@/components/FoundingBoutiqueBadge";
import { useStoreBoutiques, useStoreCategories, useStoreProducts } from "@/hooks/useStorefront";
import { ProductListing } from "@/components/storefront/listing/ProductListing";
import { BrandPlaceholder } from "@/components/storefront/BrandPlaceholder";
import { formatINR } from "@/lib/format";

interface StoreVendor {
  id: string;
  name: string;
  slug: string;
  boutique_code: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  is_trusted: boolean;
  is_verified: boolean;
  is_founding: boolean;
  rating: number | null;
  shipping_flat_rate: number;
  free_shipping_threshold: number | null;
  return_window_days: number;
  return_policy: string | null;
}

export default function StorePage() {
  const { shippingCharged } = useCustomerShipping();
  const { slug } = useParams<{ slug: string }>();
  const [vendor, setVendor] = useState<StoreVendor | null>(null);
  const [loading, setLoading] = useState(true);
  const { data: allProducts = [], isLoading: productsLoading } = useStoreProducts();
  const { data: categories = [] } = useStoreCategories();
  const { data: boutiques = [] } = useStoreBoutiques();

  useEffect(() => {
    async function load() {
      if (!slug) return;
      setLoading(true);
      try {
        const { data: v, error } = await supabase
          .from("vendors")
          .select(
            "id, name, slug, boutique_code, description, logo_url, banner_url, is_trusted, is_verified, is_founding, rating, shipping_flat_rate, free_shipping_threshold, return_window_days, return_policy"
          )
          .eq("slug", slug)
          .eq("status", "approved")
          .maybeSingle();
        if (error) throw error;
        setVendor((v as StoreVendor) ?? null);
      } catch (e) {
        console.error("store load error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  const products = vendor ? allProducts.filter((p) => p.vendor_id === vendor.id) : [];

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
        <div className="store-container py-28 text-center">
          <p className="eyebrow text-gold">Boutique</p>
          <h1 className="mt-3 font-serif text-4xl">Boutique not found</h1>
          <p className="mt-3 text-muted-foreground">This boutique may be inactive or awaiting approval.</p>
          <Link
            to="/boutiques"
            className="mt-8 inline-flex h-12 items-center border border-foreground px-8 text-[11px] font-medium uppercase tracking-[0.22em] hover:bg-foreground hover:text-background"
          >
            See all boutiques
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        {/* Banner */}
        <section className="relative h-56 overflow-hidden bg-maroon-deep md:h-80">
          {vendor.banner_url ? (
            <img src={vendor.banner_url} alt={`${vendor.name} banner`} className="h-full w-full object-cover" />
          ) : (
            <BrandPlaceholder tone="dark" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
        </section>

        <section className="border-b border-border bg-ivory">
          <div className="store-container">
            <div className="relative -mt-14 flex flex-col gap-6 pb-10 md:-mt-16 md:flex-row md:items-end md:gap-8">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-ivory bg-background shadow-md md:h-32 md:w-32">
                {vendor.logo_url ? (
                  <img src={vendor.logo_url} alt={`${vendor.name} logo`} className="h-full w-full object-cover" />
                ) : (
                  <span className="font-serif text-5xl text-primary">{vendor.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1">
                <p className="eyebrow text-gold">Boutique · {vendor.boutique_code}</p>
                <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">{vendor.name}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {vendor.is_verified && <VerifiedBoutiqueBadge />}
                  {vendor.is_founding && <FoundingBoutiqueBadge />}
                  {vendor.is_trusted && (
                    <span className="inline-flex items-center gap-1 border border-gold/40 px-2 py-0.5 text-[11px] uppercase tracking-[0.15em]">
                      <ShieldCheck className="h-3 w-3 text-gold" /> Trusted partner
                    </span>
                  )}
                  {!!vendor.rating && (
                    <span className="inline-flex items-center gap-1 text-sm">
                      <Star className="h-3.5 w-3.5 fill-gold text-gold" /> {vendor.rating}
                    </span>
                  )}
                </div>
                {vendor.description && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{vendor.description}</p>}
              </div>
              <div className="grid gap-3 text-sm md:w-80">
                <div className="flex items-start gap-3">
                  <Truck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <span className="text-muted-foreground">
                    {!shippingCharged
                      ? "Free shipping on every order"
                      : `Shipping ${formatINR(vendor.shipping_flat_rate)}${vendor.free_shipping_threshold ? ` · free above ${formatINR(vendor.free_shipping_threshold)}` : ""}`}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <span className="text-muted-foreground">{vendor.return_policy || `${vendor.return_window_days}-day returns & exchanges`}</span>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <span className="text-muted-foreground">Quality-checked by AllBoutiqs before it ships</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <ProductListing
          products={products}
          loading={productsLoading}
          categories={categories}
          boutiques={boutiques}
          scopeCategoryId={null}
          hideBoutiques
          emptyText={`${vendor.name} hasn't listed any pieces yet.`}
        />
      </main>
      <Footer />
    </div>
  );
}
