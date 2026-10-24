// Indian price formatting for the storefront: ₹5,499 (no decimals unless
// there are paise).
export function formatINR(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "₹0";
  const hasPaise = Math.round(n * 100) % 100 !== 0;
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  })}`;
}

// Whole-number discount off the MRP, or null when there isn't one.
export function discountPercent(price: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

// Money with paise, Indian grouping: ₹2,277.99, ₹1,00,000.00 - for the
// seller dashboard, statements, invoices and emails, where every amount is
// shown the same way (Developer Corrections Part 8, 6 and 12).
export function formatMoney(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  const value = Number.isFinite(n) ? n : 0;
  const text = Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? "-" : ""}₹${text}`;
}
