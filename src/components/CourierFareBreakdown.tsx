import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { CourierOption } from "@/hooks/useShipments";

// What a courier's fare is made of, straight from Shiprocket's quote:
// "Freight ₹49.72 + Coverage ₹371.70 + Service fee ₹5". Coverage is
// Shiprocket's charge on the parcel's value; it is taken from the wallet with
// the freight, so the total here is what booking costs (24 Nov 2026: the
// quote used to leave it out and showed ₹54.72 for a ₹421.42 booking).
export function CourierFareBreakdown({ courier, className }: { courier: CourierOption; className?: string }) {
  const coverage = courier.coverageCharge ?? 0;
  const parts = [
    `Freight ${formatMoney(courier.freightCharge)}`,
    coverage > 0 && `Coverage ${formatMoney(coverage)}`,
    courier.serviceFee > 0 && `Service fee ${formatMoney(courier.serviceFee)}`,
    courier.codCharges > 0 && `COD charge ${formatMoney(courier.codCharges)}`,
  ].filter(Boolean);
  return (
    <div className={cn("text-xs text-muted-foreground", className)}>
      {parts.join(" + ")}
      {coverage > 0 && <span className="block">Coverage is Shiprocket's charge on the parcel's value</span>}
    </div>
  );
}
