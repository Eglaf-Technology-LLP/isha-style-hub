import { useState } from "react";
import { toast } from "sonner";
import { FileCheck2, FileClock, FileWarning, Loader2, Printer } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { EWAY_TURNAROUND, formatEwbNumber, openEwayBillPdf } from "@/lib/ewayBill";
import type { EwayBillRow } from "@/hooks/useEwayBills";

// The e-way bill's number and, once AllBoutiqs has attached it, the
// printable copy (opens in a new tab to print or save).
export function EwayBillPdfLink({ bill }: { bill: Pick<EwayBillRow, "ewb_number" | "pdf_path"> }) {
  const [opening, setOpening] = useState(false);
  return (
    <div className="text-[11px] flex items-center gap-1.5 flex-wrap">
      <span className="font-mono text-muted-foreground">E-way bill {formatEwbNumber(bill.ewb_number)}</span>
      {bill.pdf_path ? (
        <button
          type="button"
          className="text-primary inline-flex items-center gap-0.5 hover:underline disabled:opacity-50"
          disabled={opening}
          onClick={async () => {
            setOpening(true);
            const error = await openEwayBillPdf(bill.pdf_path!);
            setOpening(false);
            if (error) toast.error(error);
          }}
        >
          {opening ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />} Print / download
        </button>
      ) : (
        <span className="text-muted-foreground">(copy coming shortly)</span>
      )}
    </div>
  );
}

// Under Ship Now on an order over the e-way bill limit: where its e-way bill
// stands. AllBoutiqs makes it; the boutique prints it and ships.
export function EwayBillStatusLine({ value, bill }: { value: number | undefined; bill: EwayBillRow | null }) {
  if (value == null && !bill) return null;
  if (bill?.status === "active") {
    return (
      <div className="space-y-0.5 max-w-[240px]">
        <div className="text-[11px] text-green-700 flex items-center gap-1">
          <FileCheck2 className="h-3 w-3 shrink-0" /> E-way bill ready - print it, put it in the parcel, Ship Now
        </div>
        <EwayBillPdfLink bill={bill} />
      </div>
    );
  }
  if (bill?.status === "pending") {
    return (
      <div className="text-[11px] text-amber-700 flex items-start gap-1 max-w-[240px]">
        <FileClock className="h-3 w-3 shrink-0 mt-0.5" /> AllBoutiqs is making the e-way bill (usually {EWAY_TURNAROUND}). Pack
        the order - we'll email you when you can ship.
      </div>
    );
  }
  return (
    <div className="text-[11px] text-amber-700 flex items-start gap-1 max-w-[240px]">
      <FileWarning className="h-3 w-3 shrink-0 mt-0.5" /> Needs an e-way bill ({formatMoney(value)}) - AllBoutiqs is preparing
      it, usually within {EWAY_TURNAROUND}
    </div>
  );
}
