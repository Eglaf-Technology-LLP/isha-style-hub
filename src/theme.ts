// The AllBoutiqs design system for the app - the same maroon, ivory and
// antique-gold palette and Jost / Playfair Display type as the website
// (src/index.css in the repo root, converted from HSL to hex).

export const colors = {
  background: '#F6F4EE', // --background 40 33% 95%
  foreground: '#231F1A', // --foreground 30 15% 12%
  ivory: '#FCFBF8', // --ivory 40 45% 98%
  primary: '#7E3626', // --primary 11 54% 32% (maroon)
  primaryForeground: '#F8F5EF',
  maroonDeep: '#4E1D13', // --maroon-deep 10 60% 19%
  gold: '#B58A4A', // --gold 36 42% 50%
  goldSoft: 'rgba(181,138,74,0.35)',
  ink: '#1B1613', // --ink 24 18% 9%
  muted: '#EBE7E0', // --muted 40 20% 90%
  mutedForeground: '#6B6157', // --muted-foreground 30 10% 38%
  accent: '#EFEAE1', // --accent 40 30% 91%
  border: '#DEDAD3', // --border 40 15% 85%
  destructive: '#AB382B',
  success: '#2F6B3F',
  white: '#FFFFFF',
} as const;

export const fonts = {
  // PostScript names of the bundled files in assets/fonts (same on Android and iOS).
  sans: 'Jost-Regular',
  sansMedium: 'Jost-Medium',
  sansSemi: 'Jost-SemiBold',
  serif: 'PlayfairDisplay-Regular',
  serifItalic: 'PlayfairDisplay-Italic',
  serifMedium: 'PlayfairDisplay-Medium',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// The site uses near-square corners (--radius 0.25rem).
export const radius = { sm: 2, md: 4, pill: 999 } as const;

// Small spaced capitals above headings ("NEW IN", "THE EDIT").
export const eyebrow = {
  fontFamily: fonts.sansMedium,
  fontSize: 11,
  letterSpacing: 2.6,
  textTransform: 'uppercase' as const,
  color: colors.gold,
};
