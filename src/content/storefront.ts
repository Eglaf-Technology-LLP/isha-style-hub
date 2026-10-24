import heroFashion from "@/assets/hero-fashion.jpg";

// Static storefront content: hero slides, curated tiles and brand copy.
// Everything here is editorial - products, categories and boutiques always
// come live from the database. To change a banner, swap its `image` (or add
// a `video` mp4 URL) and text here; anything without an image falls back to
// the on-brand pattern design.

export interface HeroSlide {
  id: string;
  eyebrow: string;
  title: string;
  // Second line, set in italic.
  titleAccent?: string;
  subtitle: string;
  cta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  image?: string;
  // Optional muted, looping background video (mp4); the image is its poster.
  video?: string;
  // Where the text sits over the picture.
  align?: "left" | "center";
}

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: "wedding",
    eyebrow: "The Wedding Edit",
    title: "Heirlooms in the making,",
    titleAccent: "for your big day",
    subtitle: "Bridal lehengas and festive sarees, hand-picked from India's finest boutiques.",
    cta: { label: "Shop the edit", href: "/category/lehenga" },
    secondaryCta: { label: "Explore sarees", href: "/category/sarees" },
    image: heroFashion,
    align: "left",
  },
  {
    id: "boutiques",
    eyebrow: "One address",
    title: "India's boutiques,",
    titleAccent: "under one roof",
    subtitle: "Ethnic, western and party wear from India's best boutiques and designer brands.",
    cta: { label: "Meet the boutiques", href: "/boutiques" },
    secondaryCta: { label: "New in", href: "/category/all?sort=newest" },
    align: "center",
  },
  {
    id: "made-to-order",
    eyebrow: "Made for you",
    title: "Crafted to order,",
    titleAccent: "finished by hand",
    subtitle: "Pieces made the moment you order them - and checked at our quality centre before they reach you.",
    cta: { label: "Shop made to order", href: "/category/all?availability=made-to-order" },
    align: "center",
  },
];

// "For every occasion" - each tile opens a category (by its slug). A tile
// shows the category's own image, else a product photo from it, else the
// pattern design. Tiles whose category doesn't exist are skipped.
export interface OccasionTile {
  label: string;
  categorySlug: string;
  blurb: string;
}

export const OCCASIONS: OccasionTile[] = [
  { label: "Bridal", categorySlug: "lehenga", blurb: "Lehengas for the big day" },
  { label: "Festive", categorySlug: "sarees", blurb: "Silks, tissues and drapes" },
  { label: "Everyday", categorySlug: "kurti", blurb: "Kurtis that go anywhere" },
  { label: "Contemporary", categorySlug: "western-wear", blurb: "Dresses and co-ords" },
];

export interface BudgetTile {
  label: string;
  note: string;
  min?: number;
  max?: number;
}

export const BUDGETS: BudgetTile[] = [
  { label: "Under ₹1,999", note: "Everyday finds", max: 1999 },
  { label: "₹2,000 – ₹4,999", note: "Festive favourites", min: 2000, max: 4999 },
  { label: "₹5,000 – ₹9,999", note: "Occasion wear", min: 5000, max: 9999 },
  { label: "₹10,000 & above", note: "Luxe & bridal", min: 10000 },
];

export function budgetHref(b: BudgetTile): string {
  const params = new URLSearchParams();
  if (b.min) params.set("min", String(b.min));
  if (b.max) params.set("max", String(b.max));
  return `/category/all?${params.toString()}`;
}

// What AllBoutiqs promises - each line matches how the platform really works
// (boutique KYC, warehouse quality check, doorstep return pickup, COD rules).
export const PROMISES = [
  {
    icon: "verified",
    title: "Verified boutiques",
    text: "Every boutique is checked and verified before it can sell on AllBoutiqs.",
  },
  {
    icon: "quality",
    title: "Quality-checked by us",
    text: "Each piece is inspected at our quality centre before it's packed and sent to you.",
  },
  {
    icon: "returns",
    title: "Easy returns",
    text: "Return or exchange within the boutique's return window - picked up from your door.",
  },
  {
    icon: "secure",
    title: "Secure payments",
    text: "UPI, cards and netbanking, with Cash on Delivery on eligible pieces.",
  },
] as const;

export function announcementMessages(shippingCharged: boolean): string[] {
  return [
    shippingCharged ? "Free shipping on orders above ₹999" : "Free shipping on every order",
    "Every piece quality-checked before it ships",
    "Use code ALLBOUTIQS10 for 10% off your first order",
  ];
}

export const POPULAR_SEARCHES = ["Lehenga", "Silk saree", "Kurti set", "Co-ord", "Banarasi", "Anarkali"];
