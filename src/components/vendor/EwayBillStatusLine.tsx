import { useState } from "react";
import { toast } from "sonner";
import { FileCheck2, FileClock, FileWarning, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
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
// stands. Once the order is packed the boutique presses "Get e-way bill
// ready" - AllBoutiqs is told (admins and super admins by email) and makes
// it; the boutique prints it and ships. Not asked for when the order is
// placed (client corrections Part 2, A16.1).
export function EwayBillStatusLine({
  value,
  bill,
  vendorOrderId,
  orderStatus,
  onRequested,
}: {
  value: number | undefined;
  bill: EwayBillRow | null;
  vendorOrderId: string;
  orderStatus: string;
  onRequested: () => void;
}) {
  const [requesting, setRequesting] = useState(false);
  if (value == null && !bill) return null;

  const request = async () => {
    setRequesting(true);
    const { errorMessage } = await invokeEdgeFunction("eway-bill-actions", { action: "request", vendor_order_id: vendorOrderId });
    setRequesting(false);
    if (errorMessage) return toast.error(errorMessage);
    toast.success(`AllBoutiqs has been asked for the e-way bill - usually ready within ${EWAY_TURNAROUND}.`);
    onRequested();
  };
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
        <FileClock className="h-3 w-3 shrink-0 mt-0.5" /> AllBoutiqs is making the e-way bill (usually {EWAY_TURNAROUND}) -
        we'll tell you when you can ship.
      </div>
    );
  }
  return (
    <div className="space-y-1 max-w-[240px]">
      <div className="text-[11px] text-amber-700 flex items-start gap-1">
        <FileWarning className="h-3 w-3 shrink-0 mt-0.5" />
        {orderStatus === "pending"
          ? `Needs an e-way bill (${formatMoney(value)}) - accept the order; once it's packed, ask for it here.`
          : `Needs an e-way bill (${formatMoney(value)}) - press this once the order is packed.`}
      </div>
      {orderStatus !== "pending" && (
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={requesting} onClick={request}>
          {requesting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Get e-way bill ready
        </Button>
      )}
    </div>
  );
}
