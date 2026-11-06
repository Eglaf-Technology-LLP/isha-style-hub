import type { Tables } from "@/integrations/supabase/types";
import { INDIAN_STATES, normalizeState } from "@/lib/indianStates";
import type { EwayBillLeg } from "@/lib/ewayBill";
import { isValidGstin } from "@/lib/vendorKyc";

// The e-way bill portal's bulk-generation file (ewaybillgst.gov.in >
// e-Waybill > Generate Bulk). Field names, types and the version string
// follow the portal's JSON format as produced by its bulk tool (cross-checked
// against India Compliance's generator, Nov 2026). AllBoutiqs is the
// transporter on every bill; Part B (vehicle) is left for the courier, so
// each bill is Part A only.

export const BULK_JSON_VERSION = "1.0.0621";

type EwayBillRow = Tables<"eway_bills">;
type InvoiceRow = Tables<"invoices">;
type InvoiceLineRow = Tables<"invoice_lines">;

export interface BulkBillInput {
  bill: EwayBillRow;
  invoice: InvoiceRow | null;
  lines: InvoiceLineRow[];
}

export interface BulkSettings {
  transporterId: string | null;
  transporterName: string;
  // The GSTIN / ID the portal account signs in with (defaults to the
  // transporter ID).
  portalUserId: string | null;
}

interface StoredItem {
  description: string;
  hsn_code: string | null;
  quantity: number;
  taxable_value: number;
  gst_rate: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  total?: number;
}

type Address = Record<string, unknown> | null;

const round2 = (n: number) => Math.round(n * 100) / 100;
const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const stateCodeOf = (state: unknown): number | null => {
  const name = normalizeState(String(state ?? ""));
  const found = INDIAN_STATES.find((s) => s.name === name);
  return found ? Number(found.gstCode) : null;
};

const pinOf = (a: Address): number | null => {
  const digits = String(a?.pincode ?? "").replace(/\D/g, "");
  return /^[1-9]\d{5}$/.test(digits) ? Number(digits) : null;
};

