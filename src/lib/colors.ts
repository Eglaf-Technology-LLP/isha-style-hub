import { processColor } from 'react-native';

// Colour names boutiques type for variants -> a swatch colour, the same
// table and rules as the website's src/lib/colors.ts. Unknown names get a
// neutral swatch (the name is always shown as its label).
const SWATCHES: Record<string, string> = {
  red: '#b3261e',
  maroon: '#6d1a1a',
  wine: '#5e1224',
  burgundy: '#6b1f2a',
  rust: '#a4492b',
  orange: '#e07a2c',
  peach: '#f2b8a0',
  coral: '#f07b6b',
  pink: '#e8a3b8',
  'blush pink': '#f0c7c2',
  blush: '#efc9c0',
  'baby pink': '#f6cfd7',
  'rani pink': '#c2185b',
  magenta: '#b0136b',
  lavender: '#b9a7d6',
  lilac: '#c8a2c8',
  purple: '#6a3d8f',
  'powder blue': '#b3cde0',
  blue: '#2f5d9e',
  'sky blue': '#87bfe0',
  navy: '#1f2a44',
  'navy blue': '#1f2a44',
  indigo: '#3b3f8f',
  teal: '#1f7a7a',
  mint: '#bfe3cf',
  green: '#3f7a4a',
  'bottle green': '#1f4d32',
  olive: '#6b6b2f',
  mahendi: '#6f7a2b',
  mehendi: '#6f7a2b',
  'mehndi green': '#6f7a2b',
  yellow: '#e8c53a',
  mustard: '#c99a2e',
  gold: '#c8a24a',
  golden: '#c8a24a',
  silver: '#c0c0c6',
  beige: '#d9c6a5',
  cream: '#f1e7d2',
  ivory: '#f5efe0',
  'off white': '#f3efe6',
  white: '#ffffff',
  grey: '#8a8a8a',
  gray: '#8a8a8a',
  brown: '#6e4a32',
  black: '#141414',
  emerald: '#1f7a5a',
  'emerald green': '#1f7a5a',
  'sea green': '#3a9a7a',
  turquoise: '#2fb3b0',
  peacock: '#0f6b78',
  'peacock blue': '#0f6b78',
  'royal blue': '#2546a8',
  rose: '#d98c9b',
  'rose gold': '#c9947f',
  'dusty pink': '#d4a5a5',
  'onion pink': '#e3b4ae',
  fuchsia: '#c2187a',
  champagne: '#e9d6b4',
  nude: '#e2c2a8',
  copper: '#b5653a',
  bronze: '#8c6a3a',
  lemon: '#f0e26a',
  lime: '#a8c94a',
  charcoal: '#36383b',
  'off-white': '#f3efe6',
  tan: '#c19a6b',
  khaki: '#b8a978',
  sand: '#d8c39a',
  'pastel green': '#c8e6c0',
  'pastel pink': '#f5cfd8',
  'pastel blue': '#c7dcef',
};

// Blend a #rrggbb colour towards white (amount > 0) or black (amount < 0).
function shade(hex: string, amount: number): string {
  const target = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  const mix = (i: number) =>
    Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k) + target * k);
  return `#${[1, 3, 5]
    .map(i => mix(i).toString(16).padStart(2, '0'))
    .join('')}`;
}

// A colour React Native knows by name ("teal", "royalblue") - the app's
// stand-in for the website's CSS.supports("color", name).
const namedColour = (name: string) => !!name && processColor(name) != null;

export function swatchColor(name: string): string | null {
  const key = name.trim().toLowerCase();
  if (SWATCHES[key]) return SWATCHES[key];
  // "Light Blue", "Dark Green", "Pale Pink", "Deep Red"...
  const m = key.match(/^(light|pale|dark|deep)[\s-]+(.+)$/);
  const base = m ? SWATCHES[m[2]] : undefined;
  if (m && base)
    return shade(base, m[1] === 'light' || m[1] === 'pale' ? 0.45 : -0.4);
  // Any colour known by name, else the last word ("Bottle Green" -> green).
  const css = key.replace(/[\s-]+/g, '');
  if (namedColour(css)) return css;
  const last = key.split(/[\s-]+/).pop() ?? '';
  if (SWATCHES[last]) return SWATCHES[last];
  return namedColour(last) ? last : null;
}

// "Multicolor" / "Multi": a soft rainbow instead of one colour.
export const isMulticolour = (name: string) => /multi/i.test(name);
export const MULTICOLOUR = [
  '#b3261e',
  '#e8c53a',
  '#3f7a4a',
  '#2f5d9e',
  '#6a3d8f',
] as const;

const HEX_RE = /^#[0-9a-f]{6}$/i;

// Colour name -> the code the boutique picked (options.color_hex), from a
// product's variants.
export function colourCodes(
  variants: { options?: Record<string, string> | null }[] | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of variants ?? []) {
    const name = v.options?.color || v.options?.Color;
    const hex = v.options?.color_hex;
    if (name && hex && HEX_RE.test(hex) && !out[name]) out[name] = hex;
  }
  return out;
}
