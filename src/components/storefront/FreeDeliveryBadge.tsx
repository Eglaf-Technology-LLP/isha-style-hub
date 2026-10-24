import { Truck } from "lucide-react";
import { cn } from "@/lib/utils";

// The one "Free Delivery" label, used wherever delivery costs the customer
// nothing (Developer Corrections Part 7, 6.3): product page, bag, checkout,
// orders and returns.
export function FreeDeliveryBadge({ className, children = "Free Delivery" }: { className?: string; children?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700",
        className,
      )}
    >
      <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  );
}
