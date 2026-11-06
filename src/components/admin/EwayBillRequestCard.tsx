import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { formatDate, formatDateTime } from "@/lib/dates";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { addressText, EWAY_DOCUMENT_LABELS, EWAY_LEG_LABELS, EwayBillLeg, orderRefOf } from "@/lib/ewayBill";
import type { BulkSettings } from "@/lib/ewayBillJson";
import type { AdminEwayBill } from "@/hooks/useEwayBillsAdmin";
import { PromptDialog } from "@/components/warehouse/PromptDialog";
import { DeliveryChallanButton } from "@/components/DeliveryChallanButton";
import { EwayBillRecordDialog } from "./EwayBillRecordDialog";

type Address = Record<string, string | null | undefined> | null;
type StoredItem = { description: string; hsn_code: string | null; quantity: number; taxable_value: number; gst_rate: number };

const pin = (a: unknown) => ((a as Address)?.pincode ?? "") as string;

const SUB_SUPPLY: Record<number, string> = { 1: "Supply", 7: "Sales Return", 8: "Others" };

// The portal's "Generate New" form, field by field - for making one by hand
// when the bulk upload isn't used.
function portalFields(bill: AdminEwayBill, settings: BulkSettings): [string, string][] {
  const inv = bill.invoice;
  const intra = inv?.supply_type !== "inter_state";
  const outward = bill.supply_type !== "I";
  const items = ((bill.items as unknown as StoredItem[] | null) ?? bill.lines).map(
    (l) =>
      `${l.description} | HSN ${l.hsn_code ?? "-"} | qty ${l.quantity} | taxable ${Number(l.taxable_value).toFixed(2)} | ` +
      (intra ? `CGST ${Number(l.gst_rate) / 2}% + SGST ${Number(l.gst_rate) / 2}%` : `IGST ${Number(l.gst_rate)}%`),
  );
  const boutique = `${inv?.seller_legal_name ?? inv?.seller_name ?? bill.vendorName}, GSTIN ${inv?.seller_gstin ?? "-"}`;
  const customer = `${inv?.billing_name ?? "-"} (URP - unregistered), ${inv?.billing_state ?? "-"}`;
  return [
    [
      "Transaction",
      `${outward ? "Outward" : "Inward"} · ${SUB_SUPPLY[bill.sub_supply_type] ?? bill.sub_supply_type}${bill.sub_supply_desc ? ` (${bill.sub_supply_desc})` : ""}`,
    ],
    ["Document", `${EWAY_DOCUMENT_LABELS[bill.document_type] ?? bill.document_type} ${bill.document_number}, ${formatDate(bill.document_date)}`],
    ["Bill from", outward ? boutique : customer],
    ["Dispatch from", `${bill.from_name}, ${addressText(bill.from_address as Address)}`],
    ["Dispatch from - PIN", pin(bill.from_address)],
    ["Bill to", outward ? customer : boutique],
    ["Ship to", `${bill.to_name}, ${addressText(bill.to_address as Address)}`],
    ["Ship to - PIN", pin(bill.to_address)],
    ...items.map((text, i) => [`Item ${i + 1}`, text] as [string, string]),
    ["Taxable amount", Number(bill.taxable_value ?? inv?.taxable_value ?? 0).toFixed(2)],
    ...(intra
      ? ([
          ["CGST amount", Number(bill.cgst_amount ?? inv?.cgst_amount ?? 0).toFixed(2)],
          ["SGST amount", Number(bill.sgst_amount ?? inv?.sgst_amount ?? 0).toFixed(2)],
        ] as [string, string][])
      : ([["IGST amount", Number(bill.igst_amount ?? inv?.igst_amount ?? 0).toFixed(2)]] as [string, string][])),
    ["Total value", Number(bill.value).toFixed(2)],
    ["Transporter", `${settings.transporterName}${settings.transporterId ? `, ID ${settings.transporterId}` : " (set the ID in Settings)"}`],
    ["Part B", "Leave blank - mode Road, no vehicle number"],
  ];
}

