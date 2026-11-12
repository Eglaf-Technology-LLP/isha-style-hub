import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { mapDbVariant } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { ProductEditorForm, type VendorProductRow } from "@/components/product-editor/ProductEditorForm";
import { VENDOR_PRODUCT_COLUMNS } from "@/lib/vendorProduct";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";

// Admin adds a product (/admin/products/new) or edits one
// (/admin/products/:id) on its own page - they used to be pop-ups in
// Products and in Vendors > Manage Catalogue. ?vendor= picks the boutique
// for a new product; ?from=catalog goes back to Manage Catalogue.
export default function AdminProductEditor() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [product, setProduct] = useState<VendorProductRow | null>(null);
  const [productLoading, setProductLoading] = useState(!!id);

  const presetVendor = params.get("vendor");
  const fromCatalog = params.get("from") === "catalog";
  const backTo = fromCatalog
    ? `/admin?tab=vendors&sub=catalog${(product?.vendor_id ?? presetVendor) ? `&vendor=${product?.vendor_id ?? presetVendor}` : ""}`
    : "/admin?tab=products";

  // Only admins; everyone else goes to /admin (sign in / access denied).
  useEffect(() => {
    if (authLoading || adminLoading) return;
    if (!user || !isAdmin) navigate("/admin", { replace: true });
  }, [authLoading, adminLoading, user, isAdmin, navigate]);

  useEffect(() => {
    if (!id || !isAdmin) return;
    let cancelled = false;
    setProductLoading(true);
    supabase
      .from("products")
      .select(VENDOR_PRODUCT_COLUMNS)
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          toast.error(error ? "Couldn't load the product - please try again" : "That product doesn't exist");
          navigate("/admin?tab=products", { replace: true });
          return;
        }
        const row = data as unknown as VendorProductRow & { product_variants?: Parameters<typeof mapDbVariant>[0][] };
        setProduct({ ...row, variants: (row.product_variants || []).map(mapDbVariant) });
        setProductLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isAdmin, navigate]);

  if (authLoading || adminLoading || !isAdmin || productLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {fromCatalog ? "Manage Catalogue" : "Products"}
          </Link>
          <img src={logo} alt="AllBoutiqs" className="hidden h-8 sm:block" />
          {product ? (
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              {/* A new tab: staff see the product on its own. */}
              <Link to={`/product/${product.id}`} target="_blank" rel="noopener noreferrer">
                <Eye className="h-4 w-4" /> View
              </Link>
            </Button>
          ) : (
            <span className="w-16" />
          )}
        </div>
      </header>
      <main className="container mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-serif font-bold">{product ? "Edit product" : "Add product"}</h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">
          {product
            ? `${product.name} · ${product.approval_status.replace("_", " ")}`
            : "Add a product for one of the boutiques. Products added here skip the review queue."}
        </p>
        <ProductEditorForm
          mode="admin"
          vendorId={presetVendor}
          product={product}
          onSaved={() => navigate(backTo)}
          onCancel={() => navigate(backTo)}
        />
      </main>
    </div>
  );
}
