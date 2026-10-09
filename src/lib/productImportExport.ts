import { parsePairs, stringifyPairs, parseBoolean, parseNumberOrNull } from "@/lib/excelImportExport";
import { ProductFormData, ProductVariant, ProductSpecification } from "@/hooks/useProducts";

// Deliberately narrower than useProducts.ts's own Product interface -
// this is exactly the set of fields import/export actually reads.
// VendorDashboard.tsx's own product list type (VendorProduct) has no
// vendor_id/created_at/updated_at/rejection_reason (the current vendor is
// already a given in that context) - keeping vendor_id optional here
// means both the admin Product type and the vendor's own product type
// satisfy this structurally, with no adapter/conversion needed at either
// call site.
export interface ImportExportProduct {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  vendor_id?: string | null;
  price: number;
  sku: string | null;
  stock_quantity: number;
  is_active: boolean;
  images: string[];
  variants: ProductVariant[];
  weight_grams: number | null;
  length_cm: number | null;
  breadth_cm: number | null;
  height_cm: number | null;
  specifications: ProductSpecification[];
  country_of_origin: string;
  net_quantity: string;
  is_returnable: boolean;
  cod_available?: boolean;
}

// One row per variant/SKU (the Shopify/WooCommerce convention) - rows
// sharing the same "Product Handle" become one product's variant list.
// A product with no variants is still one row, with Variant Options blank
// and its SKU/Price/Stock read at the product level instead - mirrors the
// existing variant-less path already in insertProductRecord/applyProductUpdate.
export const PRODUCT_COLUMNS = {
  productId: "Product ID",
  handle: "Product Handle",
  name: "Product Name",
  description: "Description",
  category: "Category",
  vendorSlug: "Vendor Slug",
  countryOfOrigin: "Country of Origin",
  netQuantity: "Net Quantity",
  returnable: "Returnable (TRUE/FALSE)",
  codAvailable: "Cash on Delivery (TRUE/FALSE)",
  weightG: "Weight (g)",
  lengthCm: "Length (cm)",
  breadthCm: "Breadth (cm)",
  heightCm: "Height (cm)",
  specifications: "Specifications (label:value;label:value)",
  isActive: "Is Active (TRUE/FALSE)",
  variantOptions: "Variant Options (label:value;label:value)",
  sku: "SKU",
  price: "Price",
  stock: "Stock",
  imageUrl: "Image URL",
} as const;

export interface ProductImportGroup {
  handle: string;
  productId: string | null;
  formData: ProductFormData;
  variants: ProductVariant[];
  imageUrls: string[];
}

export interface ImportRowError {
  handle: string;
  rowNumber: number;
  message: string;
}

interface ParseContext {
  categoryIdByName: Map<string, string>;
  vendorIdBySlug: Map<string, string>;
  forcedVendorId?: string; // vendor-triggered import: always this vendor, column ignored
  // Mirrors VendorProductDialog's own isTrusted ? "approved" : "pending_review"
  // rule exactly - only meaningful alongside forcedVendorId. Admin-triggered
  // imports leave approval_status unset, same as admin's own single-product
  // "Add Product" form does today (both fall through to the DB's own
  // pending_review default, an existing behavior this doesn't change).
  forcedVendorTrusted?: boolean;
}

function variantNameFromOptions(options: { label: string; value: string }[], fallbackSku: string): string {
  const values = options.map((o) => o.value).filter(Boolean);
  return values.length > 0 ? values.join(" / ") : fallbackSku || "Default";
}

