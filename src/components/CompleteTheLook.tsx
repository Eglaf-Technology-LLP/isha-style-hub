import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { mapDbVariant } from "@/hooks/useProducts";
import type { StoreProduct } from "@/hooks/useStorefront";
import { ProductCard } from "@/components/ProductCard";
import { Rail } from "@/components/storefront/Rail";
import { SectionHeading } from "@/components/storefront/SectionHeading";

interface CompleteTheLookProps {
  productId: string;
}

// AI stylist picks that go with this piece. Shown only once there are picks.
export function CompleteTheLook({ productId }: CompleteTheLookProps) {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setProducts([]);
      setNote("");
      try {
        const { data, error } = await supabase.functions.invoke(
          "complete-the-look",
          { body: { productId } },
        );
        if (error) throw error;
        const ids: string[] = data?.productIds || [];
        if (cancelled || ids.length === 0) return;
        const { data: prods } = await supabase
          .from("products")
          .select("*, product_variants(*), vendor:vendors(name, slug)")
          .in("id", ids);

        const typed: StoreProduct[] = (prods || []).map((p: any) => ({
          ...p,
          images: (p.images as string[]) || [],
          variants: (p.product_variants || []).map(mapDbVariant),
          specifications: (p.specifications as unknown as StoreProduct["specifications"]) || [],
        }));
        // preserve AI ordering
        typed.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

        if (!cancelled) {
          setProducts(typed);
          setNote(data?.stylistNote || "");
        }
      } catch (e) {
        console.error("CompleteTheLook failed", e);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (products.length === 0) return null;

  return (
    <section className="border-t border-border bg-ivory py-14 md:py-20">
      <div className="store-container">
        <Rail
          header={
            <SectionHeading
              eyebrow="Styled by our AI stylist"
              title="Complete"
              accent="the look"
              subtitle={note ? `“${note}”` : undefined}
              className="mb-0 md:mb-0"
            />
          }
        >
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </Rail>
      </div>
    </section>
  );
}
