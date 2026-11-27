// A minus amount is always red (client, 27 Nov 2026: "True Net Platform
// Revenue -₹14,328.54" showed in green). A plain red, not the theme's brick
// "destructive", which reads like the maroon used for ordinary totals.
export const MINUS_AMOUNT = "text-red-600 dark:text-red-400";

// The colour for an amount that can go either way: red below zero,
// `positive` (e.g. "text-green-600") otherwise.
export function amountTone(n: number, positive = ""): string {
  return n < 0 ? MINUS_AMOUNT : positive;
}
