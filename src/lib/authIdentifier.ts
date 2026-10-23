import type { User } from "@supabase/supabase-js";

// What someone typed into "Email or mobile number": an email address, or a
// mobile number. Indian numbers can be typed as 10 digits (98765 43210),
// with 0 or 91 in front, or as +91...; other countries need the + form.
export type Identifier = { kind: "email"; value: string } | { kind: "phone"; value: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseIdentifier(raw: string): Identifier | null {
  const text = raw.trim();
  if (text.includes("@")) {
    const email = text.toLowerCase();
    return email.length <= 254 && EMAIL_RE.test(email) ? { kind: "email", value: email } : null;
  }
  const phone = toE164(text);
  return phone ? { kind: "phone", value: phone } : null;
}

// "+919876543210" (Supabase's phone format, with the +), or null.
export function toE164(raw: string): string | null {
  const text = raw.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(text)) return null;
  if (text.startsWith("+")) return /^\+[1-9]\d{7,14}$/.test(text) ? text : null;
  const indian = text.replace(/^(91|0)(?=[6-9]\d{9}$)/, "");
  return /^[6-9]\d{9}$/.test(indian) ? `+91${indian}` : null;
}

// Before the whole number is typed: does it look like a phone so far?
export const looksLikePhone = (raw: string) => /^\+?[\d\s\-().]+$/.test(raw.trim()) && /\d/.test(raw);

// "+91 98765 43210" for Indian numbers; other numbers as given.
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return `+${digits}`;
}

// How to show who is signed in: their email, else their mobile number.
export const userContact = (user: User | null | undefined) => user?.email || formatPhone(user?.phone) || "";

// Set when the person chooses their own password (accounts start with only
// one-time codes). A display hint only - it lives in user_metadata.
export const hasOwnPassword = (user: User | null | undefined) => !!user?.user_metadata?.password_set;

export const PASSWORD_MIN_LENGTH = 8;
