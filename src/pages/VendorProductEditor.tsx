import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useVendor } from "@/hooks/useVendor";
import { mapDbVariant } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { VendorProductForm, type VendorProductRow } from "@/components/vendor/VendorProductDialog";
import { VENDOR_PRODUCT_COLUMNS, listingReviewNote } from "@/lib/vendorProduct";
import { VENDOR_RETURNABLE_SWITCH_ENABLED } from "@/lib/hiddenFeatures";

const BACK_TO = "/vendor?tab=products";

// A boutique adds a product (/vendor/products/new) or edits one
// (/vendor/products/:id) on its own page - it used to be a pop-up on the
// vendor dashboard. Same form as admins use in Vendors > Manage Catalogue.
export default function VendorProductEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { vendor, loading } = useVendor();
  const [product, setProduct] = useState<VendorProductRow | null>(null);
  const [productLoading, setProductLoading] = useState(!!id);

  // Same rules as the dashboard: sign up first, then wait for approval.
  useEffect(() => {
    if (loading) return;
    if (!vendor) navigate("/sell-with-us", { replace: true });
    else if (vendor.status !== "approved") navigate("/vendor/pending", { replace: true });
  }, [loading, vendor, navigate]);

  // Editing: only one of this boutique's own products.
  const vendorId = vendor?.id;
  useEffect(() => {
    if (!id || !vendorId) return;
    let cancelled = false;
    setProductLoading(true);
    supabase
      .from("products")
      .select(VENDOR_PRODUCT_COLUMNS)
      .eq("id", id)
      .eq("vendor_id", vendorId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          toast.error(error ? "Couldn't load the product - please try again" : "That product isn't in your catalogue");
          navigate(BACK_TO, { replace: true });
          return;
        }
        const row = data as unknown as VendorProductRow & { product_variants?: Parameters<typeof mapDbVariant>[0][] };
        setProduct({ ...row, variants: (row.product_variants || []).map(mapDbVariant) });
        setProductLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, vendorId, navigate]);

  if (loading || !vendor || vendor.status !== "approved" || productLoading) {
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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-3xl px-4 py-6">
        <Link to={BACK_TO} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Your products
        </Link>
        <h1 className="mt-3 text-2xl font-serif font-bold">{product ? "Edit product" : "Add product"}</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">{listingReviewNote(vendor.is_trusted)}</p>
        <VendorProductForm
          variant="page"
          vendorId={vendor.id}
          isTrusted={vendor.is_trusted}
          product={product}
          showReturnable={VENDOR_RETURNABLE_SWITCH_ENABLED}
          onSaved={() => navigate(BACK_TO)}
          onCancel={() => navigate(BACK_TO)}
        />
      </main>
      <Footer />
    </div>
  );
}
