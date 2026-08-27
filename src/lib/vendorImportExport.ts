import { parseBoolean, parseNumberOrNull } from "@/lib/excelImportExport";

// Vendors self-register through a separate public signup flow and land in
// "pending" - there is no vendor-account-creation path anywhere in the
// admin UI, not even for a single vendor. Bulk import mirrors that: it can
// only UPDATE existing vendors (matched by the required Vendor ID), never
// create new ones - creating a real login/vendor account is a materially
// different, credential-handling feature this page doesn't support even
// one-at-a-time. The editable columns are exactly the union of what the
// existing single-vendor UI already permits (VendorManagement.tsx's `act`
// and `saveEdit`) - no new capability introduced, just bulk access to the
// same settings.
export const VENDOR_COLUMNS = {
  vendorId: "Vendor ID (required)",
  name: "Store Name (read-only)",
  slug: "Slug (read-only)",
  contactEmail: "Contact Email (read-only)",
  status: "Status (pending/approved/rejected/suspended)",
  isTrusted: "Trusted (TRUE/FALSE)",
  commissionRate: "Commission Rate (%)",
  shippingFlatRate: "Flat Shipping Rate",
  freeShippingThreshold: "Free Shipping Threshold (optional)",
  returnWindowDays: "Return Window (days)",
  description: "Description",
} as const;

const VALID_STATUSES = new Set(["pending", "approved", "rejected", "suspended"]);

export interface VendorImportRow {
  vendorId: string;
  status: string | null;
  is_trusted: boolean | null;
  commission_rate: number | null;
  shipping_flat_rate: number | null;
  free_shipping_threshold: number | null;
  return_window_days: number | null;
  description: string | null;
}

export interface VendorRowError {
  rowNumber: number;
  message: string;
}

export function parseVendorRows(
  rows: Record<string, string>[],
  existingIds: Set<string>,
): { rows: VendorImportRow[]; errors: VendorRowError[] } {
  const errors: VendorRowError[] = [];
  const parsed: VendorImportRow[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const vendorId = row[VENDOR_COLUMNS.vendorId]?.trim();
    if (!vendorId) {
      errors.push({ rowNumber, message: "Vendor ID is required - this can only update existing vendors" });
      return;
    }
    if (!existingIds.has(vendorId)) {
      errors.push({ rowNumber, message: `Vendor ID "${vendorId}" not found` });
      return;
    }

    const statusRaw = row[VENDOR_COLUMNS.status]?.trim().toLowerCase();
    if (statusRaw && !VALID_STATUSES.has(statusRaw)) {
      errors.push({ rowNumber, message: `Status "${statusRaw}" must be one of pending/approved/rejected/suspended` });
      return;
    }

    const isTrustedRaw = row[VENDOR_COLUMNS.isTrusted]?.trim();

    parsed.push({
      vendorId,
      status: statusRaw || null,
      is_trusted: isTrustedRaw ? parseBoolean(isTrustedRaw) : null,
      commission_rate: parseNumberOrNull(row[VENDOR_COLUMNS.commissionRate]),
      shipping_flat_rate: parseNumberOrNull(row[VENDOR_COLUMNS.shippingFlatRate]),
      free_shipping_threshold: parseNumberOrNull(row[VENDOR_COLUMNS.freeShippingThreshold]),
      return_window_days: parseNumberOrNull(row[VENDOR_COLUMNS.returnWindowDays]),
      description: row[VENDOR_COLUMNS.description]?.trim() || null,
    });
  });

  return { rows: parsed, errors };
}

export function vendorsToRows(
  vendors: {
    id: string;
    name: string;
    slug: string;
    contact_email: string | null;
    status: string;
    is_trusted: boolean;
    commission_rate: number;
    shipping_flat_rate: number;
    free_shipping_threshold: number | null;
    return_window_days: number;
    description: string | null;
  }[],
): Record<string, string>[] {
  return vendors.map((v) => ({
    [VENDOR_COLUMNS.vendorId]: v.id,
    [VENDOR_COLUMNS.name]: v.name,
    [VENDOR_COLUMNS.slug]: v.slug,
    [VENDOR_COLUMNS.contactEmail]: v.contact_email ?? "",
    [VENDOR_COLUMNS.status]: v.status,
    [VENDOR_COLUMNS.isTrusted]: v.is_trusted ? "TRUE" : "FALSE",
    [VENDOR_COLUMNS.commissionRate]: String(v.commission_rate),
    [VENDOR_COLUMNS.shippingFlatRate]: String(v.shipping_flat_rate),
    [VENDOR_COLUMNS.freeShippingThreshold]: v.free_shipping_threshold != null ? String(v.free_shipping_threshold) : "",
    [VENDOR_COLUMNS.returnWindowDays]: String(v.return_window_days),
    [VENDOR_COLUMNS.description]: v.description ?? "",
  }));
}
