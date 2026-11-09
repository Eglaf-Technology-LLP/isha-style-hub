import { formatINR } from "@/lib/format";
import { gstBreakdown, useCategoryGstRules } from "@/lib/gst";
import { useCourierCharge } from "@/hooks/useCourierCharge";
import { cn } from "@/lib/utils";

// Under a "Product Value (excl. GST)" box: the GST on it and the price the
// customer pays (Developer Corrections Part 7, 5.1), and the courier &
// logistics charge per piece the boutique pays out of its payout (client,
// 10 Nov 2026) - it is not added to the customer's price.
export function CustomerPriceHint({
  value,
  categoryId,
  label = "Customer price (MRP incl. GST)",
  showCourierNote = true,
  className,
}: {
  value: number | string;
  categoryId: string | null | undefined;
  label?: string;
  // The courier & logistics charge line (not under a crossed-out MRP).
  showCourierNote?: boolean;
  className?: string;
}) {
  const { ruleFor, loading } = useCategoryGstRules();
  const courier = useCourierCharge();
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
      {showCourierNote && courier && courier.perPiece > 0 && (
        <span className="block">
          Courier &amp; logistics: {formatINR(courier.perPiece)} + {courier.gstPct}% GST (
          {formatINR(Math.round(courier.perPiece * (100 + courier.gstPct)) / 100)}) per piece is taken off your payout -
          customers get free delivery.
        </span>
      )}
    </p>
  );
}
