import { formatDateWithDay } from "@/lib/dates";
import { returnWindowAdjective } from "@/hooks/useReturnWindowHours";
import { cn } from "@/lib/utils";

// Under each piece in the checkout's order summary, before paying: its rules
// (client corrections Part 2, A23.2) - "Made to Order · ships by …", "Not
// returnable" or "24-hour returns", and "COD not available".
// A sold-out size made to order already has its own note (made to order, no
// Cash on Delivery) just above, so only its ship-by date and returns are
// added here.
export interface LineRules {
  madeToOrder: boolean;
  soldOutMadeToOrder: boolean;
  // undefined while it's being worked out; null when it can't be.
  shipsBy: string | null | undefined;
  returnable: boolean;
  returnHours: number;
  codAvailable: boolean;
}

export function CheckoutLineRules({ rules, className }: { rules: LineRules; className?: string }) {
  const shipsBy = rules.shipsBy ? `ships by ${formatDateWithDay(rules.shipsBy)}` : null;
  const parts = [
    rules.soldOutMadeToOrder
      ? shipsBy && `${shipsBy[0].toUpperCase()}${shipsBy.slice(1)}`
      : rules.madeToOrder && ["Made to Order", shipsBy].filter(Boolean).join(" · "),
    rules.returnable ? `${returnWindowAdjective(rules.returnHours)} returns` : "Not returnable",
    !rules.codAvailable && !rules.soldOutMadeToOrder && "COD not available",
  ].filter((p): p is string => !!p);

  return <p className={cn("text-[11px] leading-snug text-muted-foreground", className)}>{parts.join(" · ")}</p>;
}
