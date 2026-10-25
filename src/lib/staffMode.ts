import { LEGAL_PATHS } from "./legal";

// Staff see only their own area (2026-10-16): an admin who signs in gets only
// the admin panel (and the warehouse tool), a boutique only its vendor area -
// the customer storefront isn't open to them. Shoppers are unaffected. All
// the storefront code is kept; set to false to let staff use the store again.
export const STAFF_ONLY_MODE = true;

export type StaffRole = "admin" | "vendor" | "customer" | "guest";

// Where each staff role may go (path prefixes) and where it's sent otherwise.
export const STAFF_AREAS: Record<"admin" | "vendor", { home: string; paths: string[] }> = {
  admin: { home: "/admin", paths: ["/admin", "/warehouse"] },
  vendor: { home: "/vendor", paths: ["/vendor", "/sell-with-us"] },
};

// Open to everyone, staff included: the policy pages (sellers must be able
// to read what they agreed to).
const OPEN_PATHS: string[] = Object.values(LEGAL_PATHS);

export function staffRedirect(role: StaffRole, pathname: string): string | null {
  if (!STAFF_ONLY_MODE || (role !== "admin" && role !== "vendor")) return null;
  if (OPEN_PATHS.includes(pathname)) return null;
  const area = STAFF_AREAS[role];
  return area.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ? null : area.home;
}
