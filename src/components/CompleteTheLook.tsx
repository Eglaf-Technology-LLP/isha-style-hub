import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Product, mapDbVariant } from "@/hooks/useProducts";
import { ProductCard } from "@/components/ProductCard";
import { Sparkles, Loader2 } from "lucide-react";

interface CompleteTheLookProps {
  productId: string;
}

export function CompleteTheLook({ productId }: CompleteTheLookProps) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          "complete-the-look",
          { body: { productId } },
        );
        if (error) throw error;
        const ids: string[] = data?.productIds || [];
        if (cancelled || ids.length === 0) {
          setProducts([]);
          return;
        }
        const { data: prods } = await supabase
          .from("products")
          .select("*, product_variants(*), vendor:vendors(name)")
          .in("id", ids);

        const typed: Product[] = (prods || []).map((p) => ({
          ...p,
          images: (p.images as string[]) || [],
          variants: (p.product_variants || []).map(mapDbVariant),
          specifications: (p.specifications as unknown as Product["specifications"]) || [],
        }));
        // preserve AI ordering
        typed.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

        if (!cancelled) {
          setProducts(typed);
          setNote(data?.stylistNote || "");
        }
      } catch (e) {
        console.error("CompleteTheLook failed", e);
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) {
    return (
      <section className="py-8">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-semibold">Complete the Look</h2>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Our AI stylist is curating picks for you…</span>
        </div>
      </section>
    );
  }

  if (products.length === 0) return null;

  return (
    <section className="py-8">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-semibold">Complete the Look</h2>
        <span className="text-xs uppercase tracking-wide text-muted-foreground ml-2 px-2 py-0.5 rounded-full bg-primary/10 text-primary">
          AI Stylist
        </span>
      </div>
      {note && (
        <p className="text-sm text-muted-foreground mb-6 italic max-w-2xl">
          "{note}"
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
