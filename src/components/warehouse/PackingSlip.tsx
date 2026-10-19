import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Printer } from "lucide-react";
import logo from "@/assets/logo.png";
import { formatWeightKg } from "@/lib/weight";

export interface PackingSlipData {
  title: string; // "Packing slip", "Exchange replacement", ...
  orderId: string;
  packedAt: string;
  customer: { name: string; phone: string; address: Record<string, string> };
  warehouse: { name: string; address: Record<string, string> } | null;
  // Grouped by boutique; boutique names stay on the slip so the packer can
  // check each boutique's items against its invoice.
  groups: { boutique: string; items: { title: string; detail: string | null; sku: string | null; quantity: number }[] }[];
  codAmount: number | null; // null = prepaid
  parcel: { weightKg: number; lengthCm: number; breadthCm: number; heightCm: number };
  courier: { name: string | null; awb: string | null } | null;
  invoicesEnclosed: boolean;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const addressLines = (a: Record<string, string>) =>
  [a.address_line1, a.address_line2, [a.city, a.state].filter(Boolean).join(", ") + (a.pincode ? ` - ${a.pincode}` : "")]
    .filter((l) => l && l.trim())
    .map(esc)
    .join("<br>");

// A standalone, print-ready page (its own window) - printing from inside a
// dialog clips whatever is outside the dialog's scroll area.
export function packingSlipHtml(d: PackingSlipData, autoPrint = false): string {
  const logoUrl = new URL(logo, window.location.origin).href;
  const ref = d.orderId.slice(0, 8).toUpperCase();
  const rows = d.groups
    .map(
      (g) => `
      <tr class="group"><td colspan="3">${esc(g.boutique)}</td></tr>
      ${g.items
        .map(
          (i) => `<tr>
            <td><strong>${esc(i.title)}</strong>${i.detail ? `<div class="muted">${esc(i.detail)}</div>` : ""}</td>
            <td class="mono">${esc(i.sku ?? "")}</td>
            <td class="qty">${i.quantity}</td>
          </tr>`,
        )
        .join("")}`,
    )
    .join("");
  const totalUnits = d.groups.reduce((s, g) => s + g.items.reduce((t, i) => t + i.quantity, 0), 0);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>AllBoutiqs ${esc(d.title)} #${ref}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Jost", Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 28px; font-size: 13px; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #7a2e22; padding-bottom: 14px; }
  .head img { height: 56px; }
  .head h1 { font-family: "Playfair Display", Georgia, serif; color: #7a2e22; margin: 0; font-size: 22px; text-align: right; }
  .head .ref { text-align: right; color: #555; margin-top: 4px; }
  .cols { display: flex; gap: 24px; margin: 18px 0; }
  .box { flex: 1; border: 1px solid #e6ddd4; border-radius: 8px; padding: 12px 14px; }
  .box h2 { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #8a8a8a; margin: 0 0 6px; }
  .pay { font-size: 15px; font-weight: 700; }
  .pay.cod { color: #7a2e22; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #8a8a8a; border-bottom: 2px solid #1a1a1a; padding: 6px 4px; }
  td { padding: 8px 4px; border-bottom: 1px solid #f0ebe6; vertical-align: top; }
  tr.group td { background: #f9f6f2; font-weight: 700; color: #7a2e22; }
  .qty { text-align: center; width: 60px; font-weight: 700; }
  .mono { font-family: "Courier New", monospace; font-size: 12px; width: 160px; }
  .muted { color: #8a8a8a; font-size: 12px; }
  .foot { margin-top: 22px; border-top: 1px solid #e6ddd4; padding-top: 12px; color: #555; line-height: 1.6; }
  .check { margin-top: 14px; display: flex; gap: 28px; color: #555; }
  @page { margin: 12mm; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <div class="head">
    <img src="${esc(logoUrl)}" alt="AllBoutiqs">
    <div><h1>${esc(d.title)}</h1><div class="ref">Order #${ref} &middot; Packed ${esc(new Date(d.packedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }))}</div></div>
  </div>
  <div class="cols">
    <div class="box"><h2>Ship to</h2><strong>${esc(d.customer.name)}</strong><br>${addressLines(d.customer.address)}<br>Phone: ${esc(d.customer.phone)}</div>
    <div class="box"><h2>From</h2>${d.warehouse ? `<strong>${esc(d.warehouse.name)}</strong><br>${addressLines(d.warehouse.address)}` : "AllBoutiqs"}</div>
    <div class="box"><h2>Payment</h2>
      ${d.codAmount != null ? `<div class="pay cod">Cash on Delivery<br>Collect &#8377;${esc(Math.round(d.codAmount).toLocaleString("en-IN"))}</div>` : `<div class="pay">Prepaid<br><span class="muted">Nothing to collect</span></div>`}
      <div class="muted" style="margin-top:8px">Parcel: ${esc(formatWeightKg(d.parcel.weightKg))} &middot; ${d.parcel.lengthCm}&times;${d.parcel.breadthCm}&times;${d.parcel.heightCm} cm</div>
      ${d.courier?.awb ? `<div class="muted">${esc(d.courier.name ?? "Courier")} &middot; AWB ${esc(d.courier.awb)}</div>` : ""}
    </div>
  </div>
  <table>
    <thead><tr><th>Item</th><th>SKU</th><th class="qty">Qty</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="2" style="text-align:right;font-weight:700;border:none">Total pieces</td><td class="qty" style="border:none">${totalUnits}</td></tr></tfoot>
  </table>
  <div class="check"><span>&#9744; Items checked</span><span>&#9744; Packed in AllBoutiqs packaging</span>${d.invoicesEnclosed ? "<span>&#9744; Invoices enclosed</span>" : ""}</div>
  <div class="foot">
    Thank you for shopping with AllBoutiqs. Every piece in this parcel was checked at our quality-check centre before it was packed.<br>
    Something not right? Request a return or exchange from <strong>My Orders</strong> at allboutiqs.com.
  </div>
  ${autoPrint ? "<script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>" : ""}
</body></html>`;
}

export function printPackingSlip(d: PackingSlipData) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.open();
  // Prints itself once the logo has loaded.
  w.document.write(packingSlipHtml(d, true));
  w.document.close();
  return true;
}

// Preview + print. The preview is the same page shown in an iframe.
export function PackingSlipButton({ data, label = "Packing slip" }: { data: PackingSlipData; label?: string }) {
  const [open, setOpen] = useState(false);
  const html = useMemo(() => (open ? packingSlipHtml(data) : ""), [open, data]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setOpen(true)}>
        <FileText className="h-3 w-3" />
        {label}
      </Button>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3 pr-6">
            {data.title} - #{data.orderId.slice(0, 8).toUpperCase()}
            <Button size="sm" className="gap-1" onClick={() => printPackingSlip(data)}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </DialogTitle>
        </DialogHeader>
        <iframe title="Packing slip preview" srcDoc={html} className="w-full h-[70vh] border border-border rounded-md bg-white" />
      </DialogContent>
    </Dialog>
  );
}
