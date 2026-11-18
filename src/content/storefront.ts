import heroFashion from '../../assets/hero-fashion.jpg';

// Static storefront content (the website's src/content/storefront.ts).
//
// The home page banner slides are edited by admins (Admin > Home Banner,
// table hero_slides). HERO_SLIDES below is only the fallback shown if that
// table can't be read; a slide without a photo shows the maroon design.

export interface HeroSlide {
  id: string;
  eyebrow?: string;
  title?: string;
  // Second line, set in italic.
  titleAccent?: string;
  subtitle?: string;
  // A link without a label makes the whole slide tappable, with no button.
  cta?: { label?: string; href: string };
  secondaryCta?: { label: string; href: string };
  // A URL (or website path), or a photo bundled with the app.
  image?: string | number;
  // Used instead of `image` on phones, for a portrait crop.
  mobileImage?: string;
  // The website's background video. The app has no video player, so it
  // shows the photo instead.
  video?: string;
  // Where the text sits over the picture.
  align?: 'left' | 'center';
  // Darkening over the picture so white text reads; off for banners whose
  // text is already in the picture. Default on.
  overlay?: boolean;
}

// The website's own copy of the first slide's photo (the hero_slides seed
// points at it); the app shows its bundled copy instead of downloading it.
export const BUNDLED_HERO_IMAGES: Record<string, number> = {
  '/hero/hero-fashion.jpg': heroFashion,
};

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'wedding',
    eyebrow: 'The Wedding Edit',
    title: 'Heirlooms in the making,',
    titleAccent: 'for your big day',
    subtitle:
      "Bridal lehengas and festive sarees, hand-picked from India's finest boutiques.",
    cta: { label: 'Shop the edit', href: '/category/lehenga' },
    secondaryCta: { label: 'Explore sarees', href: '/category/sarees' },
    image: heroFashion,
    align: 'left',
  },
  {
    id: 'boutiques',
    eyebrow: 'One address',
    title: "India's boutiques,",
    titleAccent: 'under one roof',
    subtitle:
      "Ethnic, western and party wear from India's best boutiques and designer brands.",
    cta: { label: 'Meet the boutiques', href: '/boutiques' },
    secondaryCta: { label: 'New in', href: '/category/all?sort=newest' },
    align: 'center',
  },
  {
    id: 'made-to-order',
    eyebrow: 'Made for you',
    title: 'Crafted to order,',
    titleAccent: 'finished by hand',
    subtitle:
      'Pieces made the moment you order them - and checked at our quality centre before they reach you.',
    cta: {
      label: 'Shop made to order',
      href: '/category/all?availability=made-to-order',
    },
    align: 'center',
  },
];
