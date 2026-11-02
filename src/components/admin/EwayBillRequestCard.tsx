import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { formatDate, formatDateTime } from "@/lib/dates";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { addressText, EWAY_DOCUMENT_LABELS, EWAY_LEG_LABELS, EwayBillLeg, orderRefOf } from "@/lib/ewayBill";
import type { AdminEwayBill, CourierTransporter } from "@/hooks/useEwayBillsAdmin";
import { PromptDialog } from "@/components/warehouse/PromptDialog";
import { DeliveryChallanButton } from "@/components/DeliveryChallanButton";
import { EwayBillRecordDialog } from "./EwayBillRecordDialog";

type Address = Record<string, string | null | undefined> | null;

const pin = (a: unknown) => ((a as Address)?.pincode ?? "") as string;

// The portal's "Generate New" form, field by field, in its order.
function portalFields(bill: AdminEwayBill): [string, string][] {
  const inv = bill.invoice;
  const intra = inv?.supply_type !== "inter_state";
  const items = bill.lines.map(
    (l) =>
      `${l.description} | HSN ${l.hsn_code ?? "-"} | qty ${l.quantity} | taxable ${Number(l.taxable_value).toFixed(2)} | ` +
      (intra ? `CGST ${Number(l.gst_rate) / 2}% + SGST ${Number(l.gst_rate) / 2}%` : `IGST ${Number(l.gst_rate)}%`),
  );
  return [
    ["Transaction type", "Outward · Supply"],
    ["Document type", EWAY_DOCUMENT_LABELS[bill.document_type] ?? bill.document_type],
    ["Document no.", bill.document_number],
    ["Document date", formatDate(bill.document_date)],
    ["Bill from - name", inv?.seller_legal_name ?? inv?.seller_name ?? bill.vendorName],
    ["Bill from - GSTIN", inv?.seller_gstin ?? "-"],
    ["Bill from - state", inv?.seller_state ?? "-"],
    ["Dispatch from", `${bill.from_name}, ${addressText(bill.from_address as Address)}`],
    ["Dispatch from - PIN", pin(bill.from_address)],
    ["Bill to - name", inv?.billing_name ?? "-"],
    ["Bill to - GSTIN", "URP (unregistered)"],
    ["Bill to - state", inv?.billing_state ?? "-"],
    ["Ship to", `${bill.to_name}, ${addressText(bill.to_address as Address)}`],
    ["Ship to - PIN", pin(bill.to_address)],
    ...items.map((text, i) => [`Item ${i + 1}`, text] as [string, string]),
    ["Taxable amount", Number(inv?.taxable_value ?? 0).toFixed(2)],
    ...(intra
      ? ([
          ["CGST amount", Number(inv?.cgst_amount ?? 0).toFixed(2)],
          ["SGST amount", Number(inv?.sgst_amount ?? 0).toFixed(2)],
        ] as [string, string][])
      : ([["IGST amount", Number(inv?.igst_amount ?? 0).toFixed(2)]] as [string, string][])),
    ["Total invoice value", Number(bill.value).toFixed(2)],
    ["Transporter", bill.courier_name ?? "-"],
    ["Transporter ID", bill.transporterId ?? "not saved - add it in the Couriers tab"],
    ["Mode / vehicle", "Road · leave the vehicle number blank (the courier fills Part B)"],
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

// One request waiting for its number: what to type into the portal, and the
// actions on it.
export function EwayBillRequestCard({
  bill,
  madeBy,
  transporters,
  onChanged,
}: {
  bill: AdminEwayBill;
  madeBy: "allboutiqs" | "boutique";
  transporters: CourierTransporter[];
  onChanged: () => void;
}) {
  const fields = portalFields(bill);
  const hours = (Date.now() - new Date(bill.created_at).getTime()) / 3_600_000;

  return (
    <div data-focus-id={bill.id} className="rounded-md border border-border p-3 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">
            Order {orderRefOf(bill.order_id)} · {EWAY_LEG_LABELS[bill.leg as EwayBillLeg]} · {formatMoney(bill.value)}
          </p>
          <p className="text-xs text-muted-foreground">
            Asked for {formatDateTime(bill.created_at)} · courier {bill.courier_name ?? "-"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={hours > 2 ? "destructive" : "secondary"}>Waiting {waitingFor(bill.created_at)}</Badge>
          {madeBy === "boutique" && <Badge variant="outline">Boutique makes it</Badge>}
        </div>
      </div>

      <dl className="grid sm:grid-cols-[200px,1fr] gap-x-3 gap-y-1 text-xs">
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

      <div className="flex flex-wrap gap-2 items-center">
        <EwayBillRecordDialog bill={bill} transporters={transporters} onSaved={onChanged} />
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1"
          onClick={() => copy(fields.map(([l, v]) => `${l}: ${v}`).join("\n"), "All details copied")}
        >
          <Copy className="h-3 w-3" /> Copy all
        </Button>
        <a
          href="https://ewaybillgst.gov.in"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary inline-flex items-center gap-0.5 hover:underline"
        >
          Open the portal <ExternalLink className="h-3 w-3" />
        </a>
        {bill.challan_id && <DeliveryChallanButton challanId={bill.challan_id} />}
        {madeBy === "boutique" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={async () => {
              const { data, errorMessage } = await invokeEdgeFunction<{ sent_to: string }>("eway-bill-actions", {
                action: "resend_request",
                eway_bill_id: bill.id,
              });
              if (errorMessage) toast.error(errorMessage);
              else toast.success(`Details sent to ${data?.sent_to}`);
            }}
          >
            Email the boutique again
          </Button>
        )}
        <PromptDialog
          trigger={(open) => (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={open}>
              Cancel request
            </Button>
          )}
          title="Cancel this e-way bill request?"
          description="Only when it won't be needed (e.g. the order changed). If an e-way bill was already made on the portal, cancel it there too. The next booking attempt asks for a new one."
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
    </div>
  );
}
