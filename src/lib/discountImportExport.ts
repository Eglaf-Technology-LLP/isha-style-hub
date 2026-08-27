import { parseBoolean, parseNumberOrNull } from "@/lib/excelImportExport";

export const DISCOUNT_COLUMNS = {
  discountId: "Discount ID",
  code: "Discount Code",
  name: "Name",
  description: "Description",
  discountType: "Discount Type (percentage/fixed_amount)",
  discountValue: "Value",
  minOrderAmount: "Min. Order Amount",
  maxUses: "Max Uses (optional)",
  productSkus: "Restrict to Product SKUs (optional, semicolon-separated)",
  startsAt: "Start Date/Time (optional, YYYY-MM-DD HH:mm)",
  expiresAt: "End Date/Time (optional, YYYY-MM-DD HH:mm)",
  isActive: "Active (TRUE/FALSE)",
} as const;

export interface DiscountImportRow {
  discountId: string | null;
  code: string;
  name: string;
  description: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  product_ids: string[] | null;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

export interface DiscountRowError {
  rowNumber: number;
  message: string;
}

export function parseDiscountRows(
  rows: Record<string, string>[],
  productIdBySku: Map<string, string>,
): { rows: DiscountImportRow[]; errors: DiscountRowError[] } {
  const errors: DiscountRowError[] = [];
  const parsed: DiscountImportRow[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const code = row[DISCOUNT_COLUMNS.code]?.trim();
    const name = row[DISCOUNT_COLUMNS.name]?.trim();
    if (!code || !name) {
      errors.push({ rowNumber, message: "Discount Code and Name are required" });
      return;
    }
    const typeRaw = row[DISCOUNT_COLUMNS.discountType]?.trim().toLowerCase();
    const discountType: "percentage" | "fixed_amount" = typeRaw === "fixed_amount" ? "fixed_amount" : "percentage";

    const discountValue = parseNumberOrNull(row[DISCOUNT_COLUMNS.discountValue]);
    if (discountValue === null || discountValue <= 0) {
      errors.push({ rowNumber, message: "Value must be a positive number" });
      return;
    }

    const skusRaw = row[DISCOUNT_COLUMNS.productSkus]?.trim();
    let productIds: string[] | null = null;
    if (skusRaw) {
      productIds = [];
      for (const sku of skusRaw.split(";").map((s) => s.trim()).filter(Boolean)) {
        const id = productIdBySku.get(sku.toLowerCase());
        if (!id) {
          errors.push({ rowNumber, message: `Product SKU "${sku}" not found` });
          return;
        }
        productIds.push(id);
      }
    }

    const startsAtRaw = row[DISCOUNT_COLUMNS.startsAt]?.trim();
    const expiresAtRaw = row[DISCOUNT_COLUMNS.expiresAt]?.trim();

    parsed.push({
      discountId: row[DISCOUNT_COLUMNS.discountId]?.trim() || null,
      code: code.toUpperCase(),
      name,
      description: row[DISCOUNT_COLUMNS.description]?.trim() || "",
      discount_type: discountType,
      discount_value: discountValue,
      min_order_amount: parseNumberOrNull(row[DISCOUNT_COLUMNS.minOrderAmount]) ?? 0,
      max_uses: parseNumberOrNull(row[DISCOUNT_COLUMNS.maxUses]),
      product_ids: productIds,
      starts_at: startsAtRaw ? new Date(startsAtRaw).toISOString() : null,
      expires_at: expiresAtRaw ? new Date(expiresAtRaw).toISOString() : null,
      is_active: parseBoolean(row[DISCOUNT_COLUMNS.isActive], true),
    });
  });

  return { rows: parsed, errors };
}

export function discountsToRows(
  discounts: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    discount_type: "percentage" | "fixed_amount";
    discount_value: number;
    min_order_amount: number;
    max_uses: number | null;
    product_ids: string[] | null;
    starts_at: string | null;
    expires_at: string | null;
    is_active: boolean;
  }[],
  skuByProductId: Map<string, string>,
): Record<string, string>[] {
  return discounts.map((d) => ({
    [DISCOUNT_COLUMNS.discountId]: d.id,
    [DISCOUNT_COLUMNS.code]: d.code,
    [DISCOUNT_COLUMNS.name]: d.name,
    [DISCOUNT_COLUMNS.description]: d.description ?? "",
    [DISCOUNT_COLUMNS.discountType]: d.discount_type,
    [DISCOUNT_COLUMNS.discountValue]: String(d.discount_value),
    [DISCOUNT_COLUMNS.minOrderAmount]: String(d.min_order_amount),
    [DISCOUNT_COLUMNS.maxUses]: d.max_uses != null ? String(d.max_uses) : "",
    [DISCOUNT_COLUMNS.productSkus]: (d.product_ids ?? [])
      .map((id) => skuByProductId.get(id))
      .filter(Boolean)
      .join(";"),
    [DISCOUNT_COLUMNS.startsAt]: d.starts_at ? d.starts_at.slice(0, 16).replace("T", " ") : "",
    [DISCOUNT_COLUMNS.expiresAt]: d.expires_at ? d.expires_at.slice(0, 16).replace("T", " ") : "",
    [DISCOUNT_COLUMNS.isActive]: d.is_active ? "TRUE" : "FALSE",
  }));
}

export function sampleDiscountTemplateRows(): Record<string, string>[] {
  return [
    {
      [DISCOUNT_COLUMNS.discountId]: "",
      [DISCOUNT_COLUMNS.code]: "SUMMER20",
      [DISCOUNT_COLUMNS.name]: "Summer Sale",
      [DISCOUNT_COLUMNS.description]: "20% off storewide",
      [DISCOUNT_COLUMNS.discountType]: "percentage",
      [DISCOUNT_COLUMNS.discountValue]: "20",
      [DISCOUNT_COLUMNS.minOrderAmount]: "500",
      [DISCOUNT_COLUMNS.maxUses]: "100",
      [DISCOUNT_COLUMNS.productSkus]: "",
      [DISCOUNT_COLUMNS.startsAt]: "",
      [DISCOUNT_COLUMNS.expiresAt]: "",
      [DISCOUNT_COLUMNS.isActive]: "TRUE",
    },
  ];
}
