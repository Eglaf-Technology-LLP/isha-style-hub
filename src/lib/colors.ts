// Colour names boutiques type for variants -> a swatch colour. Unknown names
// get a neutral swatch (the name is always shown as its label/tooltip).
const SWATCHES: Record<string, string> = {
  red: "#b3261e",
  maroon: "#6d1a1a",
  wine: "#5e1224",
  burgundy: "#6b1f2a",
  rust: "#a4492b",
  orange: "#e07a2c",
  peach: "#f2b8a0",
  coral: "#f07b6b",
  pink: "#e8a3b8",
  "blush pink": "#f0c7c2",
  blush: "#efc9c0",
  "baby pink": "#f6cfd7",
  "rani pink": "#c2185b",
  magenta: "#b0136b",
  lavender: "#b9a7d6",
  lilac: "#c8a2c8",
  purple: "#6a3d8f",
  "powder blue": "#b3cde0",
  blue: "#2f5d9e",
  "sky blue": "#87bfe0",
  navy: "#1f2a44",
  "navy blue": "#1f2a44",
  indigo: "#3b3f8f",
  teal: "#1f7a7a",
  mint: "#bfe3cf",
  green: "#3f7a4a",
  "bottle green": "#1f4d32",
  olive: "#6b6b2f",
  mahendi: "#6f7a2b",
  mehendi: "#6f7a2b",
  "mehndi green": "#6f7a2b",
  yellow: "#e8c53a",
  mustard: "#c99a2e",
  gold: "#c8a24a",
  golden: "#c8a24a",
  silver: "#c0c0c6",
  beige: "#d9c6a5",
  cream: "#f1e7d2",
  ivory: "#f5efe0",
  "off white": "#f3efe6",
  white: "#ffffff",
  grey: "#8a8a8a",
  gray: "#8a8a8a",
  brown: "#6e4a32",
  black: "#141414",
};

export function swatchColor(name: string): string | null {
  return SWATCHES[name.trim().toLowerCase()] ?? null;
}

// For colours like "Multicolor" / "Multi" a soft rainbow ring.
export function isMulticolour(name: string): boolean {
  return /multi/i.test(name);
}
