// xlsx is a large library (~600KB) only ever needed on the two admin/
// vendor import-export dialogs - dynamically imported so the storefront's
// main bundle (loaded by every anonymous shopper) never carries it.
async function loadXlsx() {
  return import("xlsx");
}

// Every cell comes back as a string (or undefined) regardless of how
// Excel typed it - callers parse numbers/booleans themselves rather than
// trusting XLSX's own type inference, which gets it wrong often enough
// (a SKU that looks numeric, a "TRUE" typed as text vs boolean) to not be
// worth relying on.
export async function parseWorkbook(file: File): Promise<Record<string, string>[]> {
  const XLSX = await loadXlsx();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  return rows.map((row) => {
    const stringRow: Record<string, string> = {};
    for (const key of Object.keys(row)) {
      stringRow[key] = String(row[key] ?? "").trim();
    }
    return stringRow;
  });
}

export async function buildWorkbook(rows: Record<string, unknown>[], filename: string): Promise<void> {
  const XLSX = await loadXlsx();
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  XLSX.writeFile(workbook, filename);
}

// Shared codec for every free-form key-value field in this schema
// (products.specifications, a variant's options) - "label:value;label:value"
// is bulk-editable in a single Excel cell without needing a fixed column
// list, matching how genuinely free-form this data already is.
export function parsePairs(raw: string): { label: string; value: string }[] {
  if (!raw.trim()) return [];
  return raw
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(":");
      if (idx === -1) return { label: pair.trim(), value: "" };
      return { label: pair.slice(0, idx).trim(), value: pair.slice(idx + 1).trim() };
    })
    .filter((p) => p.label);
}

export function stringifyPairs(pairs: { label: string; value: string }[]): string {
  return pairs
    .filter((p) => p.label)
    .map((p) => `${p.label}:${p.value}`)
    .join(";");
}

export function parseBoolean(raw: string, fallback = true): boolean {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "true" || normalized === "yes" || normalized === "1";
}

export function parseNumberOrNull(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
