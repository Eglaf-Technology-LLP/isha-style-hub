// An order line's size and colour, said once: "Size XS · Colour Red" (client,
// 27 Nov 2026 - it read "XS / Red · Size: XS · Colour: Red"). The variant
// name ("XS / Red") only repeats them, so just what it adds beyond the size
// and colour is kept; a line with neither shows its variant name.
// Same rules as src/lib/itemOptions.ts (the screens).
export interface ItemOptions {
  variant_title?: string | null;
  size?: string | null;
  color?: string | null;
}

export function itemOptionsLabel({ variant_title, size, color }: ItemOptions): string {
  const s = size?.trim() || null;
  const c = color?.trim() || null;
  const taken = [s, c].filter((v): v is string => !!v).map((v) => v.toLowerCase());
  const extra = (variant_title ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part.toLowerCase() !== "default" && !taken.includes(part.toLowerCase()));
  return [s && `Size ${s}`, c && `Colour ${c}`, ...extra].filter(Boolean).join(" · ");
}
