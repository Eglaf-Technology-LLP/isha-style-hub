import { FileCheck2, FileClock, FileWarning } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { formatEwbNumber } from "@/lib/ewayBill";
import type { EwayBillRow } from "@/hooks/useEwayBills";

// Under Ship Now on an order over the e-way bill limit: what's holding the
// booking, if anything.
export function EwayBillStatusLine({ value, bill }: { value: number | undefined; bill: EwayBillRow | null }) {
  if (value == null && !bill) return null;
  if (bill?.status === "active") {
    return (
      <div className="text-[11px] text-green-700 flex items-center gap-1 max-w-[220px]">
        <FileCheck2 className="h-3 w-3 shrink-0" /> E-way bill {formatEwbNumber(bill.ewb_number)} ready - Ship Now with{" "}
        {bill.courier_name ?? "its courier"}
      </div>
    );
  }
  if (bill?.status === "pending") {
    return (
      <div className="text-[11px] text-amber-700 flex items-center gap-1 max-w-[220px]">
        <FileClock className="h-3 w-3 shrink-0" /> E-way bill in progress - Ship Now shows the details
      </div>
    );
  }
  return (
    <div className="text-[11px] text-amber-700 flex items-center gap-1 max-w-[220px]">
      <FileWarning className="h-3 w-3 shrink-0" /> Needs an e-way bill ({formatMoney(value)}) - Ship Now asks for it
    </div>
  );
}
