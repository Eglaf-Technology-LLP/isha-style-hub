import { toE164 } from './auth';
import { supabase } from './supabase';

// Complaint form - the website's src/components/ComplaintForm.tsx. The
// submit-complaint edge function gives it a ticket number, saves it, emails
// it to the admins and emails the customer a confirmation.

// Same keys and words as CATEGORIES in supabase/functions/submit-complaint.
export const COMPLAINT_CATEGORIES: { value: string; label: string }[] = [
  { value: 'order', label: 'My order' },
  { value: 'delivery', label: 'Delivery or tracking' },
  { value: 'return_refund', label: 'Return, exchange or refund' },
  { value: 'payment', label: 'Payment or charges' },
  { value: 'product', label: 'Product quality or wrong item' },
  { value: 'boutique', label: 'A boutique (seller)' },
  { value: 'website', label: 'Website or my account' },
  { value: 'other', label: 'Something else' },
];

export const COMPLAINT_MESSAGE_MIN = 20;
export const COMPLAINT_MESSAGE_MAX = 3000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ComplaintFields = {
  name: string;
  email: string;
  phone: string;
  category: string;
  orderNumber: string;
  message: string;
};
export type ComplaintErrors = Partial<Record<keyof ComplaintFields, string>>;

export const EMPTY_COMPLAINT: ComplaintFields = {
  name: '',
  email: '',
  phone: '',
  category: '',
  orderNumber: '',
  message: '',
};

export function checkComplaint(f: ComplaintFields): ComplaintErrors {
  const e: ComplaintErrors = {};
  if (f.name.trim().length < 2) e.name = 'Enter your full name.';
  if (!EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email address.';
  if (!toE164(f.phone)) e.phone = 'Enter a valid 10-digit mobile number.';
  if (!f.category) e.category = 'Choose what your complaint is about.';
  const len = f.message.trim().length;
  if (len < COMPLAINT_MESSAGE_MIN)
    e.message = `Please tell us a little more (at least ${COMPLAINT_MESSAGE_MIN} characters).`;
  else if (len > COMPLAINT_MESSAGE_MAX)
    e.message = `Please keep it under ${COMPLAINT_MESSAGE_MAX} characters.`;
  return e;
}

// "9876543210" for an Indian number (what the form expects), anything else
// as given. Accepts "+919876543210" or "919876543210" (user.phone has no +).
export function nationalPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const e164 = toE164(phone) ?? toE164(`+${phone.replace(/\D/g, '')}`);
  if (!e164) return phone;
  return e164.startsWith('+91') && e164.length === 13 ? e164.slice(3) : e164;
}

// The ticket number, or the function's own error message. Signed-in people
// are sent with their session, so the complaint is linked to the account.
export async function submitComplaint(
  f: ComplaintFields,
): Promise<
  { ticket: string; ackSent: boolean; error?: undefined } | { error: string }
> {
  const { data, error } = await supabase.functions.invoke('submit-complaint', {
    body: {
      name: f.name.trim(),
      email: f.email.trim(),
      phone: f.phone.trim(),
      category: f.category,
      order_number: f.orderNumber.trim(),
      message: f.message.trim(),
      // The website's hidden bot-trap field; people (and the app) leave it empty.
      company_fax: '',
    },
  });
  if (error) {
    let message =
      "Couldn't reach AllBoutiqs. Check your connection and try again.";
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) message = String(body.error);
    } catch {
      // no JSON body (network failure)
    }
    return { error: message };
  }
  if (!data?.ticket)
    return {
      error: data?.error
        ? String(data.error)
        : 'Something went wrong. Please try again.',
    };
  return { ticket: String(data.ticket), ackSent: data.ack_sent === true };
}