const copy = (text: string, what = "Copied") => {
  navigator.clipboard.writeText(text).then(
    () => toast.success(what),
    () => toast.error("Couldn't copy - select the text instead"),
  );
};

function waitingFor(iso: string) {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}

// One request waiting for its number.
export function EwayBillRequestCard({
  bill,
  settings,
  selected,
  onSelect,
  onChanged,
}: {
  bill: AdminEwayBill;
  settings: BulkSettings;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onChanged: () => void;
}) {
  const [showFields, setShowFields] = useState(false);
  const fields = portalFields(bill, settings);
  const hours = (Date.now() - new Date(bill.created_at).getTime()) / 3_600_000;

  return (
    <div data-focus-id={bill.id} className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <label className="flex items-start gap-2 cursor-pointer">
          <Checkbox className="mt-0.5" checked={selected} onCheckedChange={(v) => onSelect(v === true)} />
          <span>
            <span className="text-sm font-medium block">
              Order {orderRefOf(bill.order_id)} · {EWAY_LEG_LABELS[bill.leg as EwayBillLeg] ?? bill.leg} · {formatMoney(bill.value)}
            </span>
            <span className="text-xs text-muted-foreground block">
              {EWAY_DOCUMENT_LABELS[bill.document_type]} <span className="font-mono">{bill.document_number}</span> · asked{" "}
              {formatDateTime(bill.created_at)}
              {bill.return_request_id ? " · return / exchange" : bill.send_back_id ? " · send-back" : ""}
            </span>
          </span>
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          {bill.exported_at && (
            <Badge variant="outline" title="Already in a JSON download - check the portal before uploading it again">
              In JSON {formatDateTime(bill.exported_at)}
            </Badge>
          )}
          <Badge variant={hours > 2 ? "destructive" : "secondary"}>Waiting {waitingFor(bill.created_at)}</Badge>
        </div>
      </div>

      {!bill.invoice && <p className="text-xs text-destructive">No invoice found - it can't go in the JSON.</p>}

      <div className="flex flex-wrap gap-2 items-center">
        <EwayBillRecordDialog bill={bill} onSaved={onChanged} />
        <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={() => setShowFields((s) => !s)}>
          {showFields ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Portal details
        </Button>
        {bill.challan_id && <DeliveryChallanButton challanId={bill.challan_id} />}
        <PromptDialog
          trigger={(open) => (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={open}>
              Cancel request
            </Button>
          )}
          title="Cancel this e-way bill request?"
          description="Only when it won't be needed (e.g. the order changed). If an e-way bill was already made on the portal, cancel it there too. A later booking asks for a new one if it's still needed."
          label="Reason"
          required
          confirmLabel="Cancel request"
          destructive
          onConfirm={async (reason) => {
            const { errorMessage } = await invokeEdgeFunction("eway-bill-actions", { action: "cancel", eway_bill_id: bill.id, reason });
            if (errorMessage) {
              toast.error(errorMessage);
              return false;
            }
            toast.success("Request cancelled");
            onChanged();
            return true;
          }}
        />
      </div>

      {showFields && (
        <div className="space-y-2">
          <dl className="grid sm:grid-cols-[180px,1fr] gap-x-3 gap-y-1 text-xs">
            {fields.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="flex items-start gap-1.5 min-w-0">
                  <span className="break-words">{value}</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-primary shrink-0 mt-0.5"
                    title={`Copy ${label}`}
                    onClick={() => copy(value, `${label} copied`)}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </dd>
              </div>
            ))}
          </dl>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => copy(fields.map(([l, v]) => `${l}: ${v}`).join("\n"), "All details copied")}
          >
            <Copy className="h-3 w-3" /> Copy all
          </Button>
        </div>
      )}
    </div>
  );
}
