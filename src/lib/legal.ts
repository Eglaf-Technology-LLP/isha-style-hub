// AllBoutiqs' policy pages. LEGAL_UPDATED is the date shown on the Privacy
// Policy and the customer Terms & Conditions, and the version a customer
// accepts (profiles.terms_version) - change it whenever their text changes.
export const LEGAL_UPDATED = "2026-11-13";

// The Terms & Working Process for boutiques (client's Version 2.2, November
// 2026). SELLER_TERMS_UPDATED is the version a seller accepts
// (profiles.seller_terms_version, vendor_kyc.terms_version) - change both
// whenever its text changes.
export const SELLER_TERMS_VERSION = "2.2";
export const SELLER_TERMS_UPDATED = "2026-11-27";

// The FAQ for customers and boutiques (client's Version 1.0, November 2026).
export const FAQ_VERSION = "1.0";

// Every page here is open to everyone - staff in staff-only mode, and
// visitors who haven't accepted the terms yet (ConsentGate).
export const LEGAL_PATHS = {
  privacy: "/privacy-policy",
  terms: "/terms",
  sellerTerms: "/seller-terms",
  // Footer pages (client corrections, 15 Nov 2026). Not part of what a
  // customer or seller accepts, so they carry their own date, not
  // LEGAL_UPDATED.
  shipping: "/shipping-policy",
  returns: "/return-refund-policy",
  about: "/about-us",
  contact: "/contact-us",
  faq: "/faq",
} as const;

// Date shown on the Shipping and Return & Refund policies.
export const STORE_POLICIES_UPDATED = "2026-11-16";

// The fixed courier charge by category, as the Terms & Working Process
// (Point 7) and the FAQ state it. Text only: payouts still take
// platform_rates.logistics_fee_per_piece per piece.
export const COURIER_RATE_CARD = [
  {
    charge: "₹350",
    categories:
      "Dress, Kaftan, Jumpsuit, Jacket / Shrug, Blouse, Corset / Bustier, Kurti / Tunic, Top, Shirt, Pants / Palazzo, Dupatta",
  },
  {
    charge: "₹460",
    categories:
      "Saree, Pre-Draped Saree, Lehenga Saree, Kurta Set, Salwar / Churidar Set, Anarkali Set, Sharara / Gharara Set, Pant / Palazzo Set, Dhoti Set, Angrakha Set, Co-ord Set, Gown, Indo-Western Set, Cape Set, Jacket Set, Skirt",
  },
  { charge: "₹650", categories: "Lehenga Set, Bridal Lehenga, Bridal Gown" },
] as const;
