// AllBoutiqs' policy pages. LEGAL_UPDATED is the date shown on them and the
// version a seller accepts at sign-up (vendor_kyc.terms_version) - change it
// whenever their text changes.
export const LEGAL_UPDATED = "2026-11-13";

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
