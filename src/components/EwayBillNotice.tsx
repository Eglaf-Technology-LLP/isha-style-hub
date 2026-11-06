import { FileCheck2, FileClock, FileWarning } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import { EWAY_TURNAROUND, EwayBillPreview, formatEwbNumber } from "@/lib/ewayBill";
import { EwayBillPdfLink } from "@/components/vendor/EwayBillStatusLine";

// Inside a booking dialog: why this parcel waits for an e-way bill and where
// it stands. AllBoutiqs makes it (it's the transporter on it), so any courier
// can be booked once it's in. boutique names the part on a warehouse parcel
// that holds several.
export function EwayBillNotice({ preview, boutique }: { preview: EwayBillPreview; boutique?: string }) {
  const { bill } = preview;
  const turnaround = preview.turnaround ?? EWAY_TURNAROUND;
  const over = `${boutique ? `${boutique}: goods` : "These goods"} come to ${formatMoney(preview.value)}, over the ${formatMoney(preview.threshold)} limit`;

  if (bill?.status === "active") {
    return (
      <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm space-y-1 text-green-950">
        <p className="font-medium flex items-center gap-1.5">
          <FileCheck2 className="h-4 w-4" /> E-way bill {formatEwbNumber(bill.ewb_number)} is ready
          {boutique && <span className="font-normal">({boutique})</span>}
        </p>
        <p>
          Print it and put it in the parcel with the {bill.document_type === "delivery_challan" ? "delivery challan" : "invoice"}. The
          number goes to the courier with the booking{bill.valid_until ? `; valid until ${formatDateTime(bill.valid_until)}` : ""}.
        </p>
        <EwayBillPdfLink bill={{ ewb_number: bill.ewb_number, pdf_path: bill.pdf_path }} />
      </div>
    );
  }

  if (bill?.status === "pending") {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-1 text-amber-950">
        <p className="font-medium flex items-center gap-1.5">
          <FileClock className="h-4 w-4" /> AllBoutiqs is making the e-way bill{boutique ? ` (${boutique})` : ""}
        </p>
        <p>
          {over}, so the courier can't be booked until its e-way bill is ready. Asked for on {formatDateTime(bill.requested_at)} -
          usually ready within {turnaround}. You'll get an email and a notification; then book from here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-1 text-amber-950">
      <p className="font-medium flex items-center gap-1.5">
        <FileWarning className="h-4 w-4" /> E-way bill needed{boutique ? ` (${boutique})` : ""}
      </p>
      <p>
        {over}, so the goods need an e-way bill before the courier can be booked. Confirming asks AllBoutiqs to make it -
        usually within {turnaround}.
      </p>
    </div>
  );
}
