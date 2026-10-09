// Seller registration rules shared by the application form and the admin
// review. The server repeats every check in submit_vendor_application
// (supabase/migrations/20261010130000_vendor_registration_kyc.sql) - keep
// the document lists in sync with vendor_required_documents().

export type BusinessConstitution = "proprietorship" | "partnership" | "llp" | "private_limited";

export const CONSTITUTIONS: { value: BusinessConstitution; label: string; description: string }[] = [
  { value: "proprietorship", label: "Proprietorship", description: "Business owned and operated by one proprietor." },
  { value: "partnership", label: "Partnership Firm", description: "Business owned by two or more partners." },
  { value: "llp", label: "Limited Liability Partnership (LLP)", description: "Partnership structure with limited liability." },
  {
    value: "private_limited",
    label: "Private Limited Company",
    description: "Company incorporated as a private limited company.",
  },
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

const AUTHORIZED_AADHAAR: DocumentRequirement = { type: "aadhaar_card", label: "Authorized Person Aadhaar Card" };
const GST: DocumentRequirement = { type: "gst_certificate", label: "GST Registration Certificate" };

// Business documents per constitution (bank proof is asked for in the bank
// section, for every constitution).
export const DOCUMENTS_BY_CONSTITUTION: Record<BusinessConstitution, DocumentRequirement[]> = {
  proprietorship: [
    { type: "pan_card", label: "Proprietor PAN Card" },
    { type: "aadhaar_card", label: "Proprietor Aadhaar Card" },
    GST,
    { type: "msme_certificate", label: "MSME Certificate", optional: true },
  ],
  partnership: [
    { type: "pan_card", label: "PAN Card (firm)" },
    GST,
    { type: "partnership_deed", label: "Partnership Deed" },
    { type: "rof_certificate", label: "ROF (Register of Firms) Certificate" },
    AUTHORIZED_AADHAAR,
  ],
  llp: [
    { type: "pan_card", label: "PAN Card (LLP)" },
    GST,
    { type: "llp_incorporation", label: "LLP Incorporation / Registration Document" },
    AUTHORIZED_AADHAAR,
  ],
  private_limited: [
    { type: "pan_card", label: "PAN Card (company)" },
    GST,
    { type: "company_incorporation", label: "Company Incorporation / Registration Document" },
    AUTHORIZED_AADHAAR,
  ],
};

export const BANK_PROOF_TYPES = [
  { value: "cancelled_cheque", label: "Cancelled cheque" },
  { value: "bank_letter", label: "Bank letter" },
  { value: "bank_statement", label: "Bank statement" },
] as const;
export type BankProofType = (typeof BANK_PROOF_TYPES)[number]["value"];

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

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

// 10-digit Indian mobile, accepting +91 / 0 prefixes and spaces; null if invalid.
export function normalizeMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9][0-9]{9}$/.test(digits) ? digits : null;
}

// A PDF small enough to upload, or the reason it isn't.
export function documentFileProblem(file: File): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Upload a PDF file";
  if (file.size > DOCUMENT_MAX_BYTES) return "PDF must be 10 MB or smaller";
  return null;
}
