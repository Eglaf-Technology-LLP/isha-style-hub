import { EwayBillPdfLink } from "@/components/vendor/EwayBillStatusLine";
import { ewayLegLabel } from "@/lib/ewayBill";
import { cn } from "@/lib/utils";

interface BillLike {
  id: string;
  leg: string;
  status?: string;
  ewb_number: string | null;
  pdf_path: string | null;
}

// The e-way bill numbers an admin has saved on an order part (E-way bills ->
// Save number), each with the movement it covers and its printable copy.
// Nothing while none is saved yet.
export function EwayBillNumbers({
  bills,
  showLeg = true,
  className,
}: {
  bills: BillLike[];
  showLeg?: boolean;
  className?: string;
}) {
  const made = bills.filter((b) => b.ewb_number && (b.status ?? "active") === "active");
  if (made.length === 0) return null;
  return (
    <div className={cn("space-y-0.5", className)}>
      {made.map((b) => (
        <EwayBillPdfLink key={b.id} bill={b} note={showLeg ? ewayLegLabel(b.leg) : undefined} />
      ))}
    </div>
  );
}
