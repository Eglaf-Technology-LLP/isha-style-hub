// Seller registration rules shared by the application form and the admin
// review. The server repeats every check in submit_vendor_application
// (supabase/migrations/20261024100000_seller_form_part7.sql) - keep the
// document lists in sync with vendor_required_documents() and the field
// rules with normalize_indian_mobile / normalize_instagram_profile /
// normalize_website_url.

export type BusinessConstitution = "proprietorship" | "partnership" | "llp" | "private_limited" | "huf";

export const CONSTITUTIONS: { value: BusinessConstitution; label: string; description: string }[] = [
  { value: "proprietorship", label: "Proprietorship", description: "Business owned and operated by one proprietor." },
  { value: "partnership", label: "Partnership Firm", description: "Business owned by two or more partners." },
  { value: "llp", label: "Limited Liability Partnership (LLP)", description: "Partnership structure with limited liability." },
  {
    value: "private_limited",
    label: "Private Limited Company",
    description: "Company incorporated as a private limited company.",
  },
  { value: "huf", label: "HUF (Hindu Undivided Family)", description: "Family business run by the Karta." },
];

export type DocumentType =
  | "pan_card"
  | "aadhaar_card"
  | "gst_certificate"
  | "msme_certificate"
  | "partnership_deed"
  | "rof_certificate"
  | "llp_incorporation"
  | "company_incorporation"
  | "bank_proof";

export interface DocumentRequirement {
  type: DocumentType;
  label: string;
  optional?: boolean;
}

const GST: DocumentRequirement = { type: "gst_certificate", label: "GST Registration Certificate" };
const MSME: DocumentRequirement = { type: "msme_certificate", label: "MSME / Udyam Certificate", optional: true };

// Business documents per business type, as listed in Developer Corrections
// Part 7 (bank proof is asked for in the bank section, for every type).
export const DOCUMENTS_BY_CONSTITUTION: Record<BusinessConstitution, DocumentRequirement[]> = {
  proprietorship: [
    GST,
    { type: "pan_card", label: "Proprietor PAN Card" },
    { type: "aadhaar_card", label: "Proprietor Aadhaar Card" },
    MSME,
  ],
  partnership: [
    GST,
    { type: "pan_card", label: "Firm PAN Card" },
    { type: "aadhaar_card", label: "Authorised Partner Aadhaar Card" },
    { type: "partnership_deed", label: "Partnership Deed" },
    { type: "rof_certificate", label: "Registration of Firm (ROF) Certificate", optional: true },
  ],
  llp: [
    GST,
    { type: "pan_card", label: "LLP PAN Card" },
    { type: "aadhaar_card", label: "Designated Partner Aadhaar Card" },
    { type: "llp_incorporation", label: "Certificate of Incorporation" },
  ],
  private_limited: [
    GST,
    { type: "pan_card", label: "Company PAN Card" },
    { type: "aadhaar_card", label: "Authorised Director Aadhaar Card" },
    { type: "company_incorporation", label: "Certificate of Incorporation" },
  ],
  huf: [
    { type: "pan_card", label: "HUF PAN Card" },
    GST,
    { type: "aadhaar_card", label: "Authorised Person (Karta) Aadhaar Card" },
    MSME,
  ],
};

export const BANK_PROOF_TYPES = [
  { value: "cancelled_cheque", label: "Cancelled cheque" },
  { value: "bank_letter", label: "Bank letter" },
  { value: "bank_statement", label: "Bank statement" },
] as const;
export type BankProofType = (typeof BANK_PROOF_TYPES)[number]["value"];

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

// Payout account business types, written the way people read them
// ("Private Limited", not "private limited").
const BUSINESS_TYPE_LABELS: Record<string, string> = {
  individual: "Individual",
  proprietorship: "Proprietorship",
  partnership: "Partnership",
  private_limited: "Private Limited",
  llp: "LLP",
  huf: "HUF",
};

