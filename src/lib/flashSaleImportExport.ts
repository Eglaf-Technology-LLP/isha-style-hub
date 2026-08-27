import { parseBoolean, parseNumberOrNull } from "@/lib/excelImportExport";

export const FLASH_SALE_COLUMNS = {
  flashSaleId: "Flash Sale ID",
  name: "Sale Name",
  description: "Description",
  discountPercentage: "Discount Percentage",
  productSkus: "Product SKUs (semicolon-separated)",
  startsAt: "Start Date/Time (YYYY-MM-DD HH:mm)",
  endsAt: "End Date/Time (YYYY-MM-DD HH:mm)",
  isActive: "Active (TRUE/FALSE)",
} as const;

export interface FlashSaleImportRow {
  flashSaleId: string | null;
  name: string;
  description: string;
  discount_percentage: number;
  product_ids: string[];
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

export interface FlashSaleRowError {
  rowNumber: number;
  message: string;
}

export function parseFlashSaleRows(
  rows: Record<string, string>[],
  productIdBySku: Map<string, string>,
): { rows: FlashSaleImportRow[]; errors: FlashSaleRowError[] } {
  const errors: FlashSaleRowError[] = [];
  const parsed: FlashSaleImportRow[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const name = row[FLASH_SALE_COLUMNS.name]?.trim();
    if (!name) {
      errors.push({ rowNumber, message: "Sale Name is required" });
      return;
    }
    const discountPercentage = parseNumberOrNull(row[FLASH_SALE_COLUMNS.discountPercentage]);
    if (discountPercentage === null || discountPercentage <= 0 || discountPercentage > 100) {
      errors.push({ rowNumber, message: "Discount Percentage must be between 1 and 100" });
      return;
    }
    const startsAt = row[FLASH_SALE_COLUMNS.startsAt]?.trim();
    const endsAt = row[FLASH_SALE_COLUMNS.endsAt]?.trim();
    if (!startsAt || !endsAt) {
      errors.push({ rowNumber, message: "Start and End Date/Time are required" });
      return;
    }

    const skus = row[FLASH_SALE_COLUMNS.productSkus]
      ?.split(";")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
    const productIds: string[] = [];
    for (const sku of skus) {
      const id = productIdBySku.get(sku.toLowerCase());
      if (!id) {
        errors.push({ rowNumber, message: `Product SKU "${sku}" not found` });
        return;
      }
      productIds.push(id);
    }
    if (productIds.length === 0) {
      errors.push({ rowNumber, message: "At least one valid Product SKU is required" });
      return;
    }

    parsed.push({
      flashSaleId: row[FLASH_SALE_COLUMNS.flashSaleId]?.trim() || null,
      name,
      description: row[FLASH_SALE_COLUMNS.description]?.trim() || "",
      discount_percentage: discountPercentage,
      product_ids: productIds,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      is_active: parseBoolean(row[FLASH_SALE_COLUMNS.isActive], true),
    });
  });

  return { rows: parsed, errors };
}

export function flashSalesToRows(
  sales: {
    id: string;
    name: string;
    description: string | null;
    discount_percentage: number;
    product_ids: string[];
    starts_at: string;
    ends_at: string;
    is_active: boolean;
  }[],
  skuByProductId: Map<string, string>,
): Record<string, string>[] {
  return sales.map((s) => ({
    [FLASH_SALE_COLUMNS.flashSaleId]: s.id,
    [FLASH_SALE_COLUMNS.name]: s.name,
    [FLASH_SALE_COLUMNS.description]: s.description ?? "",
    [FLASH_SALE_COLUMNS.discountPercentage]: String(s.discount_percentage),
    [FLASH_SALE_COLUMNS.productSkus]: s.product_ids
      .map((id) => skuByProductId.get(id))
      .filter(Boolean)
      .join(";"),
    [FLASH_SALE_COLUMNS.startsAt]: s.starts_at.slice(0, 16).replace("T", " "),
    [FLASH_SALE_COLUMNS.endsAt]: s.ends_at.slice(0, 16).replace("T", " "),
    [FLASH_SALE_COLUMNS.isActive]: s.is_active ? "TRUE" : "FALSE",
  }));
}

export function sampleFlashSaleTemplateRows(): Record<string, string>[] {
  return [
    {
      [FLASH_SALE_COLUMNS.flashSaleId]: "",
      [FLASH_SALE_COLUMNS.name]: "Summer Flash Sale",
      [FLASH_SALE_COLUMNS.description]: "10% off selected kurtis for 48 hours",
      [FLASH_SALE_COLUMNS.discountPercentage]: "10",
      [FLASH_SALE_COLUMNS.productSkus]: "SEK-S-MRN;SEK-M-MRN",
      [FLASH_SALE_COLUMNS.startsAt]: "2026-09-01 09:00",
      [FLASH_SALE_COLUMNS.endsAt]: "2026-09-03 09:00",
      [FLASH_SALE_COLUMNS.isActive]: "TRUE",
    },
  ];
}
