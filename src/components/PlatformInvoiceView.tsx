import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { amountInWords } from "@/lib/amountInWords";
import { COMPANY } from "@/lib/company";
import { formatDate } from "@/lib/dates";
import { printElement } from "@/lib/printElement";

type Address = {
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
} | null;

export interface PlatformInvoice {
  invoice_number: string;
  issued_at: string;
  billing_name: string | null;
  billing_address: Address;
  billing_state: string | null;
  place_of_supply_code: string | null;
  supply_type: "intra_state" | "inter_state";
  sac_code: string;
  gst_rate: number;
  shipping_amount: number;
  cod_amount: number;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total: number;
}

const money = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const addressLines = (a: Address) =>
  a
    ? ([a.address_line1, a.address_line2, [a.city, a.state, a.pincode].filter(Boolean).join(", ")].filter(
        Boolean,
      ) as string[])
    : [];

// AllBoutiqs' own tax invoice to the customer for the Cash on Delivery fee
// (3% + GST) and any shipping charge that isn't the boutique's - issued with
// the boutique's goods invoice (platform_invoices, migration
// 20261110150000). Amounts include GST.
export function PlatformInvoiceView({ invoice }: { invoice: PlatformInvoice }) {
  const intra = invoice.supply_type === "intra_state";
  const rate = Number(invoice.gst_rate);
  const rows: [string, number][] = [
    ["Shipping charges", Number(invoice.shipping_amount)],
    ["Cash on Delivery fee", Number(invoice.cod_amount)],
  ];
  const lines = rows.filter(([, amount]) => amount > 0);
  const elementId = `platform-invoice-${invoice.invoice_number.replace(/\W+/g, "-")}`;

  return (
    <div id={elementId} className="space-y-4 text-xs text-foreground">
      <div className="flex items-start justify-between gap-4 border-b-2 border-foreground pb-3">
        <div>
          <p className="text-lg font-bold tracking-wide">TAX INVOICE</p>
          <p className="text-muted-foreground">AllBoutiqs services · Original for recipient</p>
        </div>
        <div className="text-right space-y-0.5">
          <p>
            <span className="text-muted-foreground">Invoice No: </span>
            <span className="font-mono font-semibold">{invoice.invoice_number}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Invoice Date: </span>
            {formatDate(new Date(invoice.issued_at))}
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Supplier</p>
          <p className="text-sm font-semibold">{COMPANY.legalName}</p>
          <p>{COMPANY.officeAddress}</p>
          <p>State: {COMPANY.state} (24)</p>
          <p>
            GSTIN: <span className="font-mono">{COMPANY.gstin}</span>
          </p>
          <p>CIN: {COMPANY.cin}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Bill to</p>
          <p className="text-sm font-semibold">{invoice.billing_name}</p>
          {addressLines(invoice.billing_address).map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p>
            Place of supply: {invoice.billing_state ?? "—"}
            {invoice.place_of_supply_code && ` (${invoice.place_of_supply_code})`}
          </p>
          <p>Tax payable on reverse charge: No</p>
        </div>
      </div>

      <div className="invoice-scroll overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-y border-foreground text-left">
              <th className="py-1.5 pr-2">#</th>
              <th className="py-1.5 pr-2">Description</th>
              <th className="py-1.5 pr-2">SAC</th>
              <th className="py-1.5 text-right">Amount (incl. GST)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(([label, amount], i) => (
              <tr key={label} className="border-b border-border">
                <td className="py-1.5 pr-2">{i + 1}</td>
                <td className="py-1.5 pr-2">{label}</td>
                <td className="py-1.5 pr-2 font-mono">{invoice.sac_code}</td>
                <td className="py-1.5 text-right">{money(amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <p className="sm:max-w-[55%]">
          <span className="text-muted-foreground">Amount in words: </span>
          {amountInWords(Number(invoice.total))}
        </p>
        <div className="space-y-1 sm:min-w-[240px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Taxable value</span>
            <span>₹{money(invoice.taxable_value)}</span>
          </div>
          {intra ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">CGST {rate / 2}%</span>
                <span>₹{money(invoice.cgst_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SGST {rate / 2}%</span>
                <span>₹{money(invoice.sgst_amount)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span className="text-muted-foreground">IGST {rate}%</span>
              <span>₹{money(invoice.igst_amount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-foreground pt-1 text-sm font-bold">
            <span>Total (incl. GST)</span>
            <span>₹{money(invoice.total)}</span>
          </div>
        </div>
      </div>

      <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">
        This is a computer-generated invoice and does not need a signature.
      </p>

      <Button
        onClick={() => printElement(document.getElementById(elementId), `Invoice ${invoice.invoice_number}`)}
        className="w-full gap-2 print:hidden"
      >
        <Printer className="h-4 w-4" /> Print / Save as PDF
      </Button>
    </div>
  );
}
