import { Link } from "react-router-dom";
import { LEGAL_PATHS } from "@/lib/legal";
import { CUSTOMER_CANCEL_WINDOW_HOURS } from "@/lib/orderCancel";
import { cn } from "@/lib/utils";

// Above the Pay / Place order button (client corrections Part 2, A23.1): what
// the customer agrees to, with links, and the cancellation rule - no
// cancellation fee (decided 24 Nov 2026; it used to say 5%, which was never
// charged - see partCancelRefund in src/lib/orderCancel.ts). The links
// open in a new tab so the checkout isn't lost. `compact` (the phone bar)
// leaves out the cancellation rule; the full note sits above the button in
// the order summary.
export function CheckoutTermsNote({ compact = false, className }: { compact?: boolean; className?: string }) {
  const link = (to: string, label: string) => (
    <Link to={to} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
      {label}
    </Link>
  );
  return (
    <div className={cn("space-y-1.5 text-muted-foreground", compact ? "text-[10px] leading-snug" : "text-xs leading-relaxed", className)}>
      <p>
        By placing this order you agree to the {link(LEGAL_PATHS.terms, "Terms & Conditions")},{" "}
        {link(LEGAL_PATHS.returns, "Return & Refund Policy")} and {link(LEGAL_PATHS.privacy, "Privacy Policy")}.
      </p>
      {!compact && (
        <p>
          You can cancel within {CUSTOMER_CANCEL_WINDOW_HOURS} hours of placing the order, until the courier picks it
          up - no cancellation fee, full refund. If the boutique or AllBoutiqs cancels it, you get a full refund too.
        </p>
      )}
    </div>
  );
}
