import type { WorkBook, WorkSheet } from "xlsx";
import type { ProductFormData, ProductSpecification, ProductVariant } from "@/hooks/useProducts";
import { titleCase } from "@/lib/text";
import { CUSTOMISATION_PCTS } from "@/lib/customisation";
import type { AiContentStatus } from "@/lib/aiContent";

// The AllBoutiqs product listing sheet (the client's Excel, "Product Listing
// - FINAL - v11") -> new products. One row per colour:
//   * Sr with a plain number (1, 2, 001) starts a new product;
//   * the same number with a letter (1A, 1B, 001C) is another colour of it
//     and must sit right below it.
// Sizes are columns holding the stock per size (Ready to Ship), or a Size
// range (Made to Order). Each colour x size becomes one variant.
// A column the product has a field for fills that field; every other column
// becomes a "Product details" row (label = the column's header). The sheet's
// own automatic columns (HSN, courier, GST, prices, status) are never read -
// the database works prices and tax out itself.
// Pure: no database calls, so the whole sheet is checked before anything is
// saved. A problem in any row stops that whole product (its main row and all
// its colour rows), so a product is never half uploaded.

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"];
const FREE_SIZE = "Free Size";

type Field =
  | "sr"
  | "listingType"
  | "sku"
  | "category"
  | "colour"
  | "sizeRange"
  | "productValue"
  | "makingDays"
  | "dispatchDays"
  | "returnable"
  | "cod"
  | "name"
  | "description"
  | "ai"
  | "confirm";

// Header -> field, after headerKey() (no "*", "▼" or "₹", lower case).
const FIELD_BY_HEADER: Record<string, Field> = {
  sr: "sr",
  "sr no": "sr",
  "sr no.": "sr",
  "listing type": "listingType",
  sku: "sku",
  category: "category",
  colour: "colour",
  color: "colour",
  "size range": "sizeRange",
  "product value": "productValue",
  "making days": "makingDays",
  "dispatch days": "dispatchDays",
  "return & refund": "returnable",
  "return and refund": "returnable",
  cod: "cod",
  "product name": "name",
  description: "description",
  "i confirm": "confirm",
  // The AI declaration column ("AI in photos"; any header starting with
  // "AI" counts, see aiHeader).
  "ai in photos": "ai",
  "ai in photo": "ai",
  ai: "ai",
};

const aiHeader = (key: string) => /^ai\b/.test(key);

const FIELD_LABEL: Record<Field, string> = {
  sr: "Sr",
  listingType: "Listing type",
  sku: "SKU",
  category: "Category",
  colour: "Colour",
  sizeRange: "Size range",
  productValue: "Product value ₹",
  makingDays: "Making days",
  dispatchDays: "Dispatch days",
  returnable: "Return & refund",
  cod: "COD",
  name: "Product name",
  description: "Description",
  ai: "AI in photos",
  confirm: "I confirm",
};

const REQUIRED_COLUMNS: Field[] = ["sr", "listingType", "sku", "category", "colour", "productValue", "description"];

const SIZE_BY_HEADER: Record<string, string> = {
  xs: "XS",
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
  xxl: "XXL",
  "3xl": "3XL",
  "4xl": "4XL",
  "5xl": "5XL",
  "6xl": "6XL",
  "free size": FREE_SIZE,
};

// Not product data, so never a product detail (details are shown to
// customers): the boutique's photo tick and folder name, its private note to
// AllBoutiqs, and the sheet's automatic working-out.
const IGNORED_HEADERS = new Set([
  "photos & video",
  "image / video folder name",
  "note to allboutiqs",
  "hsn",
  "courier",
  "before gst",
  "gst %",
  "customer",
  "shows on website as",
  "status",
]);

// Detail columns that only mean something for one listing type - the sheet
// greys them out ("— not needed") for the other, and anything typed there
// before the listing type was changed is left over, not meant.
const MADE_TO_ORDER_ONLY = new Set(["customisation", "customisation charge %", "customisation extra days"]);
const READY_TO_SHIP_ONLY = new Set(["when sold out", "extra when made to order", "extra days when made to order"]);
const ONLY_WHEN_CUSTOMISABLE = new Set(["customisation charge %", "customisation extra days"]);
const NOT_WHEN_SIZE_HIDDEN = new Set(["extra when made to order", "extra days when made to order"]);
// Saved on the product's customisation fields, not as product details.
const CUSTOMISATION_COLUMNS = new Set(["customisation", "customisation charge %", "customisation extra days"]);
// Saved as the product's "When a size sells out" set-up, not as product details.
const SOLD_OUT_COLUMNS = READY_TO_SHIP_ONLY;

const NOT_NEEDED_RE = /^[—–-]+\s*not needed$/i;
// "Other – write in Note": the real value is in the boutique's note, not here.
const OTHER_RE = /^other(\s*[–—-].*)?$/i;
const MAIN_SR_RE = /^\d+$/;
const COLOUR_SR_RE = /^(\d+)\s*-?\s*([A-Za-z]{1,2})$/;

