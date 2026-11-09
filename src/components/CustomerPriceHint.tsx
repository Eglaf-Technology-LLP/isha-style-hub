import { formatINR } from "@/lib/format";
import { gstBreakdown, useCategoryGstRules } from "@/lib/gst";
import { useDeliveryCharge } from "@/hooks/useDeliveryCharge";
import { cn } from "@/lib/utils";

// Under a "Product Value (excl. GST)" box: the GST on it, AllBoutiqs' fixed
// courier charge and the price the customer pays (Developer Corrections
// Part 7, 5.1; courier from 10 Nov 2026). The courier is AllBoutiqs', not
// the boutique's: it is never part of the boutique's payout.
export function CustomerPriceHint({
  value,
  categoryId,
  label = "Customer price (MRP)",
  showCourierNote = true,
  className,
}: {
  value: number | string;
  categoryId: string | null | undefined;
  label?: string;
  showCourierNote?: boolean;
  className?: string;
}) {
  const { ruleFor, loading } = useCategoryGstRules();
  const courier = useDeliveryCharge();
  const amount = Number(value);
  if (!categoryId) {
    return amount > 0 ? (
      <p className={cn("text-xs text-muted-foreground", className)}>Choose a category to see the GST and the customer price.</p>
    ) : null;
  }
  if (loading) return null;
  const rule = ruleFor(categoryId);
  const b = gstBreakdown(rule, amount, courier);
  if (!b) return null;
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      + GST {b.rate}% ({formatINR(b.gst)}) + AllBoutiqs courier {formatINR(b.courier)} ={" "}
      <span className="font-medium text-foreground">{label}: {formatINR(b.price)}</span>
      {showCourierNote && (
        <span className="block">The courier charge is AllBoutiqs' - your payout is on the Product Value + GST.</span>
      )}
      {!rule && <span className="block text-amber-700">No GST rate is set for this category yet - AllBoutiqs will add it.</span>}
    </p>
  );
}