// "2026-11-06" -> "06/11/2026"
const portalDate = (isoDate: string) => {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

// 1 Regular, 2 Bill To - Ship To, 3 Bill From - Dispatch From: whether the
// goods leave from / go to someone other than the billed parties.
const TRANS_TYPE: Record<EwayBillLeg, number> = {
  boutique_to_customer: 1,
  boutique_to_warehouse: 2, // billed to the customer, shipped to the warehouse
  warehouse_to_customer: 3, // billed from the boutique, dispatched from the warehouse
  customer_to_boutique: 1,
  customer_to_warehouse: 2, // billed to the boutique, shipped to the warehouse
  warehouse_to_boutique: 3, // billed from the customer, dispatched from the warehouse
};


function billItems(input: BulkBillInput): StoredItem[] {
  const stored = input.bill.items as unknown as StoredItem[] | null;
  if (Array.isArray(stored) && stored.length) return stored;
  return input.lines.map((l) => ({
    description: l.description,
    hsn_code: l.hsn_code,
    quantity: Number(l.quantity),
    taxable_value: Number(l.taxable_value),
    gst_rate: Number(l.gst_rate),
    cgst_amount: Number(l.cgst_amount),
    sgst_amount: Number(l.sgst_amount),
    igst_amount: Number(l.igst_amount),
  }));
}

// One bill in the portal's format, or what's wrong with it.
function toPortalBill(input: BulkBillInput, settings: BulkSettings): { data: Record<string, unknown> } | { problems: string[] } {
  const { bill, invoice } = input;
  const problems: string[] = [];
  if (!invoice) return { problems: ["its invoice isn't issued"] };

  const outward = bill.supply_type !== "I";
  const boutique = {
    gstin: String(invoice.seller_gstin ?? "").toUpperCase(),
    name: str(invoice.seller_legal_name ?? invoice.seller_name, 100),
    state: Number(invoice.seller_state_code ?? String(invoice.seller_gstin ?? "").slice(0, 2)),
  };
  const customer = {
    gstin: "URP",
    name: str(invoice.billing_name, 100),
    state: Number(invoice.place_of_supply_code),
  };
  const billFrom = outward ? boutique : customer;
  const billTo = outward ? customer : boutique;
  if (!boutique.gstin) problems.push("the boutique has no GSTIN");
  else if (!isValidGstin(boutique.gstin)) {
    problems.push(`the boutique's GSTIN ${boutique.gstin} isn't a real GSTIN (checksum fails) - correct it on the boutique, the portal rejects it`);
  }
  if (!boutique.state || !customer.state) problems.push("a state code is missing on the invoice");

  const from = (bill.from_address ?? {}) as Address;
  const to = (bill.to_address ?? {}) as Address;
  const fromPin = pinOf(from);
  const toPin = pinOf(to);
  const fromState = stateCodeOf(from?.state);
  const toState = stateCodeOf(to?.state);
  if (!fromPin) problems.push(`dispatch-from PIN code missing (${bill.from_name})`);
  if (!toPin) problems.push(`ship-to PIN code missing (${bill.to_name})`);
  if (!fromState) problems.push(`dispatch-from state not recognised (${String(from?.state ?? "blank")})`);
  if (!toState) problems.push(`ship-to state not recognised (${String(to?.state ?? "blank")})`);

  const intra = invoice.supply_type === "intra_state";
  const items = billItems(input);
  if (!items.length) problems.push("no items");
  const itemList = items.map((it, idx) => {
    const hsn = String(it.hsn_code ?? "").replace(/\D/g, "");
    if (!hsn) problems.push(`no HSN code on "${it.description}"`);
    const rate = Number(it.gst_rate);
    const name = str(it.description, 100);
    return {
      itemNo: idx + 1,
      productName: name,
      productDesc: name,
      hsnCode: Number(hsn),
      quantity: round2(Number(it.quantity)),
      qtyUnit: "PCS",
      taxableAmount: round2(Number(it.taxable_value)),
      sgstRate: intra ? rate / 2 : 0,
      cgstRate: intra ? rate / 2 : 0,
      igstRate: intra ? 0 : rate,
      cessRate: 0,
      cessNonAdvol: 0,
    };
  });

  const sum = (k: keyof StoredItem) => round2(items.reduce((s, i) => s + Number(i[k] ?? 0), 0));
  const totalValue = bill.taxable_value != null ? Number(bill.taxable_value) : sum("taxable_value");
  const cgst = bill.cgst_amount != null ? Number(bill.cgst_amount) : sum("cgst_amount");
  const sgst = bill.sgst_amount != null ? Number(bill.sgst_amount) : sum("sgst_amount");
  const igst = bill.igst_amount != null ? Number(bill.igst_amount) : sum("igst_amount");
  const totInvValue = round2(Number(bill.value));
  const mainHsn = [...itemList].sort((a, b) => b.taxableAmount - a.taxableAmount)[0]?.hsnCode ?? 0;

  if (!settings.transporterId) problems.push("AllBoutiqs' transporter ID isn't set (Settings)");
  const userGstin = settings.portalUserId || settings.transporterId || "";

  if (problems.length) return { problems };
  return {
    data: {
      userGstin,
      supplyType: outward ? "O" : "I",
      subSupplyType: Number(bill.sub_supply_type),
      subSupplyDesc: bill.sub_supply_type === 8 ? str(bill.sub_supply_desc || "Others", 20) : "",
      docType: bill.document_type === "delivery_challan" ? "CHL" : "INV",
      docNo: bill.document_number,
      docDate: portalDate(bill.document_date),
      transType: TRANS_TYPE[bill.leg as EwayBillLeg] ?? 1,
      fromGstin: billFrom.gstin,
      fromTrdName: billFrom.name,
      fromAddr1: str(from?.address_line1, 120),
      fromAddr2: str(from?.address_line2, 120),
      fromPlace: str(from?.city, 50),
      fromPincode: fromPin,
      fromStateCode: billFrom.state,
      actualFromStateCode: fromState,
      toGstin: billTo.gstin,
      toTrdName: billTo.name,
      toAddr1: str(to?.address_line1, 120),
      toAddr2: str(to?.address_line2, 120),
      toPlace: str(to?.city, 50),
      toPincode: toPin,
      toStateCode: billTo.state,
      actualToStateCode: toState,
      totalValue: round2(totalValue),
      cgstValue: round2(cgst),
      sgstValue: round2(sgst),
      igstValue: round2(igst),
      cessValue: 0,
      TotNonAdvolVal: 0,
      // Rounding left over between the lines and the document total.
      OthValue: round2(totInvValue - (totalValue + cgst + sgst + igst)),
      totInvValue,
      transMode: 1,
      // 0: the portal works the distance out from the PIN codes.
      transDistance: 0,
      transporterName: str(settings.transporterName, 100),
      transporterId: settings.transporterId,
      transDocNo: "",
      transDocDate: "",
      vehicleNo: "",
      vehicleType: "R",
      mainHsnCode: mainHsn,
      itemList,
    },
  };
}

export interface BulkJsonResult {
  json: { version: string; billLists: Record<string, unknown>[] };
  included: string[]; // eway_bills ids in the file
  skipped: { id: string; problems: string[] }[];
}

export function buildBulkJson(inputs: BulkBillInput[], settings: BulkSettings): BulkJsonResult {
  const billLists: Record<string, unknown>[] = [];
  const included: string[] = [];
  const skipped: BulkJsonResult["skipped"] = [];
  for (const input of inputs) {
    const result = toPortalBill(input, settings);
    if ("data" in result) {
      billLists.push(result.data);
      included.push(input.bill.id);
    } else {
      skipped.push({ id: input.bill.id, problems: result.problems });
    }
  }
  return { json: { version: BULK_JSON_VERSION, billLists }, included, skipped };
}

export function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Lines pasted from the portal's bulk result (or any list): each document
// number found next to a 12-digit e-way bill number. Matches are by the
// requests' own document numbers, so stray text is ignored.
export function parsePastedNumbers(text: string, documentNumbers: string[]): Map<string, string> {
  const found = new Map<string, string>();
  const docs = [...documentNumbers].sort((a, b) => b.length - a.length); // longest first: AB0001/12 before AB0001/1
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const ewb = line.replace(/(\d{4})\s(\d{4})\s(\d{4})/g, "$1$2$3").match(/(?<!\d)\d{12}(?!\d)/)?.[0];
    if (!ewb) continue;
    const upper = line.toUpperCase();
    const doc = docs.find((d) => {
      const i = upper.indexOf(d.toUpperCase());
      if (i < 0) return false;
      // Not the start of a longer document number.
      const next = upper[i + d.length];
      return !next || !/[A-Z0-9/-]/.test(next);
    });
    if (doc && !found.has(doc)) found.set(doc, ewb);
  }
  return found;
}