// Validates and groups raw parsed rows into one entry per product. Every
// row in a group is checked before the group is considered valid - a bad
// row anywhere in a product's variant set fails that whole product, not
// just that one row, since a half-written product (some variants missing)
// would be worse than not importing it at all.
export function parseImportRows(
  rows: Record<string, string>[],
  ctx: ParseContext,
): { groups: ProductImportGroup[]; errors: ImportRowError[] } {
  const errors: ImportRowError[] = [];
  const byHandle = new Map<string, { row: Record<string, string>; rowNumber: number }[]>();

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // header is row 1
    const handle = row[PRODUCT_COLUMNS.handle]?.trim();
    if (!handle) {
      errors.push({ handle: "(missing)", rowNumber, message: "Product Handle is required" });
      return;
    }
    if (!byHandle.has(handle)) byHandle.set(handle, []);
    byHandle.get(handle)!.push({ row, rowNumber });
  });

  const groups: ProductImportGroup[] = [];

  for (const [handle, entries] of byHandle) {
    const first = entries[0].row;
    const name = first[PRODUCT_COLUMNS.name]?.trim();
    if (!name) {
      errors.push({ handle, rowNumber: entries[0].rowNumber, message: "Product Name is required" });
      continue;
    }

    const categoryName = first[PRODUCT_COLUMNS.category]?.trim();
    let categoryId: string | null = null;
    if (categoryName) {
      categoryId = ctx.categoryIdByName.get(categoryName.toLowerCase()) ?? null;
      if (!categoryId) {
        errors.push({ handle, rowNumber: entries[0].rowNumber, message: `Category "${categoryName}" not found` });
        continue;
      }
    }

    let vendorId: string | null | undefined = ctx.forcedVendorId;
    if (vendorId === undefined) {
      const vendorSlug = first[PRODUCT_COLUMNS.vendorSlug]?.trim();
      if (vendorSlug) {
        vendorId = ctx.vendorIdBySlug.get(vendorSlug.toLowerCase()) ?? null;
        if (!vendorId) {
          errors.push({ handle, rowNumber: entries[0].rowNumber, message: `Vendor "${vendorSlug}" not found` });
          continue;
        }
      } else {
        vendorId = null; // platform-direct product
      }
    }

    const price = parseNumberOrNull(first[PRODUCT_COLUMNS.price]);
    const compareAtPrice = null; // not exposed in bulk template - edit individually if needed
    const weightGrams = parseNumberOrNull(first[PRODUCT_COLUMNS.weightG]);
    const lengthCm = parseNumberOrNull(first[PRODUCT_COLUMNS.lengthCm]);
    const breadthCm = parseNumberOrNull(first[PRODUCT_COLUMNS.breadthCm]);
    const heightCm = parseNumberOrNull(first[PRODUCT_COLUMNS.heightCm]);

    const hasAnyVariantOptions = entries.some((e) => e.row[PRODUCT_COLUMNS.variantOptions]?.trim());
    let rowFailed = false;
    let variants: ProductVariant[] = [];
    let productLevelSku = "";
    let productLevelStock = 0;

    if (entries.length === 1 && !hasAnyVariantOptions) {
      // Variant-less product - this single row's SKU/Price/Stock are the
      // product's own, matching insertProductRecord's existing
      // else-branch for products with no variants array.
      const stock = parseNumberOrNull(first[PRODUCT_COLUMNS.stock]);
      if (price === null || price <= 0) {
        errors.push({ handle, rowNumber: entries[0].rowNumber, message: "Price must be a positive number" });
        continue;
      }
      productLevelSku = first[PRODUCT_COLUMNS.sku]?.trim() || "";
      productLevelStock = stock ?? 0;
    } else {
      for (const entry of entries) {
        const optionPairs = parsePairs(entry.row[PRODUCT_COLUMNS.variantOptions] ?? "");
        const variantPrice = parseNumberOrNull(entry.row[PRODUCT_COLUMNS.price]);
        const variantStock = parseNumberOrNull(entry.row[PRODUCT_COLUMNS.stock]);
        const sku = entry.row[PRODUCT_COLUMNS.sku]?.trim() || "";
        if (variantPrice === null || variantPrice <= 0) {
          errors.push({ handle, rowNumber: entry.rowNumber, message: "Price must be a positive number" });
          rowFailed = true;
          continue;
        }
        const options: Record<string, string> = {};
        optionPairs.forEach((p) => (options[p.label] = p.value));
        variants.push({
          id: crypto.randomUUID(),
          name: variantNameFromOptions(optionPairs, sku),
          price: variantPrice,
          sku: sku || undefined,
          stock: variantStock ?? 0,
          options,
          image_url: entry.row[PRODUCT_COLUMNS.imageUrl]?.trim() || null,
        });
      }
      if (rowFailed) continue;
    }

    const specifications: ProductSpecification[] = parsePairs(first[PRODUCT_COLUMNS.specifications] ?? "");

    const formData: ProductFormData = {
      name,
      description: first[PRODUCT_COLUMNS.description]?.trim() || "",
      category_id: categoryId,
      price: price ?? (variants[0]?.price ?? 0),
      compare_at_price: compareAtPrice,
      sku: productLevelSku,
      stock_quantity: productLevelStock,
      is_active: parseBoolean(first[PRODUCT_COLUMNS.isActive], true),
      weight_grams: weightGrams,
      length_cm: lengthCm,
      breadth_cm: breadthCm,
      height_cm: heightCm,
      specifications,
      country_of_origin: first[PRODUCT_COLUMNS.countryOfOrigin]?.trim() || "India",
      net_quantity: first[PRODUCT_COLUMNS.netQuantity]?.trim() || "1 N",
      is_returnable: parseBoolean(first[PRODUCT_COLUMNS.returnable], true),
      // Only when the file has the column - an older export without it must
      // not switch COD back on for a product an admin turned it off for.
      ...(first[PRODUCT_COLUMNS.codAvailable]?.trim()
        ? { cod_available: parseBoolean(first[PRODUCT_COLUMNS.codAvailable], true) }
        : {}),
      vendor_id: vendorId,
      ...(ctx.forcedVendorId !== undefined
        ? { approval_status: ctx.forcedVendorTrusted ? "approved" : "pending_review" }
        : {}),
    };

    const imageUrl = first[PRODUCT_COLUMNS.imageUrl]?.trim();
    // Set explicitly so applyProductUpdate takes its "full replacement"
    // branch (productData.images !== undefined) rather than its "append
    // to what's already there" branch - re-importing the same file
    // repeatedly must not pile up duplicate images each time.
    formData.images = imageUrl ? [imageUrl] : [];

    groups.push({
      handle,
      productId: first[PRODUCT_COLUMNS.productId]?.trim() || null,
      formData,
      variants,
      imageUrls: imageUrl ? [imageUrl] : [],
    });
  }

  return { groups, errors };
}

