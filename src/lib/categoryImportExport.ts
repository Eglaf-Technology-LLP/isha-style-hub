import { Category } from "@/hooks/useCategories";

export const CATEGORY_COLUMNS = {
  categoryId: "Category ID",
  name: "Name",
  slug: "Slug",
  description: "Description",
  imageUrl: "Image URL",
} as const;

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export interface CategoryImportRow {
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
}

export interface CategoryRowError {
  rowNumber: number;
  message: string;
}

export function parseCategoryRows(
  rows: Record<string, string>[],
): { rows: CategoryImportRow[]; errors: CategoryRowError[] } {
  const errors: CategoryRowError[] = [];
  const parsed: CategoryImportRow[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const name = row[CATEGORY_COLUMNS.name]?.trim();
    if (!name) {
      errors.push({ rowNumber, message: "Name is required" });
      return;
    }
    const slug = row[CATEGORY_COLUMNS.slug]?.trim() || slugify(name);
    parsed.push({
      categoryId: row[CATEGORY_COLUMNS.categoryId]?.trim() || null,
      name,
      slug,
      description: row[CATEGORY_COLUMNS.description]?.trim() || null,
      imageUrl: row[CATEGORY_COLUMNS.imageUrl]?.trim() || null,
    });
  });

  return { rows: parsed, errors };
}

export function categoriesToRows(categories: Category[]): Record<string, string>[] {
  return categories.map((c) => ({
    [CATEGORY_COLUMNS.categoryId]: c.id,
    [CATEGORY_COLUMNS.name]: c.name,
    [CATEGORY_COLUMNS.slug]: c.slug,
    [CATEGORY_COLUMNS.description]: c.description ?? "",
    [CATEGORY_COLUMNS.imageUrl]: c.image_url ?? "",
  }));
}

export function sampleCategoryTemplateRows(): Record<string, string>[] {
  return [
    {
      [CATEGORY_COLUMNS.categoryId]: "",
      [CATEGORY_COLUMNS.name]: "Kurtis",
      [CATEGORY_COLUMNS.slug]: "",
      [CATEGORY_COLUMNS.description]: "Traditional and contemporary kurtis",
      [CATEGORY_COLUMNS.imageUrl]: "https://example.com/kurtis.jpg",
    },
    {
      [CATEGORY_COLUMNS.categoryId]: "",
      [CATEGORY_COLUMNS.name]: "Lehengas",
      [CATEGORY_COLUMNS.slug]: "",
      [CATEGORY_COLUMNS.description]: "Festive and bridal lehengas",
      [CATEGORY_COLUMNS.imageUrl]: "https://example.com/lehengas.jpg",
    },
  ];
}
