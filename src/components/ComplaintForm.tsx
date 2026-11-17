import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProfile } from "@/hooks/useProfile";
import { nationalPhone, toE164 } from "@/lib/authIdentifier";
import { COMPANY } from "@/lib/company";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

// Complaint form (client list 2.11.2), opened from the footer and Contact us.
// supabase/functions/submit-complaint gives it a ticket number, emails it to
// the admins and the Grievance Officer, and emails the customer a
// confirmation. It isn't saved or shown anywhere on the site (client, 17 Nov
// 2026).

// Same keys and words as CATEGORIES in supabase/functions/submit-complaint.
const CATEGORIES: { value: string; label: string }[] = [
  { value: "order", label: "My order" },
  { value: "delivery", label: "Delivery or tracking" },
  { value: "return_refund", label: "Return, exchange or refund" },
  { value: "payment", label: "Payment or charges" },
  { value: "product", label: "Product quality or wrong item" },
  { value: "boutique", label: "A boutique (seller)" },
  { value: "website", label: "Website or my account" },
  { value: "other", label: "Something else" },
];

const MESSAGE_MIN = 20;
const MESSAGE_MAX = 3000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Fields = { name: string; email: string; phone: string; category: string; orderNumber: string; message: string };
type Errors = Partial<Record<keyof Fields, string>>;

const EMPTY: Fields = { name: "", email: "", phone: "", category: "", orderNumber: "", message: "" };

function check(f: Fields): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = "Enter your full name.";
  if (!EMAIL_RE.test(f.email.trim())) e.email = "Enter a valid email address.";
  if (!toE164(f.phone)) e.phone = "Enter a valid 10-digit mobile number.";
  if (!f.category) e.category = "Choose what your complaint is about.";
  const len = f.message.trim().length;
  if (len < MESSAGE_MIN) e.message = `Please tell us a little more (at least ${MESSAGE_MIN} characters).`;
  else if (len > MESSAGE_MAX) e.message = `Please keep it under ${MESSAGE_MAX} characters.`;
  return e;
}

// A button that opens the complaint form. Style it through className.
export function RaiseComplaintButton({ className, children = "Raise a complaint" }: { className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto rounded-none sm:rounded-none">
          {/* Mounted only while open, so the profile isn't fetched on every page. */}
          {open && <ComplaintForm onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ComplaintForm({ onDone }: { onDone: () => void }) {
  const { user, profile } = useProfile();
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ticket: string; ackSent: boolean; email: string } | null>(null);
  // Hidden from people; bots fill it in (see the function).
  const [trap, setTrap] = useState("");

  // Signed in: start with the account's name, email and mobile number.
  useEffect(() => {
    if (!user) return;
    setFields((f) => ({
      ...f,
      name: f.name || profile?.full_name?.trim() || "",
      email: f.email || user.email || "",
      phone: f.phone || nationalPhone(user.phone || profile?.phone?.trim() || ""),
    }));
  }, [user, profile]);

  const set = (key: keyof Fields) => (value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const found = check(fields);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    const { data, errorMessage } = await invokeEdgeFunction<{ ticket: string; ack_sent: boolean }>("submit-complaint", {
      name: fields.name.trim(),
      email: fields.email.trim(),
      phone: fields.phone.trim(),
      category: fields.category,
      order_number: fields.orderNumber.trim(),
      message: fields.message.trim(),
      company_fax: trap,
    });
    setSubmitting(false);
    if (errorMessage || !data?.ticket) {
      setServerError(errorMessage || "Something went wrong. Please try again.");
      return;
    }
    setResult({ ticket: data.ticket, ackSent: data.ack_sent, email: fields.email.trim() });
  };

  if (result) {
    return (
      <div className="py-2 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-primary" />
        <DialogHeader className="space-y-2 text-center sm:text-center">
          <DialogTitle className="font-serif text-2xl font-normal">Complaint submitted</DialogTitle>
          <DialogDescription>Your ticket number is</DialogDescription>
        </DialogHeader>
        <p className="my-3 select-all font-mono text-2xl font-semibold tracking-wider text-primary">{result.ticket}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {result.ackSent ? (
            <>
              We've emailed a confirmation to <span className="text-foreground">{result.email}</span>.
            </>
          ) : (
            <>We couldn't email you a confirmation, so please note your ticket number.</>
          )}{" "}
          We'll get back to you within 48 hours.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-6 h-11 w-full bg-primary text-[11px] font-medium uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90"
        >
          Done
        </button>
      </div>
    );
  }

  const messageLength = fields.message.trim().length;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle className="font-serif text-2xl font-normal">Raise a complaint</DialogTitle>
        <DialogDescription>
          Tell us what went wrong. You'll get a ticket number by email, and we'll get back to you within 48 hours.
        </DialogDescription>
      </DialogHeader>

      <Field id="complaint-name" label="Full name" error={errors.name}>
        <Input
          id="complaint-name"
          autoComplete="name"
          maxLength={100}
          value={fields.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-invalid={!!errors.name}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="complaint-email" label="Email" error={errors.email}>
          <Input
            id="complaint-email"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={fields.email}
            onChange={(e) => set("email")(e.target.value)}
            aria-invalid={!!errors.email}
          />
        </Field>
        <Field id="complaint-phone" label="Mobile number" error={errors.phone}>
          <Input
            id="complaint-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
            placeholder="98765 43210"
            value={fields.phone}
            onChange={(e) => set("phone")(e.target.value)}
            aria-invalid={!!errors.phone}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="complaint-category" label="Complaint about" error={errors.category}>
          <Select value={fields.category} onValueChange={set("category")}>
            <SelectTrigger id="complaint-category" aria-invalid={!!errors.category}>
              <SelectValue placeholder="Choose one" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="complaint-order" label="Order number" optional>
          <Input
            id="complaint-order"
            maxLength={40}
            placeholder="If it's about an order"
            value={fields.orderNumber}
            onChange={(e) => set("orderNumber")(e.target.value)}
          />
        </Field>
      </div>

      <Field id="complaint-message" label="Your complaint" error={errors.message}>
        <Textarea
          id="complaint-message"
          rows={5}
          maxLength={MESSAGE_MAX}
          placeholder="What happened, and what would you like us to do?"
          value={fields.message}
          onChange={(e) => set("message")(e.target.value)}
          aria-invalid={!!errors.message}
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {messageLength < MESSAGE_MIN ? `${MESSAGE_MIN - messageLength} more characters needed` : `${messageLength} / ${MESSAGE_MAX}`}
        </p>
      </Field>

      {/* Bot trap: off-screen, skipped by keyboard and screen readers. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="complaint-company-fax">Company fax</label>
        <input id="complaint-company-fax" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
      </div>

      {serverError && (
        <p role="alert" className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex h-11 w-full items-center justify-center gap-2 bg-primary text-[11px] font-medium uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Sending" : "Submit complaint"}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        Or write to our Grievance Officer at{" "}
        <a href={`mailto:${COMPANY.grievanceOfficer.email}`} className="text-primary underline-offset-4 hover:underline">
          {COMPANY.grievanceOfficer.email}
        </a>
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