// Flattens the catalog back into one row per variant for export - the
// exact inverse of parseImportRows, so re-importing an unmodified export
// round-trips to the same products (matched by Product ID) rather than
// creating duplicates.
export function productsToRows(
  products: ImportExportProduct[],
  opts: { includeVendorColumn: boolean; vendorSlugById?: Map<string, string>; categoryNameById: Map<string, string> },
): Record<string, string>[] {
  const rows: Record<string, string>[] = [];

  for (const product of products) {
    const categoryName = product.category_id ? opts.categoryNameById.get(product.category_id) ?? "" : "";
    const vendorSlug =
      opts.includeVendorColumn && product.vendor_id ? opts.vendorSlugById?.get(product.vendor_id) ?? "" : "";
    const specifications = stringifyPairs(product.specifications ?? []);
    const handle = product.sku || product.id;

    const base: Record<string, string> = {
      [PRODUCT_COLUMNS.productId]: product.id,
      [PRODUCT_COLUMNS.handle]: handle,
      [PRODUCT_COLUMNS.name]: product.name,
      [PRODUCT_COLUMNS.description]: product.description ?? "",
      [PRODUCT_COLUMNS.category]: categoryName,
      ...(opts.includeVendorColumn ? { [PRODUCT_COLUMNS.vendorSlug]: vendorSlug } : {}),
      [PRODUCT_COLUMNS.countryOfOrigin]: product.country_of_origin,
      [PRODUCT_COLUMNS.netQuantity]: product.net_quantity,
      [PRODUCT_COLUMNS.returnable]: product.is_returnable ? "TRUE" : "FALSE",
      [PRODUCT_COLUMNS.codAvailable]: product.cod_available === false ? "FALSE" : "TRUE",
      [PRODUCT_COLUMNS.weightG]: product.weight_grams != null ? String(product.weight_grams) : "",
      [PRODUCT_COLUMNS.lengthCm]: product.length_cm != null ? String(product.length_cm) : "",
      [PRODUCT_COLUMNS.breadthCm]: product.breadth_cm != null ? String(product.breadth_cm) : "",
      [PRODUCT_COLUMNS.heightCm]: product.height_cm != null ? String(product.height_cm) : "",
      [PRODUCT_COLUMNS.specifications]: specifications,
      [PRODUCT_COLUMNS.isActive]: product.is_active ? "TRUE" : "FALSE",
    };

    if (product.variants.length === 0) {
      rows.push({
        ...base,
        [PRODUCT_COLUMNS.variantOptions]: "",
        [PRODUCT_COLUMNS.sku]: product.sku ?? "",
        [PRODUCT_COLUMNS.price]: String(product.price),
        [PRODUCT_COLUMNS.stock]: String(product.stock_quantity),
        [PRODUCT_COLUMNS.imageUrl]: product.images?.[0] ?? "",
      });
    } else {
      for (const variant of product.variants) {
        rows.push({
          ...base,
          [PRODUCT_COLUMNS.variantOptions]: stringifyPairs(
            Object.entries(variant.options ?? {}).map(([label, value]) => ({ label, value })),
          ),
          [PRODUCT_COLUMNS.sku]: variant.sku ?? "",
          [PRODUCT_COLUMNS.price]: String(variant.price),
          [PRODUCT_COLUMNS.stock]: String(variant.stock),
          [PRODUCT_COLUMNS.imageUrl]: variant.image_url ?? product.images?.[0] ?? "",
        });
      }
    }
  }

  return rows;
}

