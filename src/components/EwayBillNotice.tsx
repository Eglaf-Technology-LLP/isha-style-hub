import { FileCheck2, FileClock, FileWarning } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { formatDate, formatDateTime } from "@/lib/dates";
import {
  addressText,
  EWAY_DOCUMENT_LABELS,
  EwayBillPreview,
  ewayEmailSubject,
  formatEwbNumber,
} from "@/lib/ewayBill";

// Inside a booking dialog: why this parcel waits for an e-way bill, and
// where it stands (to ask for / being made / ready). boutique names the part
// on a warehouse parcel that holds several.
export function EwayBillNotice({ preview, boutique }: { preview: EwayBillPreview; boutique?: string }) {
  const { bill } = preview;
  const over = `${boutique ? `${boutique}: invoice` : "This invoice"} comes to ${formatMoney(preview.value)}, over the ${formatMoney(preview.threshold)} limit`;

  if (!bill) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-1 text-amber-950">
        <p className="font-medium flex items-center gap-1.5">
          <FileWarning className="h-4 w-4" /> E-way bill needed
        </p>
        <p>
          {over}, so the goods need an e-way bill before the courier can be booked. It is made out to the courier you pick
          below.
        </p>
        <p className="text-xs">
          {preview.made_by === "boutique"
            ? "Confirming sends you the details by email - make the e-way bill on the portal and email us the number."
            : "Confirming asks AllBoutiqs to make it. You'll be told when it's ready, then book from here."}
        </p>
      </div>
    );
  }

  if (bill.status === "active") {
    return (
      <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm space-y-1 text-green-950">
        <p className="font-medium flex items-center gap-1.5">
          <FileCheck2 className="h-4 w-4" /> E-way bill {formatEwbNumber(bill.ewb_number)} is ready
          {boutique && <span className="font-normal">({boutique})</span>}
        </p>
        <p>
          It is made out to <span className="font-medium">{bill.courier_name ?? "the courier"}</span>, so that's the courier
          booked{bill.valid_until ? `. Valid until ${formatDateTime(bill.valid_until)}` : ""}.
        </p>
      </div>
    );
  }

  if (preview.made_by === "boutique") {
    const rows: [string, string][] = [
      ["Document", `${EWAY_DOCUMENT_LABELS[bill.document_type]} ${bill.document_number}, ${formatDate(bill.document_date)}`],
      ["Value", formatMoney(bill.value)],
      ["Dispatch from", `${bill.from_name}, ${addressText(bill.from_address)}`],
      ["Ship to", `${bill.to_name}, ${addressText(bill.to_address)}`],
      [
        "Transporter",
        `${bill.courier_name ?? "-"}${preview.transporter_id ? `, ID ${preview.transporter_id}` : " (ID: ask AllBoutiqs)"} - mode Road, no vehicle number`,
      ],
    ];
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-2 text-amber-950">
        <p className="font-medium flex items-center gap-1.5">
          <FileClock className="h-4 w-4" /> Make the e-way bill{boutique ? ` (${boutique})` : ""}
        </p>
        <p>
          Make it on{" "}
          <a href="https://ewaybillgst.gov.in" target="_blank" rel="noreferrer" className="underline">
            ewaybillgst.gov.in
          </a>{" "}
          with these details (also in your email; the items and tax are on the invoice):
        </p>
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-amber-800">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs">
          Then email the 12-digit number and its PDF to <span className="font-medium">{preview.email}</span> with the
          subject <span className="font-medium">{ewayEmailSubject(preview.order_id, bill.document_number)}</span>. Once we
          enter it, the courier can be booked.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-1 text-amber-950">
      <p className="font-medium flex items-center gap-1.5">
        <FileClock className="h-4 w-4" /> E-way bill in progress{boutique ? ` (${boutique})` : ""}
      </p>
      <p>
        Asked for on {formatDateTime(bill.requested_at)}, made out to{" "}
        <span className="font-medium">{bill.courier_name ?? "the courier chosen"}</span>. AllBoutiqs is making it - usually
        within 2 working hours. You'll be told when it's ready; then book from here.
      </p>
    </div>
  );
}
