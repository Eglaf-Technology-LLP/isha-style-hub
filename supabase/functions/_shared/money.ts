// ₹2,277.99 - money in emails and messages always with paise and Indian
// commas (Developer Corrections Part 8, 12). Same style as the site's
// formatMoney in src/lib/format.ts.
export const money = (n: number | string | null | undefined): string => {
  const v = Number(n ?? 0);
  const value = Number.isFinite(v) ? v : 0;
  return `${value < 0 ? "-" : ""}₹${Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