export interface ListingRowError {
  rowNumber: number; // the Excel row number; 0 = the whole file
  sr: string;
  sku: string;
  message: string;
}

export interface ListingProduct {
  sr: string;
  sku: string;
  rowNumbers: number[];
  formData: ProductFormData;
  variants: ProductVariant[];
}

export interface ListingParseContext {
  categories: { id: string; name: string }[];
  // SKUs this boutique already uses (products and variants), lower case.
  existingSkus: Set<string>;
  vendorId: string;
  approvalStatus?: string;
}

export interface ListingParseResult {
  products: ListingProduct[];
  errors: ListingRowError[];
  rowsRead: number;
}

interface CellValue {
  raw: unknown;
  text: string; // trimmed; "" for an empty or "— not needed" cell
}

interface SheetLayout {
  ws: WorkSheet;
  headerRow: number;
  firstDataRow: number;
  lastRow: number;
  skipRows: Set<number>;
  fields: Partial<Record<Field, number>>;
  sizes: { col: number; size: string }[];
  details: { col: number; key: string; label: string }[];
}

interface SheetRow {
  rowNumber: number;
  field: (f: Field) => CellValue;
  sizes: { size: string; cell: CellValue }[];
  details: { key: string; label: string; cell: CellValue }[];
}

const EMPTY: CellValue = { raw: null, text: "" };

