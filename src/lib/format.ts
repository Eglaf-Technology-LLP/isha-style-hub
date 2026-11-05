// Same rules as the website's src/lib/format.ts.

// Indian price formatting: ₹5,499 (no decimals unless there are paise).
// Grouping is done by hand - Hermes' Intl support varies by device.
export function formatINR(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return '₹0';
  const hasPaise = Math.round(n * 100) % 100 !== 0;
  const [whole, paise] = Math.abs(n)
    .toFixed(hasPaise ? 2 : 0)
    .split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = rest ? `${rest},${last3}` : last3;
  return `${n < 0 ? '-' : ''}₹${grouped}${paise ? `.${paise}` : ''}`;
}

// Whole-number discount off the MRP, or null when there isn't one.
export function discountPercent(
  price: number,
  compareAt: number | null | undefined,
): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}
