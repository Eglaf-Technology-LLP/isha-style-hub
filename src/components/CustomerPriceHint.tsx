import { formatINR } from "@/lib/format";
import { gstBreakdown, useCategoryGstRules } from "@/lib/gst";
import { cn } from "@/lib/utils";

// Under a "Product Value (excl. GST)" box: the GST on it and the price the
// customer pays (Developer Corrections Part 7, 5.1).
export function CustomerPriceHint({
  value,
  categoryId,
  label = "Customer price (MRP incl. GST)",
  className,
}: {
  value: number | string;
  categoryId: string | null | undefined;
  label?: string;
  className?: string;
}) {
  const { ruleFor, loading } = useCategoryGstRules();
  const amount = Number(value);
  if (!categoryId) {
    return amount > 0 ? (
      <p className={cn("text-xs text-muted-foreground", className)}>Choose a category to see the GST and the customer price.</p>
    ) : null;
  }
  if (loading) return null;
  const rule = ruleFor(categoryId);
  const b = gstBreakdown(rule, amount);
  if (!b) return null;
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      + GST {b.rate}% ({formatINR(b.gst)}) = <span className="font-medium text-foreground">{label}: {formatINR(b.price)}</span>
      {!rule && <span className="block text-amber-700">No GST rate is set for this category yet - AllBoutiqs will add it.</span>}
    </p>
  );
}