const headerKey = (text: string) =>
  text.replace(/[*▼₹]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const headerLabel = (text: string) => text.replace(/[*▼]/g, " ").replace(/\s+/g, " ").trim();
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
// For matching names: case, spacing and dash style don't matter.
const nameKey = (text: string) => oneLine(text).toLowerCase().replace(/[–—]/g, "-");
const skuKey = (text: string) => text.trim().toLowerCase();

function columnName(c: number): string {
  let s = "";
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function decodeAddress(address: string): { r: number; c: number } {
  const m = address.match(/^([A-Z]+)(\d+)$/);
  if (!m) return { r: 0, c: 0 };
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: c - 1 };
}

function sheetEnd(ws: WorkSheet): { lastRow: number; lastCol: number } {
  const ref = ws["!ref"];
  if (!ref) return { lastRow: -1, lastCol: -1 };
  const end = decodeAddress(ref.split(":")[1] ?? ref.split(":")[0]);
  return { lastRow: end.r, lastCol: end.c };
}

function readCell(ws: WorkSheet, r: number, c: number): CellValue {
  const cell = ws[`${columnName(c)}${r + 1}`];
  if (!cell || cell.v == null || cell.t === "e") return EMPTY;
  // Text cells as typed (keeps line breaks in a description); numbers as
  // Excel shows them.
  const text = (typeof cell.v === "string" ? cell.v : (cell.w ?? String(cell.v))).trim();
  if (!text || NOT_NEEDED_RE.test(text)) return EMPTY;
  return { raw: cell.v, text };
}

function findLayout(ws: WorkSheet): SheetLayout | null {
  const { lastRow, lastCol } = sheetEnd(ws);
  for (let r = 0; r <= Math.min(lastRow, 30); r++) {
    const headers: { col: number; text: string; key: string }[] = [];
    for (let c = 0; c <= lastCol; c++) {
      const text = readCell(ws, r, c).text;
      if (text) headers.push({ col: c, text, key: headerKey(text) });
    }
    const keys = new Set(headers.map((h) => h.key));
    if (!(keys.has("sku") && keys.has("category") && (keys.has("sr") || keys.has("listing type")))) continue;

    const layout: SheetLayout = {
      ws,
      headerRow: r,
      firstDataRow: r + 1,
      lastRow,
      skipRows: new Set(),
      fields: {},
      sizes: [],
      details: [],
    };
    for (const h of headers) {
      const field = FIELD_BY_HEADER[h.key] ?? (aiHeader(h.key) ? "ai" : undefined);
      if (field) {
        if (layout.fields[field] === undefined) layout.fields[field] = h.col;
      } else if (SIZE_BY_HEADER[h.key]) {
        layout.sizes.push({ col: h.col, size: SIZE_BY_HEADER[h.key] });
      } else if (!IGNORED_HEADERS.has(h.key)) {
        if (!layout.details.some((d) => d.key === h.key)) layout.details.push({ col: h.col, key: h.key, label: headerLabel(h.text) });
      }
    }

    // Products start below the gold "START YOUR PRODUCTS HERE" line; the
    // rows above it are AllBoutiqs' examples and the column help. Rows are
    // skipped by where they are, not by the "← EXAMPLE" mark, which comes
    // along when a boutique copies an example row to start its own.
    for (let rr = r + 1; rr <= lastRow; rr++) {
      const first = readCell(ws, rr, 0).text;
      if (/start your products here/i.test(first)) {
        layout.firstDataRow = rr + 1;
        return layout;
      }
    }
    // No banner (deleted): skip the help row under the header and any row
    // still marked as an example.
    const srCol = layout.fields.sr;
    if (srCol !== undefined && readCell(ws, r + 1, srCol).text.length > 12) layout.skipRows.add(r + 1);
    for (let rr = r + 1; rr <= lastRow; rr++) {
      for (let c = 0; c <= lastCol; c++) {
        if (/^←\s*example/i.test(readCell(ws, rr, c).text)) {
          layout.skipRows.add(rr);
          break;
        }
      }
    }
    return layout;
  }
  return null;
}

export function findListingSheet(workbook: WorkBook): { name: string; layout: SheetLayout } | null {
  for (const name of workbook.SheetNames) {
    const layout = findLayout(workbook.Sheets[name]);
    if (layout) return { name, layout };
  }
  return null;
}

export const isListingWorkbook = (workbook: WorkBook) => findListingSheet(workbook) !== null;

// The "Boutique code:" box at the top of the sheet - its value is in the
// next filled cell to the right (or after the colon in the same cell).
export function listingBoutiqueCode(workbook: WorkBook): string | null {
  const found = findListingSheet(workbook);
  if (!found) return null;
  const { ws, headerRow } = found.layout;
  const { lastCol } = sheetEnd(ws);
  for (let r = 0; r < headerRow; r++) {
    for (let c = 0; c <= lastCol; c++) {
      const text = readCell(ws, r, c).text;
      if (!/^boutique code\b/i.test(text)) continue;
      const inline = text.split(":").slice(1).join(":").trim();
      if (inline) return inline;
      for (let cc = c + 1; cc <= lastCol; cc++) {
        const next = readCell(ws, r, cc).text;
        if (!next) continue;
        return next.endsWith(":") ? null : next;
      }
      return null;
    }
  }
  return null;
}

interface CategoryDefaults {
  makingDays: number | null;
  dispatchDays: number | null;
  sizeRange: string | null;
}

// "Empty = default" in the sheet means the category's default, which the
// sheet keeps in its hidden Lists tab (a "Defaults" table: category, courier,
// dispatch days, making days, return, COD, pack contains, size range...).
// Read from the file itself so it always matches the template in use.
function readCategoryDefaults(workbook: WorkBook, listingSheet: string): Map<string, CategoryDefaults> {
  const defaults = new Map<string, CategoryDefaults>();
  const asDays = (cell: CellValue) => (typeof cell.raw === "number" && Number.isInteger(cell.raw) ? cell.raw : null);
  for (const name of workbook.SheetNames) {
    if (name === listingSheet) continue;
    const ws = workbook.Sheets[name];
    const { lastRow, lastCol } = sheetEnd(ws);
    for (let c = 0; c <= lastCol; c++) {
      if (readCell(ws, 0, c).text.toLowerCase() !== "defaults") continue;
      for (let r = 1; r <= lastRow; r++) {
        const category = readCell(ws, r, c).text;
        if (!category) break;
        defaults.set(nameKey(category), {
          dispatchDays: asDays(readCell(ws, r, c + 2)),
          makingDays: asDays(readCell(ws, r, c + 3)),
          sizeRange: readCell(ws, r, c + 7).text || null,
        });
      }
      return defaults;
    }
  }
  return defaults;
}

// "XS to XXL" -> XS, S, M, L, XL, XXL; "Free Size"; or a list "S, M, L".
export function expandSizeRange(text: string): string[] | null {
  const size = (s: string) => {
    const t = s.trim().toUpperCase().replace(/\s+/g, " ");
    if (t === "FREE SIZE") return FREE_SIZE;
    if (t === "2XL") return "XXL";
    return SIZE_ORDER.includes(t) ? t : null;
  };
  const t = oneLine(text);
  const range = t.match(/^(.+?)\s+to\s+(.+)$/i);
  if (range) {
    const from = SIZE_ORDER.indexOf(size(range[1]) ?? "");
    const to = SIZE_ORDER.indexOf(size(range[2]) ?? "");
    return from >= 0 && to >= from ? SIZE_ORDER.slice(from, to + 1) : null;
  }
  const parts = t.split(/[,/]/).map(size);
  if (parts.length === 0 || parts.some((p) => p === null)) return null;
  const unique = [...new Set(parts as string[])];
  return unique.includes(FREE_SIZE) && unique.length > 1 ? null : unique;
}

type Parsed<T> = { value: T | null } | { error: string };

function parseNumber(cell: CellValue): Parsed<number> {
  if (!cell.text) return { value: null };
  if (typeof cell.raw === "number") return { value: cell.raw };
  const cleaned = cell.text.replace(/^rs\.?/i, "").replace(/[₹,\s]/g, "");
  const n = Number(cleaned);
  return cleaned && Number.isFinite(n) ? { value: n } : { error: `"${cell.text}" is not a number` };
}

// The 4 AI options (client corrections 15 Nov 2026, 3.3.5), dash style and
// case aside.
function parseAi(cell: CellValue): Parsed<AiContentStatus> {
  if (!cell.text) return { value: null };
  const t = cell.text.toLowerCase().replace(/[–—-]/g, " ").replace(/\s+/g, " ").trim();
  if (/ai ?made|not allowed|fully ai/.test(t)) return { value: "fully_ai" };
  if (/^no ai|real photos only/.test(t)) return { value: "none" };
  if (/background|light|crop/.test(t)) return { value: "ai_enhanced" };
  if (/model/.test(t)) return { value: "ai_model" };
  return {
    error: `AI in photos "${oneLine(cell.text)}" is not one of the 4 options - pick it from the list`,
  };
}

const AI_MADE_ROW =
  `AI in photos is "AI-made product – not allowed" - AI-made products can't be listed on AllBoutiqs, so this product is not uploaded`;

function parseYesNo(cell: CellValue, label: string): Parsed<boolean> {
  if (!cell.text) return { value: null };
  if (/^(yes|y|true)$/i.test(cell.text)) return { value: true };
  if (/^(no|n|false)$/i.test(cell.text)) return { value: false };
  return { error: `${label} must be Yes or No (found "${oneLine(cell.text)}")` };
}

type ListingType = "mto" | "rts";

function parseListingType(cell: CellValue): Parsed<ListingType> {
  if (!cell.text) return { error: "Listing type is empty - pick Made to Order or Ready to Ship" };
  const t = cell.text.replace(/\s+/g, "").toLowerCase();
  if (t === "madetoorder" || t === "mto") return { value: "mto" };
  if (t === "readytoship" || t === "rts") return { value: "rts" };
  return { error: `Listing type "${oneLine(cell.text)}" must be Made to Order or Ready to Ship` };
}

function readRows(layout: SheetLayout): SheetRow[] {
  const { ws, fields, sizes, details } = layout;
  const rows: SheetRow[] = [];
  for (let r = layout.firstDataRow; r <= layout.lastRow; r++) {
    if (layout.skipRows.has(r)) continue;
    const fieldCells = new Map<Field, CellValue>();
    for (const [field, col] of Object.entries(fields) as [Field, number][]) fieldCells.set(field, readCell(ws, r, col));
    const row: SheetRow = {
      rowNumber: r + 1,
      field: (f) => fieldCells.get(f) ?? EMPTY,
      sizes: sizes.map((s) => ({ size: s.size, cell: readCell(ws, r, s.col) })),
      details: details.map((d) => ({ key: d.key, label: d.label, cell: readCell(ws, r, d.col) })),
    };
    const filled =
      [...fieldCells.values()].some((v) => v.text) ||
      row.sizes.some((s) => s.cell.text) ||
      row.details.some((d) => d.cell.text);
    if (filled) rows.push(row);
  }
  return rows;
}

const srOf = (row: SheetRow) => oneLine(row.field("sr").text);
const skuOf = (row: SheetRow) => oneLine(row.field("sku").text);
const isMainRow = (row: SheetRow) => MAIN_SR_RE.test(srOf(row));

export function parseListingWorkbook(workbook: WorkBook, ctx: ListingParseContext): ListingParseResult {
  const fileError = (message: string): ListingParseResult => ({
    products: [],
    errors: [{ rowNumber: 0, sr: "", sku: "", message }],
    rowsRead: 0,
  });

  const found = findListingSheet(workbook);
  if (!found) return fileError("This is not the AllBoutiqs product listing sheet - no header row with Sr, SKU and Category was found.");
  const { layout } = found;
  const missing = REQUIRED_COLUMNS.filter((f) => layout.fields[f] === undefined);
  if (missing.length) {
    return fileError(`These columns are missing from the sheet: ${missing.map((f) => FIELD_LABEL[f]).join(", ")}.`);
  }

  const defaults = readCategoryDefaults(workbook, found.name);
  const categoryByName = new Map(ctx.categories.map((c) => [nameKey(c.name), c]));
  const rows = readRows(layout);
  const errors: ListingRowError[] = [];
  const products: ListingProduct[] = [];
  const rowError = (row: SheetRow, message: string): ListingRowError => ({
    rowNumber: row.rowNumber,
    sr: srOf(row),
    sku: skuOf(row),
    message,
  });

  // Every SKU typed in the file, for "used twice" and for the size SKUs made
  // from them (EX-0981 -> EX-0981-M) clashing with another row's SKU.
  const skuRows = new Map<string, number[]>();
  for (const row of rows) {
    const key = skuKey(skuOf(row));
    if (key) skuRows.set(key, [...(skuRows.get(key) ?? []), row.rowNumber]);
  }
  const madeSkus = new Set<string>();

  // A product's block: its main row and every row under it up to the next
  // main row. Rows above the first product belong to none.
  const blocks: SheetRow[][] = [];
  for (const row of rows) {
    if (isMainRow(row)) blocks.push([row]);
    else if (blocks.length) blocks[blocks.length - 1].push(row);
    else {
      const sr = srOf(row);
      const colour = sr.match(COLOUR_SR_RE);
      errors.push(
        rowError(
          row,
          !sr
            ? "Sr is empty - write a number (1, 2, 3...) for a new product, or the number with a letter (1A, 1B...) for its other colours"
            : colour
              ? `Sr ${sr} has no product ${colour[1]} above it - a colour row goes right below its product's row`
              : `Sr "${sr}" is not understood - use a number (1, 2, 001) for a new product and the number with a letter (1A, 001B) for its other colours`,
        ),
      );
    }
  }

  const mainRowBySr = new Map<number, number>();

  for (const block of blocks) {
    const main = block[0];
    const mainSr = srOf(main);
    const mainNumber = Number(mainSr);
    const problems = new Map<SheetRow, string[]>();
    const problem = (row: SheetRow, message: string) => problems.set(row, [...(problems.get(row) ?? []), message]);

    const earlier = mainRowBySr.get(mainNumber);
    if (earlier !== undefined) problem(main, `Sr ${mainSr} is already used in row ${earlier} - every new product needs its own number`);
    else mainRowBySr.set(mainNumber, main.rowNumber);

    // --- The product (main row) ---
    const typeParsed = parseListingType(main.field("listingType"));
    if ("error" in typeParsed) problem(main, typeParsed.error);
    const listingType = "value" in typeParsed ? typeParsed.value : null;

    const categoryText = oneLine(main.field("category").text);
    const category = categoryText ? categoryByName.get(nameKey(categoryText)) : undefined;
    if (!categoryText) problem(main, "Category is empty");
    else if (!category) {
      problem(main, `Category "${categoryText}" is not an AllBoutiqs category - pick one AllBoutiqs has added (ask AllBoutiqs to add it first)`);
    }
    const categoryDefaults = defaults.get(nameKey(categoryText));

    const value = parseNumber(main.field("productValue"));
    const mainValue = "value" in value ? value.value : null;
    if ("error" in value) problem(main, `Product value ₹: ${value.error}`);
    else if (mainValue === null) problem(main, "Product value ₹ is empty");
    else if (mainValue <= 0) problem(main, "Product value ₹ must be more than 0");

    const description = main.field("description").text;
    if (!description) problem(main, "Description is empty");

    const detailCell = (row: SheetRow, key: string) => row.details.find((d) => d.key === key)?.cell ?? EMPTY;
    const hasDetail = (key: string) => layout.details.some((d) => d.key === key);
    if (hasDetail("fabric") && !detailCell(main, "fabric").text) problem(main, "Fabric is empty");

    const returnable = parseYesNo(main.field("returnable"), "Return & refund");
    if ("error" in returnable) problem(main, returnable.error);
    const cod = parseYesNo(main.field("cod"), "COD");
    if ("error" in cod) problem(main, cod.error);
    // 3.1.3: a row marked "AI-made product" is refused (checked on every
    // row below).
    const ai = parseAi(main.field("ai"));
    const aiStatus = "value" in ai ? ai.value : null;

    // One "days" box on the product: making days for Made to Order,
    // dispatch days for Ready to Ship; empty = the category's default.
    const daysField: Field = listingType === "mto" ? "makingDays" : "dispatchDays";
    let prepDays: number | null = null;
    if (listingType) {
      const days = parseNumber(main.field(daysField));
      if ("error" in days || (days.value !== null && (!Number.isInteger(days.value) || days.value < 0 || days.value > 90))) {
        problem(main, `${FIELD_LABEL[daysField]} must be a whole number of days from 0 to 90 (found "${oneLine(main.field(daysField).text)}")`);
      } else {
        prepDays =
          days.value ?? (listingType === "mto" ? categoryDefaults?.makingDays : categoryDefaults?.dispatchDays) ?? null;
      }
    }

    let customisable: boolean | null = null;
    if (listingType === "mto" && hasDetail("customisation")) {
      const custom = parseYesNo(detailCell(main, "customisation"), "Customisation");
      if ("error" in custom) problem(main, custom.error);
      else if (custom.value === null) problem(main, "Customisation is empty - pick Yes or No (needed for Made to Order)");
      else customisable = custom.value;
      if (customisable) {
        for (const key of ONLY_WHEN_CUSTOMISABLE) {
          if (hasDetail(key) && !detailCell(main, key).text) {
            const label = layout.details.find((d) => d.key === key)!.label;
            problem(main, `${label} is empty (Customisation is Yes)`);
          }
        }
      }
    }
    // 3.3.3: the charge is a % of the product price; the extra days as typed
    // ("Other – write in Note" = left for admin).
    let customisationPct: number | null = null;
    let customisationDays: number | null = null;
    if (customisable) {
      const pctText = detailCell(main, "customisation charge %").text;
      if (!hasDetail("customisation charge %")) {
        problem(main, "Customisation charge % is needed when Customisation is Yes - use the latest listing sheet");
      } else if (pctText) {
        const pct = Number(pctText.replace(/[%\s]/g, ""));
        if ((CUSTOMISATION_PCTS as readonly number[]).includes(pct)) customisationPct = pct;
        else problem(main, `Customisation charge % must be 1, 2, 3, 4, 5, 7, 10, 15 or 20 (found "${oneLine(pctText)}")`);
      }
      const daysText = detailCell(main, "customisation extra days").text;
      if (daysText && !OTHER_RE.test(daysText)) {
        const extra = Number(daysText.replace(/\s*days?$/i, ""));
        if (Number.isInteger(extra) && extra >= 0 && extra <= 60) customisationDays = extra;
        else problem(main, `Customisation extra days must be a whole number of days (found "${oneLine(daysText)}")`);
      }
    }
    const sizeHidden = /hide/i.test(detailCell(main, "when sold out").text);

    // "When a size sells out" (Ready to Ship; 3.2.4 and the Part 4 list):
    // Make to order (extra ₹ or % + extra days) or Hide that size. Empty =
    // the size shows as sold out.
    let soldOut: Pick<
      ProductFormData,
      "sold_out_action" | "sold_out_extra_amount" | "sold_out_extra_pct" | "sold_out_extra_days"
    > | null = null;
    if (listingType === "rts" && hasDetail("when sold out")) {
      const whenText = oneLine(detailCell(main, "when sold out").text);
      const none = { sold_out_extra_amount: null, sold_out_extra_pct: null, sold_out_extra_days: null };
      if (!whenText || NOT_NEEDED_RE.test(whenText)) {
        soldOut = { sold_out_action: null, ...none };
      } else if (sizeHidden) {
        soldOut = { sold_out_action: "hide", ...none };
      } else if (/make|made|order/i.test(whenText)) {
        const extraText = oneLine(detailCell(main, "extra when made to order").text);
        let amount: number | null = null;
        let pct: number | null = null;
        if (extraText && !NOT_NEEDED_RE.test(extraText)) {
          if (extraText.includes("%")) {
            const p = Number(extraText.replace(/[%\s]/g, ""));
            if ((CUSTOMISATION_PCTS as readonly number[]).includes(p)) pct = p;
            else problem(main, `Extra when made to order "${extraText}" must be 1, 2, 3, 4, 5, 7, 10, 15 or 20% - or a ₹ amount`);
          } else {
            const n = parseNumber(detailCell(main, "extra when made to order"));
            if ("value" in n && n.value !== null && Number.isInteger(n.value) && n.value >= 0 && n.value <= 50000) amount = n.value;
            else problem(main, `Extra when made to order must be a ₹ amount from 0 to 50,000 or a % (found "${extraText}")`);
          }
        }
        const daysText = oneLine(detailCell(main, "extra days when made to order").text);
        const days = Number(daysText.replace(/\s*days?$/i, ""));
        if (!daysText || NOT_NEEDED_RE.test(daysText)) {
          problem(main, "Extra days when made to order is empty (When sold out is Make to order)");
        } else if (OTHER_RE.test(daysText)) {
          problem(main, 'Extra days when made to order is "Other - write in Note" - pick a number of days from the list');
        } else if (!Number.isInteger(days) || days < 1 || days > 90) {
          problem(main, `Extra days when made to order must be a whole number of days from 1 to 90 (found "${daysText}")`);
        } else {
          soldOut = {
            sold_out_action: "made_to_order",
            sold_out_extra_amount: pct === null ? amount ?? 0 : null,
            sold_out_extra_pct: pct,
            sold_out_extra_days: days,
          };
        }
      } else {
        problem(main, `When sold out "${whenText}" must be Make to order or Hide that size`);
      }
    }

    // A detail column that applies to this product (see MADE_TO_ORDER_ONLY...).
    const detailApplies = (key: string) =>
      !(listingType === "mto" && READY_TO_SHIP_ONLY.has(key)) &&
      !(listingType === "rts" && MADE_TO_ORDER_ONLY.has(key)) &&
      !(ONLY_WHEN_CUSTOMISABLE.has(key) && customisable !== true) &&
      !(NOT_WHEN_SIZE_HIDDEN.has(key) && sizeHidden);

    // --- Every row: SKU, colour, sizes, confirmation ---
    const seenLetters = new Map<string, number>();
    const seenColours = new Map<string, number>();
    const planned: { row: SheetRow; sku: string; colour: string; value: number | null; sizes: { size: string; stock: number }[] }[] = [];

    for (const row of block) {
      const isMain = row === main;
      const sr = srOf(row);

      if (!isMain) {
        const colourSr = sr.match(COLOUR_SR_RE);
        if (!sr) problem(row, `Sr is empty - this row is under product ${mainSr}, so write ${mainSr}A, ${mainSr}B...`);
        else if (!colourSr) problem(row, `Sr "${sr}" is not understood - under product ${mainSr} write ${mainSr}A, ${mainSr}B...`);
        else if (Number(colourSr[1]) !== mainNumber) {
          problem(row, `Sr ${sr} is under product ${mainSr} (row ${main.rowNumber}) - a colour row goes right below its own product's row`);
        } else {
          const letter = colourSr[2].toUpperCase();
          const first = seenLetters.get(letter);
          if (first !== undefined) problem(row, `Sr ${sr} is already used in row ${first}`);
          else seenLetters.set(letter, row.rowNumber);
        }

        const rowType = parseListingType(row.field("listingType"));
        if ("error" in rowType) problem(row, rowType.error);
        else if (listingType && rowType.value !== listingType) {
          problem(row, `Listing type must be the same as the product's row ${main.rowNumber} (${oneLine(main.field("listingType").text)})`);
        }

        const rowCategory = oneLine(row.field("category").text);
        if (rowCategory && nameKey(rowCategory) !== nameKey(categoryText)) {
          problem(row, `Category must be empty or the same as row ${main.rowNumber} - a colour row can't change it`);
        }

        // Product-level boxes can't differ per colour: leave them empty
        // (= same as the main row) or the same.
        const sameAsMain = (label: string, mine: CellValue, theirs: CellValue) => {
          if (mine.text && oneLine(mine.text).toLowerCase() !== oneLine(theirs.text).toLowerCase()) {
            problem(row, `${label} is different from the product's row ${main.rowNumber} - a colour row can only change SKU, Colour, size stock and Product value; leave it empty`);
          }
        };
        for (const f of ["name", "description", "returnable", "cod", daysField] as Field[]) {
          sameAsMain(FIELD_LABEL[f], row.field(f), main.field(f));
        }
        const colourAi = parseAi(row.field("ai"));
        if (!("value" in colourAi && colourAi.value === "fully_ai")) sameAsMain(FIELD_LABEL.ai, row.field("ai"), main.field("ai"));
        for (const d of row.details) if (detailApplies(d.key)) sameAsMain(d.label, d.cell, detailCell(main, d.key));
      }

      const sku = skuOf(row);
      if (!sku) problem(row, "SKU is empty");
      else {
        const others = (skuRows.get(skuKey(sku)) ?? []).filter((n) => n !== row.rowNumber);
        if (others.length) problem(row, `SKU ${sku} is also used in row ${others.join(", ")} - every row needs its own SKU`);
        if (ctx.existingSkus.has(skuKey(sku))) problem(row, `SKU ${sku} already exists in this boutique's products (already uploaded?)`);
      }

      const colour = oneLine(row.field("colour").text);
      if (!colour) problem(row, "Colour is empty");
      else if (OTHER_RE.test(colour)) {
        problem(row, 'Colour is "Other - write in Note" - a product can only be uploaded with its real colour; pick it from the list, or add this product by hand');
      } else {
        const first = seenColours.get(colour.toLowerCase());
        if (first !== undefined) problem(row, `Colour ${colour} is already used in this product (row ${first})`);
        else seenColours.set(colour.toLowerCase(), row.rowNumber);
      }

      let rowValue: number | null = null;
      if (!isMain) {
        const own = parseNumber(row.field("productValue"));
        if ("error" in own) problem(row, `Product value ₹: ${own.error}`);
        else if (own.value !== null && own.value <= 0) problem(row, "Product value ₹ must be more than 0");
        else rowValue = own.value;
      }

      const sizes: { size: string; stock: number }[] = [];
      if (listingType === "rts") {
        let badStock = false;
        for (const s of row.sizes) {
          if (!s.cell.text) continue;
          const n = parseNumber(s.cell);
          if ("error" in n || n.value === null || !Number.isInteger(n.value) || n.value < 0) {
            problem(row, `Stock for size ${s.size} must be a whole number (0 or more) - found "${oneLine(s.cell.text)}"`);
            badStock = true;
          } else if (n.value > 0) sizes.push({ size: s.size, stock: n.value });
        }
        if (!sizes.length && !badStock) problem(row, "Ready to Ship needs stock in at least one size");
        if (sizes.some((s) => s.size === FREE_SIZE) && sizes.length > 1) {
          problem(row, "Free Size and other sizes can't both have stock in one row");
        }
      } else if (listingType === "mto") {
        // Sizes come from the Size range: the row's own, else the product's,
        // else the category's default. None = a colour-only variant.
        const rangeText =
          oneLine(row.field("sizeRange").text) || oneLine(main.field("sizeRange").text) || categoryDefaults?.sizeRange || "";
        if (rangeText && OTHER_RE.test(rangeText)) {
          problem(row, 'Size range is "Other - write in Note" - pick a size range from the list');
        } else if (rangeText) {
          const expanded = expandSizeRange(rangeText);
          if (!expanded) problem(row, `Size range "${rangeText}" is not understood - use e.g. "XS to XXL" or "Free Size"`);
          else sizes.push(...expanded.map((size) => ({ size, stock: 0 })));
        }
      }

      const rowAi = parseAi(row.field("ai"));
      if ("error" in rowAi) problem(row, rowAi.error);
      else if (rowAi.value === "fully_ai") problem(row, AI_MADE_ROW);

      if (layout.fields.confirm !== undefined && !row.field("confirm").text) {
        problem(row, '"I confirm" is not picked - every row must be confirmed by the boutique before it can be uploaded');
      }

      planned.push({ row, sku, colour, value: rowValue, sizes });
    }

    // Each size gets its own SKU: <row SKU>-<size> (EX-0981-M); a colour
    // without sizes keeps the row's SKU - except the main row's colour,
    // whose row SKU is the product's own SKU, which a variant may not share
    // (24 Nov 2026): it gets <row SKU>-<colour> (EX-0981-RED).
    const variantSku = (sku: string, part: string) => `${sku}-${part.replace(/\s+/g, "").toUpperCase()}`;
    const productSkuKey = skuKey(skuOf(main));
    const colourOnlySku = (p: { sku: string; colour: string }) =>
      skuKey(p.sku) === productSkuKey ? variantSku(p.sku, p.colour) : p.sku;
    for (const p of planned) {
      if (!p.sku) continue;
      for (const s of p.sizes) {
        const made = variantSku(p.sku, s.size);
        const key = skuKey(made);
        if (ctx.existingSkus.has(key) || madeSkus.has(key) || (skuRows.has(key) && key !== skuKey(p.sku))) {
          problem(p.row, `SKU ${made} (made for size ${s.size}) is already used - change this row's SKU`);
        }
      }
      if (p.sizes.length === 0 && skuKey(p.sku) === productSkuKey) {
        const made = colourOnlySku(p);
        const key = skuKey(made);
        if (ctx.existingSkus.has(key) || madeSkus.has(key) || skuRows.has(key)) {
          problem(p.row, `SKU ${made} (made for colour ${p.colour}) is already used - change this row's SKU`);
        }
      }
    }

    if (problems.size > 0) {
      const firstBad = block.find((r) => problems.has(r))!;
      for (const row of block) {
        const own = problems.get(row);
        errors.push(
          rowError(
            row,
            own
              ? own.join("; ")
              : `Not uploaded - row ${firstBad.rowNumber} of the same product (Sr ${mainSr}) has a problem; fix it and upload this product again`,
          ),
        );
      }
      continue;
    }

    // --- Build it (no problems, so category and mainValue are set) ---
    const variants: ProductVariant[] = [];
    for (const p of planned) {
      const productValue = p.value ?? mainValue!;
      if (p.sizes.length === 0) {
        const sku = colourOnlySku(p);
        madeSkus.add(skuKey(sku));
        variants.push({
          id: crypto.randomUUID(),
          name: p.colour,
          price: 0,
          product_value: productValue,
          sku,
          stock: 0,
          options: { Color: p.colour },
          image_url: null,
          images: [],
        });
        continue;
      }
      const ordered = [...p.sizes].sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size));
      for (const s of ordered) {
        const sku = variantSku(p.sku, s.size);
        madeSkus.add(skuKey(sku));
        variants.push({
          id: crypto.randomUUID(),
          name: `${s.size} / ${p.colour}`,
          price: 0,
          product_value: productValue,
          sku,
          stock: s.stock,
          options: { Size: s.size, Color: p.colour },
          image_url: null,
          images: [],
        });
      }
    }

    const specifications: ProductSpecification[] = [];
    for (const d of main.details) {
      const text = oneLine(d.cell.text);
      if (
        !text ||
        OTHER_RE.test(text) ||
        !detailApplies(d.key) ||
        CUSTOMISATION_COLUMNS.has(d.key) ||
        SOLD_OUT_COLUMNS.has(d.key)
      )
        continue;
      if (!specifications.some((s) => s.label.toLowerCase() === d.label.toLowerCase())) {
        specifications.push({ label: d.label, value: text });
      }
    }

    const fabric = oneLine(detailCell(main, "fabric").text);
    const typedName = oneLine(main.field("name").text);
    const name = titleCase(typedName || [OTHER_RE.test(fabric) ? "" : fabric, category!.name].filter(Boolean).join(" "));

    const formData: ProductFormData = {
      name,
      description,
      category_id: category!.id,
      product_value: mainValue!,
      compare_at_value: null,
      sku: skuOf(main),
      stock_quantity: 0,
      is_active: true,
      specifications,
      country_of_origin: "India",
      net_quantity: "1 N",
      is_returnable: ("value" in returnable ? returnable.value : null) ?? true,
      cod_available: ("value" in cod ? cod.value : null) ?? true,
      prep_days: prepDays,
      made_to_order: listingType === "mto",
      ...(soldOut ?? {}),
      // "No AI" is saved. The two AI options need an original photo, which
      // a sheet can't carry (products_ai_original_photo_required): left
      // undeclared, the product form asks for both when it's next saved.
      ...(aiStatus === "none" ? { ai_content_status: "none" as const } : {}),
      ...(customisable !== null
        ? { customisable, customisation_pct: customisationPct, customisation_days: customisationDays }
        : {}),
      vendor_id: ctx.vendorId,
      ...(ctx.approvalStatus ? { approval_status: ctx.approvalStatus } : {}),
    };

    products.push({
      sr: mainSr,
      sku: skuOf(main),
      rowNumbers: block.map((r) => r.rowNumber),
      formData,
      variants,
    });
  }

  errors.sort((a, b) => a.rowNumber - b.rowNumber);
  return { products, errors, rowsRead: rows.length };
}