export function sampleProductTemplateRows(includeVendorColumn: boolean): Record<string, string>[] {
  const commonBase: Record<string, string> = {
    [PRODUCT_COLUMNS.description]: "Elegant hand-embroidered silk kurti",
    [PRODUCT_COLUMNS.category]: "Kurtis",
    [PRODUCT_COLUMNS.countryOfOrigin]: "India",
    [PRODUCT_COLUMNS.netQuantity]: "1 N",
    [PRODUCT_COLUMNS.returnable]: "TRUE",
    [PRODUCT_COLUMNS.codAvailable]: "TRUE",
    [PRODUCT_COLUMNS.weightG]: "300",
    [PRODUCT_COLUMNS.lengthCm]: "25",
    [PRODUCT_COLUMNS.breadthCm]: "20",
    [PRODUCT_COLUMNS.heightCm]: "5",
    [PRODUCT_COLUMNS.specifications]: "Fabric:Silk;Wash Care:Dry Clean Only;Fit:Regular",
    [PRODUCT_COLUMNS.isActive]: "TRUE",
    [PRODUCT_COLUMNS.imageUrl]: "https://example.com/product-image.jpg",
    ...(includeVendorColumn ? { [PRODUCT_COLUMNS.vendorSlug]: "" } : {}),
  };

  return [
    {
      [PRODUCT_COLUMNS.productId]: "",
      [PRODUCT_COLUMNS.handle]: "silk-embroidered-kurti",
      [PRODUCT_COLUMNS.name]: "Silk Embroidered Kurti",
      ...commonBase,
      [PRODUCT_COLUMNS.variantOptions]: "Size:S;Color:Maroon",
      [PRODUCT_COLUMNS.sku]: "SEK-S-MRN",
      [PRODUCT_COLUMNS.price]: "1499",
      [PRODUCT_COLUMNS.stock]: "10",
    },
    {
      [PRODUCT_COLUMNS.productId]: "",
      [PRODUCT_COLUMNS.handle]: "silk-embroidered-kurti",
      [PRODUCT_COLUMNS.name]: "Silk Embroidered Kurti",
      ...commonBase,
      [PRODUCT_COLUMNS.variantOptions]: "Size:M;Color:Maroon",
      [PRODUCT_COLUMNS.sku]: "SEK-M-MRN",
      [PRODUCT_COLUMNS.price]: "1499",
      [PRODUCT_COLUMNS.stock]: "8",
    },
    {
      [PRODUCT_COLUMNS.productId]: "",
      [PRODUCT_COLUMNS.handle]: "cotton-printed-dupatta",
      [PRODUCT_COLUMNS.name]: "Cotton Printed Dupatta",
      [PRODUCT_COLUMNS.description]: "Lightweight block-printed cotton dupatta",
      [PRODUCT_COLUMNS.category]: "Western Wear",
      [PRODUCT_COLUMNS.countryOfOrigin]: "India",
      [PRODUCT_COLUMNS.netQuantity]: "1 N",
      [PRODUCT_COLUMNS.returnable]: "FALSE",
      [PRODUCT_COLUMNS.codAvailable]: "FALSE",
      [PRODUCT_COLUMNS.weightG]: "150",
      [PRODUCT_COLUMNS.lengthCm]: "20",
      [PRODUCT_COLUMNS.breadthCm]: "15",
      [PRODUCT_COLUMNS.heightCm]: "3",
      [PRODUCT_COLUMNS.specifications]: "Fabric:Cotton;Pattern:Block Print",
      [PRODUCT_COLUMNS.isActive]: "TRUE",
      [PRODUCT_COLUMNS.imageUrl]: "https://example.com/dupatta.jpg",
      ...(includeVendorColumn ? { [PRODUCT_COLUMNS.vendorSlug]: "" } : {}),
      [PRODUCT_COLUMNS.variantOptions]: "",
      [PRODUCT_COLUMNS.sku]: "CPD-001",
      [PRODUCT_COLUMNS.price]: "599",
      [PRODUCT_COLUMNS.stock]: "25",
    },
  ];
}
