import { Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeInWords } from "@/lib/dates";
import { readSoldOutTerms, soldOutChargeLabel, type SoldOutTerms } from "@/lib/soldOutMadeToOrder";

const badge = "mr-1 inline-flex items-center gap-1 bg-gold/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-foreground";

// A cart / checkout line for a sold-out size the boutique makes to order.
export function MadeToOrderLineNote({ terms, className }: { terms: SoldOutTerms; className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      <span className={badge}>
        <Scissors className="h-3 w-3" /> Made to order
      </span>
      This size is sold out, so the boutique makes it for you · {soldOutChargeLabel(terms)} per piece · {terms.days} extra
      days · no Cash on Delivery
    </p>
  );
}

// An order line made after the order: a Made to Order listing, or a
// sold-out size taken as made to order (with its charge and extra days).
// forBoutique adds when to start: the customer can cancel in the first 24
// hours, so making starts after that.
export function MadeToOrderBadge({
  madeToOrder,
  soldOutTerms,
  orderedAt,
  forBoutique = false,
  className,
}: {
  madeToOrder: boolean | null | undefined;
  soldOutTerms?: unknown;
  orderedAt?: string | null;
  forBoutique?: boolean;
  className?: string;
}) {
  if (!madeToOrder) return null;
  const terms = readSoldOutTerms(soldOutTerms);
  const startAfter =
    forBoutique && orderedAt ? formatDateTimeInWords(new Date(new Date(orderedAt).getTime() + 24 * 60 * 60 * 1000)) : null;
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      <span className={badge}>
        <Scissors className="h-3 w-3" /> {forBoutique ? "Make this piece" : "Made to order"}
      </span>
      {terms
        ? `Size was sold out · ${soldOutChargeLabel(terms)} per piece · ${terms.days} extra days`
        : forBoutique
          ? "Made to order"
          : "Made for you after you order"}
      {startAfter && ` · the customer can cancel until ${startAfter} - start after that`}
    </p>
  );
}