export function businessTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return BUSINESS_TYPE_LABELS[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function constitutionLabel(value: string | null | undefined): string {
  return CONSTITUTIONS.find((c) => c.value === value)?.label ?? "—";
}

export function documentLabel(constitution: BusinessConstitution | null, type: string): string {
  if (type === "bank_proof") return "Bank Proof";
  const fromList = constitution ? DOCUMENTS_BY_CONSTITUTION[constitution].find((d) => d.type === type) : undefined;
  return fromList?.label ?? type.replace(/_/g, " ");
}

// ---------- validation (same rules as the server) ----------

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_RE = /^[0-9]{9,18}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 10-digit Indian mobile, accepting +91 / 91 in front, spaces and leading
// zeros (dropped - a leading 0 stops the call); null if invalid.
export function normalizeMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "");
  return /^[6-9][0-9]{9}$/.test(digits) ? digits : null;
}

// What a mobile box keeps while typing: an optional "+91 " and at most 10
// digits, with a leading 0 removed straight away.
export function cleanMobileInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const plus = raw.trim().startsWith("+");
  if (plus && digits.length < 2) return `+${digits}`;
  const hasPrefix = (plus || digits.length > 10) && digits.startsWith("91");
  const local = (hasPrefix ? digits.slice(2) : digits).replace(/^0+/, "").slice(0, 10);
  return hasPrefix ? `+91 ${local}` : local;
}

export const PIN_RE = /^[1-9][0-9]{5}$/;
export const ADDRESS_LINE1_MIN = 10;

// Instagram: only a profile link (instagram.com/<username>), stored as
// https://www.instagram.com/<username>. Same rule as the server's
// normalize_instagram_profile().
const INSTAGRAM_RE = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:\?\S*)?$/i;
const INSTAGRAM_NOT_PROFILES = ["p", "reel", "reels", "stories", "explore", "tv", "accounts", "direct", "about", "legal", "developer", "web", "share"];

export function normalizeInstagram(raw: string): string | null {
  const m = raw.trim().match(INSTAGRAM_RE);
  if (!m || INSTAGRAM_NOT_PROFILES.includes(m[1].toLowerCase())) return null;
  return `https://www.instagram.com/${m[1].toLowerCase()}`;
}

// Why an Instagram entry isn't a profile link, in the seller's terms.
export function instagramProblem(raw: string): string | null {
  const text = raw.trim();
  if (!text) return "Paste your Instagram profile link";
  if (normalizeInstagram(text)) return null;
  if (EMAIL_RE.test(text)) return "This is an email address. Paste your Instagram profile link instead.";
  if (/instagram\.com\/(p|reels?|stories|tv)\//i.test(text)) {
    return "This is a post, reel or story link. Paste your profile link instead (instagram.com/yourboutique).";
  }
  if (!/instagram\.com/i.test(text)) {
    return "Paste the full link, not just your username - e.g. https://www.instagram.com/yourboutique";
  }
  return "Only your Instagram profile link is accepted - e.g. https://www.instagram.com/yourboutique";
}

// "@username" from a stored profile link.
export const instagramHandle = (url: string | null | undefined) => {
  const m = url?.match(INSTAGRAM_RE);
  return m ? `@${m[1].toLowerCase()}` : null;
};

// Website (optional): https:// is added when missing. Same rule as the
// server's normalize_website_url().
export function normalizeWebsite(raw: string): string | null {
  const text = raw.trim();
  const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  return url.length <= 300 && /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]+)?(\/\S*)?$/i.test(url) ? url : null;
}

// The tick shown when the Boutique / Brand Name differs from the Legal
// Business Name (Developer Corrections Part 7, 3.2).
export const BRAND_LEGAL_DECLARATION =
  "I confirm that the Boutique / Brand Name stated above operates under, is owned by, or is associated with the Legal Business Name stated above (Proprietorship, Partnership Firm, LLP, Private Limited Company or HUF), and I am authorised to make this declaration.";

// A PDF small enough to upload, or the reason it isn't.
export function documentFileProblem(file: File): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Upload a PDF file";
  if (file.size > DOCUMENT_MAX_BYTES) return "PDF must be 10 MB or smaller";
  return null;
}
