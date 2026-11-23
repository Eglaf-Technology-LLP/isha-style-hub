// How an invoice / credit note line names the piece: "Lehnga – XS – Black" -
// name, size and colour once each (client corrections Part 2, A10.2, and 24
// Nov 2026). New lines are written that way by supabase/functions/_shared/
// invoice.ts; lines issued before 18 Nov 2026 read "Lehnga (XS / Black)" and
// are shown the new way here.

// "Lehnga – XS" has "XS" as a word of its own; "Lehnga" doesn't have "L".
// Same check as hasWord in supabase/functions/_shared/invoice.ts.
export function hasWord(text: string, word: string): boolean {
  const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return !!escaped && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

export function invoiceLineDescription(description: string, color?: string | null): string {
  let text = description;
  // An older line: "Name (XS / Black)" -> "Name – XS – Black".
  const old = description.match(/^(.*\S) \(([^()]+)\)$/);
  if (old) {
    const [, name, variant] = old;
    const parts = variant
      .split("/")
      .map((p) => p.trim())
      .filter((p) => p && p !== "Default" && !hasWord(name, p));
    text = [name, ...parts].join(" – ");
  }
  // A part said twice ("Kurta Set – Mustard – L – Mustard", from a name that
  // already had the colour) is shown once.
  const seen = new Set<string>();
  text = text
    .split(" – ")
    .filter((part) => {
      const key = part.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" – ");
  // The colour, if the line doesn't name it yet.
  if (color && !hasWord(text, color)) text = `${text} – ${color}`;
  return text;
}

// A credit note is issued when an invoiced part is cancelled or comes back
// undelivered, or when a return of it completes (the part stays delivered).
export function mayHaveCreditNote(vendorOrderStatus: string | null | undefined, hasCompletedReturn = false): boolean {
  return vendorOrderStatus === "cancelled" || vendorOrderStatus === "returned" || hasCompletedReturn;
}
