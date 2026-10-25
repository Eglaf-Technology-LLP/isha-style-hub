import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useVendor, type PersonDetails, type ApplicationDocument } from "@/hooks/useVendor";
import { InlineSignInForm } from "@/components/auth/InlineSignInForm";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { StateSelect } from "@/components/StateSelect";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { accountFieldClass, accountLabelClass } from "@/components/storefront/account/AccountKit";
import { cn } from "@/lib/utils";
import {
  Store,
  TrendingUp,
  ShieldCheck,
  Wallet,
  Users,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Building2,
  IdCard,
  UserRound,
  FileText,
  Landmark,
  MapPin,
  Upload,
  X,
  Instagram,
  Globe,
  Mail,
  MessageCircle,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { COMPANY, telHref } from "@/lib/company";
import {
  ACCOUNT_RE,
  ADDRESS_LINE1_MIN,
  BRAND_LEGAL_DECLARATION,
  PIN_RE,
  cleanMobileInput,
  instagramProblem,
  normalizeInstagram,
  normalizeWebsite,
  BANK_PROOF_TYPES,
  CONSTITUTIONS,
  DOCUMENTS_BY_CONSTITUTION,
  EMAIL_RE,
  GSTIN_RE,
  IFSC_RE,
  PAN_RE,
  documentFileProblem,
  normalizeMobile,
  type BankProofType,
  type BusinessConstitution,
  type DocumentType,
} from "@/lib/vendorKyc";
import { titleCase } from "@/lib/text";
import { LEGAL_PATHS, LEGAL_UPDATED } from "@/lib/legal";

const benefits = [
  {
    icon: TrendingUp,
    title: "Reach lakhs of shoppers",
    desc: "List on a fast-growing Indian fashion marketplace with built-in discovery.",
  },
  {
    icon: Wallet,
    title: "Split payouts, your rates",
    desc: "Set your own shipping & return policy. Funds reach you per order minus a flat commission.",
  },
  {
    icon: ShieldCheck,
    title: "Trusted-partner fast-track",
    desc: "Once approved as a trusted partner, your products publish instantly — no waiting.",
  },
  {
    icon: Users,
    title: "Your own back-office",
    desc: "Manage products, inventory, orders, fulfilment and analytics from one dashboard.",
  },
];


const EMPTY_PERSON: PersonDetails = { name: "", designation: "", mobile: "", email: "" };

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5 border-b border-border pb-10 last-of-type:border-0">
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/50 text-gold">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3 className="font-serif text-2xl leading-tight">{title}</h3>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "id">) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={accountLabelClass}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className={cn(accountFieldClass, error && "border-destructive")}
        {...rest}
      />
      <FieldError message={error} />
    </div>
  );
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// One checklist row: PDF picker with the chosen file, or why it was refused.
function DocumentUpload({
  id,
  label,
  optional,
  file,
  error,
  onChange,
}: {
  id: string;
  label: string;
  optional?: boolean;
  file?: File;
  error?: string;
  onChange: (file: File | null, problem: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      id={id}
      className={`flex flex-col gap-3 border p-4 sm:flex-row sm:items-center ${
        error ? "border-destructive" : file ? "border-gold/60 bg-ivory" : "border-border bg-background"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
          {file ? <CheckCircle2 className="h-4 w-4 text-gold shrink-0" /> : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />}
          {label}
          <span className="border border-border px-1.5 py-0.5 text-[9px] font-normal uppercase tracking-[0.14em] text-muted-foreground">
            {optional ? "Optional" : "Required"}
          </span>
        </p>
        {file ? (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {file.name} · {formatSize(file.size)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">PDF, up to 10 MB</p>
        )}
        <FieldError message={error} />
      </div>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        aria-label={label}
        data-doc-input={id}
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (!picked) return;
          const problem = documentFileProblem(picked);
          onChange(problem ? null : picked, problem);
        }}
      />
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex h-10 items-center gap-1.5 border border-foreground px-4 text-[10px] font-medium uppercase tracking-[0.18em] transition-colors hover:bg-foreground hover:text-background"
        >
          <Upload className="h-3.5 w-3.5" /> {file ? "Replace" : "Upload PDF"}
        </button>
        {file && (
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={() => onChange(null, null)}
            className="flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

const sameName = (a: string, b: string) =>
  a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");

export default function SellWithUs() {
  const { user, loading: authLoading } = useAuth();
  const { vendor, loading: vendorLoading, submitApplication } = useVendor();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "",
    description: "",
    legal_business_name: "",
    instagram_url: "",
    website_url: "",
    pan: "",
    gstin: "",
    primary_mobile: "",
    alternate_mobile: "",
    business_email: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    pincode: "",
    shipping_flat_rate: "99",
    free_shipping_threshold: "999",
    return_window_days: "7",
    return_policy:
      "7-day easy returns. Items must be unused with original tags and packaging intact.",
  });
  const [constitution, setConstitution] = useState<BusinessConstitution | null>(null);
  // Boutique / Brand Name vs Legal Business Name (Part 7, 3.1-3.2).
  const [brandSame, setBrandSame] = useState(true);
  const [brandDeclared, setBrandDeclared] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [authorized, setAuthorized] = useState<PersonDetails>(EMPTY_PERSON);
  const [contactSame, setContactSame] = useState(true);
  const [contact, setContact] = useState<PersonDetails>(EMPTY_PERSON);
  const [bank, setBank] = useState({
    account_holder_name: "",
    account_number: "",
    ifsc: "",
    bank_name: "",
    proof_type: "" as BankProofType | "",
  });
  const [files, setFiles] = useState<Partial<Record<DocumentType, File>>>({});
  const [bankBranch, setBankBranch] = useState<string | null>(null);
  const autoFilledBankName = useRef<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const clearError = (key: string) =>
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });

  // Fill the bank name (and show the branch) from the IFSC, unless the
  // applicant typed their own bank name.
  useEffect(() => {
    const ifsc = bank.ifsc.trim();
    setBankBranch(null);
    if (!IFSC_RE.test(ifsc)) return;
    let cancelled = false;
    fetch(`https://ifsc.razorpay.com/${ifsc}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.BANK) return;
        setBankBranch(d.BRANCH ? `${d.BANK}, ${d.BRANCH}` : d.BANK);
        setBank((b) => {
          if (b.bank_name && b.bank_name !== autoFilledBankName.current) return b;
          autoFilledBankName.current = d.BANK;
          return { ...b, bank_name: d.BANK };
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bank.ifsc]);

  if (authLoading || vendorLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="seller" />
        <div className="flex justify-center items-center py-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <Footer />
      </div>
    );
  }

  // Already registered → route to the right place
  if (vendor) {
    navigate(vendor.status === "approved" ? "/vendor" : "/vendor/pending", {
      replace: true,
    });
    return null;
  }

  const businessDocs = constitution ? DOCUMENTS_BY_CONSTITUTION[constitution] : [];

  const chooseConstitution = (value: BusinessConstitution) => {
    setConstitution(value);
    clearError("constitution");
    // Drop files that don't belong to the new checklist.
    const keep = new Set<DocumentType>([...DOCUMENTS_BY_CONSTITUTION[value].map((d) => d.type), "bank_proof"]);
    setFiles((f) => Object.fromEntries(Object.entries(f).filter(([t]) => keep.has(t as DocumentType))));
    const defaultDesignation = { proprietorship: "Proprietor", huf: "Karta" }[value as string];
    if (defaultDesignation && (!authorized.designation || ["Proprietor", "Karta"].includes(authorized.designation))) {
      setAuthorized((a) => ({ ...a, designation: defaultDesignation }));
    }
  };

  const setFile = (type: DocumentType, file: File | null, problem: string | null) => {
    setFiles((f) => {
      const next = { ...f };
      if (file) next[type] = file;
      else if (!problem) delete next[type];
      return next;
    });
    setErrors((e) => {
      const next = { ...e };
      if (problem) next[`doc_${type}`] = problem;
      else delete next[`doc_${type}`];
      return next;
    });
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    const pan = form.pan.trim().toUpperCase();
    const gstin = form.gstin.trim().toUpperCase();
    if (!form.name.trim()) e.name = "Enter your Boutique / Brand Name";
    if (!brandSame) {
      if (!form.legal_business_name.trim()) e.legal_business_name = "Enter your Legal Business Name (as on GST / PAN)";
      if (!brandDeclared) e.brand_declaration = "Tick this declaration to continue";
    }
    const instagram = instagramProblem(form.instagram_url);
    if (instagram) e.instagram_url = instagram;
    if (form.website_url.trim() && !normalizeWebsite(form.website_url)) {
      e.website_url = "Enter a valid website link (e.g. https://www.yourboutique.com), or leave it empty";
    }
    if (!constitution) e.constitution = "Select your business type";
    if (!PAN_RE.test(pan)) e.pan = "Enter a valid PAN (e.g. ABCDE1234F)";
    if (!GSTIN_RE.test(gstin)) e.gstin = "Enter a valid 15-character GST number";
    else if (PAN_RE.test(pan) && gstin.slice(2, 12) !== pan)
      e.gstin = "This GST number doesn't match the PAN (characters 3 to 12 of a GST number are the PAN)";
    const primary = normalizeMobile(form.primary_mobile);
    const alternate = normalizeMobile(form.alternate_mobile);
    if (!primary) e.primary_mobile = "Enter a valid 10-digit mobile number";
    if (!alternate) e.alternate_mobile = "Enter a valid 10-digit mobile number";
    else if (alternate === primary) e.alternate_mobile = "Must be different from the primary number";
    if (!EMAIL_RE.test(form.business_email.trim())) e.business_email = "Enter a valid email address";

    const person = (p: PersonDetails, prefix: string) => {
      if (!p.name.trim()) e[`${prefix}_name`] = "Enter the full name";
      if (!p.designation.trim()) e[`${prefix}_designation`] = "Enter the designation";
      if (!normalizeMobile(p.mobile)) e[`${prefix}_mobile`] = "Enter a valid 10-digit mobile number";
      if (!EMAIL_RE.test(p.email.trim())) e[`${prefix}_email`] = "Enter a valid email address";
    };
    person(authorized, "auth");
    if (!contactSame) person(contact, "contact");

    for (const doc of businessDocs) {
      if (!doc.optional && !files[doc.type] && !e[`doc_${doc.type}`]) e[`doc_${doc.type}`] = "Upload this document as a PDF";
    }

    if (!bank.account_holder_name.trim()) e.bank_holder = "Enter the account holder name";
    if (!ACCOUNT_RE.test(bank.account_number.replace(/\s/g, ""))) e.bank_account = "Enter a valid account number (9 to 18 digits)";
    if (!IFSC_RE.test(bank.ifsc.trim())) e.bank_ifsc = "Enter a valid 11-character IFSC code";
    if (!bank.bank_name.trim()) e.bank_name = "Enter the bank name";
    if (!bank.proof_type) e.bank_proof_type = "Choose the type of bank proof";
    if (!files.bank_proof) e.doc_bank_proof = "Upload your bank proof as a PDF";

    if (form.address_line1.trim().length < ADDRESS_LINE1_MIN) {
      e.address_line1 = `Address line 1 needs at least ${ADDRESS_LINE1_MIN} characters`;
    }
    if (!form.city.trim()) e.city = "Enter your city";
    if (!form.state.trim()) e.state = "Select your state";
    if (!PIN_RE.test(form.pincode.trim())) e.pincode = "Enter a 6-digit PIN code";
    if (!acceptedTerms) e.accept_terms = "Please accept the Privacy Policy and the Seller Terms & Conditions";
    return e;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    const firstKey = Object.keys(found)[0];
    if (firstKey) {
      toast.error(`Please fix ${Object.keys(found).length === 1 ? "the highlighted field" : `${Object.keys(found).length} highlighted fields`}`);
      document.getElementById(firstKey)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const documents: ApplicationDocument[] = [
      ...businessDocs.filter((d) => files[d.type]).map((d) => ({ type: d.type, file: files[d.type]! })),
      { type: "bank_proof", file: files.bank_proof! },
    ];
    setSubmitting(true);
    const { error } = await submitApplication(
      {
        name: titleCase(form.name),
        description: form.description.trim(),
        address: {
          address_line1: form.address_line1.trim(),
          address_line2: form.address_line2.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          pincode: form.pincode.trim(),
          country: "India",
        },
        shipping_flat_rate: Number(form.shipping_flat_rate) || 0,
        free_shipping_threshold: form.free_shipping_threshold ? Number(form.free_shipping_threshold) : null,
        return_window_days: Number(form.return_window_days) || 7,
        return_policy: form.return_policy.trim(),
        business_constitution: constitution!,
        brand_same_as_legal: brandSame,
        brand_legal_declaration: !brandSame && brandDeclared,
        legal_business_name: brandSame ? form.name.trim() : form.legal_business_name.trim(),
        instagram_url: normalizeInstagram(form.instagram_url) ?? form.instagram_url.trim(),
        website_url: form.website_url.trim() ? (normalizeWebsite(form.website_url) ?? form.website_url.trim()) : "",
        pan: form.pan.trim().toUpperCase(),
        gstin: form.gstin.trim().toUpperCase(),
        primary_mobile: form.primary_mobile,
        alternate_mobile: form.alternate_mobile,
        business_email: form.business_email.trim(),
        authorized_person: authorized,
        contact_same_as_authorized: contactSame,
        contact_person: contactSame ? null : contact,
        bank: {
          account_holder_name: bank.account_holder_name.trim(),
          account_number: bank.account_number.replace(/\s/g, ""),
          ifsc: bank.ifsc.trim().toUpperCase(),
          bank_name: bank.bank_name.trim(),
          proof_type: bank.proof_type as BankProofType,
        },
        accepted_terms: acceptedTerms,
        terms_version: LEGAL_UPDATED,
        marketing_emails: marketingEmails,
      },
      documents,
      (done, total) => setProgress(done < total ? `Uploading documents (${done + 1} of ${total})...` : "Submitting application..."),
    );
    setSubmitting(false);
    setProgress(null);
    if (error) {
      toast.error(error);
      return;
    }
    navigate("/vendor/pending");
  };

  const legalName = brandSame ? form.name : form.legal_business_name;
  const holderMismatch =
    constitution &&
    constitution !== "proprietorship" &&
    bank.account_holder_name.trim() &&
    legalName.trim() &&
    !sameName(bank.account_holder_name, legalName);

  return (
    <div className="min-h-screen bg-background">
      <Header variant="seller" />

      {/* Hero */}
      <section className="relative overflow-hidden bg-maroon-deep pattern-jaal-dark text-ivory">
        <div className="store-container relative py-20 text-center md:py-28">
          <p className="eyebrow text-gold">Marketplace vendor program</p>
          <h1 className="mx-auto mt-5 max-w-3xl font-serif text-4xl leading-[1.08] md:text-6xl">
            Sell your brand <em className="font-normal text-gold">across India</em>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-ivory/75 md:text-lg">
            Open your own storefront on AllBoutiqs. Keep full control of your
            products, pricing, shipping and returns — we bring the customers.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex h-12 items-center gap-2 bg-ivory px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-foreground transition-colors hover:bg-gold hover:text-ivory"
            >
              Start your application <ArrowRight className="h-4 w-4" />
            </button>
            <Link
              to="/vendor"
              className="inline-flex h-12 items-center border border-ivory/40 px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-ivory transition-colors hover:border-ivory"
            >
              Boutique login
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-b border-border">
        <div className="store-container grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
          {benefits.map((b, i) => (
            <div
              key={b.title}
              className={cn(
                "py-10 sm:px-8 lg:py-14",
                i % 2 === 1 && "sm:border-l sm:border-border",
                i >= 2 && "sm:border-t lg:border-t-0",
                i === 2 && "lg:border-l",
              )}
            >
              <b.icon className="h-7 w-7 text-gold" strokeWidth={1.5} />
              <h2 className="mt-5 font-serif text-2xl leading-tight">{b.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-ivory">
        <div className="store-container py-16 md:py-20">
          <p className="eyebrow text-center text-gold">How it works</p>
          <h2 className="mt-3 text-center font-serif text-3xl md:text-[2.6rem]">
            Three steps to <em className="font-normal text-primary">your storefront</em>
          </h2>
          <ol className="mx-auto mt-12 grid max-w-5xl gap-10 md:grid-cols-3 md:gap-8">
            {[
              ["Apply", "Tell us about your business and upload your documents in the form below."],
              ["Get verified", "Our team reviews applications within 1–2 business days."],
              ["Start selling", "List your pieces from your own dashboard. A new store's products are approved by our team before they go live."],
            ].map(([title, text], i) => (
              <li key={title} className="text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/50 bg-background font-serif text-xl text-gold">
                  {i + 1}
                </span>
                <h3 className="mt-5 font-serif text-2xl">{title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Application form */}
      <section id="apply" className="scroll-mt-24">
        <div className="store-container grid gap-10 py-16 md:py-20 lg:grid-cols-[320px_1fr] lg:gap-16">
          <aside>
            <div className="lg:sticky lg:top-32">
              <p className="eyebrow text-gold">Apply</p>
              <h2 className="mt-3 font-serif text-4xl leading-tight">Seller registration</h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Tell us about your business. Our team reviews applications within 1–2 business days. Fields marked * are
                required.
              </p>
              <div className="mt-8 border border-border bg-ivory p-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em]">Keep these ready</p>
                <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                  {[
                    "PAN and GST number of the business",
                    "Authorized person's details and Aadhaar card",
                    "Business documents as PDFs, up to 10 MB each",
                    "Bank account details and a bank proof PDF",
                  ].map((t) => (
                    <li key={t} className="flex gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>

          <div className="min-w-0">
          {!user ? (
            <div className="mx-auto max-w-md border border-border bg-ivory p-8 text-center md:p-10">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 bg-background">
                <Store className="h-6 w-6 text-gold" strokeWidth={1.5} />
              </span>
              <h3 className="mt-6 font-serif text-3xl leading-tight">Sign in to start selling</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Create an account or sign in, then submit your store application to
                join AllBoutiqs as a vendor.
              </p>
              <div className="mt-8">
                <InlineSignInForm />
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-10" noValidate>
              <FormSection icon={Store} title="Your boutique">
                <TextField
                  id="name"
                  label="Boutique / Brand Name *"
                  placeholder="e.g. Anaya Ethnic Wear"
                  value={form.name}
                  onChange={(v) => {
                    set("name", v);
                    clearError("name");
                  }}
                  error={errors.name}
                />
                <RadioGroup
                  value={brandSame ? "same" : "different"}
                  onValueChange={(v) => {
                    setBrandSame(v === "same");
                    clearError("legal_business_name");
                    clearError("brand_declaration");
                  }}
                  className="space-y-2"
                  aria-label="Is your Boutique / Brand Name the same as your Legal Business Name?"
                >
                  {(
                    [
                      ["same", "My Boutique / Brand Name is the same as my Legal Business Name."],
                      ["different", "My Boutique / Brand Name is different from my Legal Business Name."],
                    ] as const
                  ).map(([value, text]) => (
                    <Label
                      key={value}
                      htmlFor={`brand-${value}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 border p-4 text-sm font-normal leading-relaxed transition-colors",
                        (brandSame ? "same" : "different") === value ? "border-foreground bg-ivory" : "border-border hover:border-foreground/40",
                      )}
                    >
                      <RadioGroupItem value={value} id={`brand-${value}`} className="mt-0.5" />
                      {text}
                    </Label>
                  ))}
                </RadioGroup>
                {!brandSame && (
                  <div className="space-y-4 bg-ivory p-5">
                    <TextField
                      id="brand_name_again"
                      label="Boutique / Brand Name *"
                      value={form.name}
                      onChange={(v) => {
                        set("name", v);
                        clearError("name");
                      }}
                    />
                    <div className="space-y-2">
                      <TextField
                        id="legal_business_name"
                        label="Legal Business Name * (as on GST / PAN)"
                        value={form.legal_business_name}
                        onChange={(v) => {
                          set("legal_business_name", v);
                          clearError("legal_business_name");
                        }}
                        error={errors.legal_business_name}
                      />
                      <p className="text-xs text-muted-foreground">
                        Proprietorship, Partnership Firm, LLP, Private Limited Company or HUF.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label id="brand_declaration" className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                        <Checkbox
                          checked={brandDeclared}
                          onCheckedChange={(v) => {
                            setBrandDeclared(v === true);
                            clearError("brand_declaration");
                          }}
                          aria-invalid={!!errors.brand_declaration}
                          className="mt-0.5"
                        />
                        <span>{BRAND_LEGAL_DECLARATION} *</span>
                      </label>
                      <FieldError message={errors.brand_declaration} />
                      <p className="text-xs text-muted-foreground">
                        Example: Boutique / Brand Name "Rangreza Studio" · Legal Business Name "Meera Textiles"
                        (Proprietorship).
                      </p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="instagram_url" className={accountLabelClass}>
                      Instagram Profile Link *
                    </Label>
                    <div className="relative">
                      <Instagram className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="instagram_url"
                        type="url"
                        inputMode="url"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="https://www.instagram.com/yourboutique"
                        value={form.instagram_url}
                        onChange={(e) => {
                          set("instagram_url", e.target.value);
                          clearError("instagram_url");
                        }}
                        onBlur={() => {
                          const url = normalizeInstagram(form.instagram_url);
                          if (url) set("instagram_url", url);
                          else if (form.instagram_url.trim()) setErrors((er) => ({ ...er, instagram_url: instagramProblem(form.instagram_url)! }));
                        }}
                        aria-invalid={!!errors.instagram_url}
                        aria-describedby="instagram_help"
                        className={cn(accountFieldClass, "pl-10", errors.instagram_url && "border-destructive")}
                      />
                    </div>
                    <FieldError message={errors.instagram_url} />
                    <p id="instagram_help" className="text-xs leading-relaxed text-muted-foreground">
                      Paste your full Instagram profile link, not just your username. Open Instagram → Go to your
                      profile (your home page) → Tap Share Profile (the button beside Edit Profile) → Copy link → Paste
                      it here
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website_url" className={accountLabelClass}>
                      Website Link (optional)
                    </Label>
                    <div className="relative">
                      <Globe className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="website_url"
                        type="url"
                        inputMode="url"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="https://www.yourboutique.com"
                        value={form.website_url}
                        onChange={(e) => {
                          set("website_url", e.target.value);
                          clearError("website_url");
                        }}
                        aria-invalid={!!errors.website_url}
                        className={cn(accountFieldClass, "pl-10", errors.website_url && "border-destructive")}
                      />
                    </div>
                    <FieldError message={errors.website_url} />
                    <p className="text-xs text-muted-foreground">If you have a website, paste the link here.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className={accountLabelClass} htmlFor="description">Boutique description</Label>
                  <Textarea
                    id="description"
                    placeholder="What do you sell? What makes your brand special?"
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={3}
                    className="rounded-none border-foreground/20 bg-background focus-visible:border-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </FormSection>

              <FormSection
                icon={Building2}
                title="Business type *"
                description="Select one. The documents you need to upload depend on this."
              >
                <RadioGroup
                  id="constitution"
                  value={constitution ?? ""}
                  onValueChange={(v) => chooseConstitution(v as BusinessConstitution)}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  {CONSTITUTIONS.map((c) => (
                    <Label
                      key={c.value}
                      htmlFor={`constitution-${c.value}`}
                      className={`flex cursor-pointer items-start gap-3 border p-4 font-normal transition-colors ${
                        constitution === c.value ? "border-foreground bg-ivory" : "border-border hover:border-foreground/40"
                      }`}
                    >
                      <RadioGroupItem value={c.value} id={`constitution-${c.value}`} className="mt-0.5" />
                      <span>
                        <span className="block font-medium">{c.label}</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">{c.description}</span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
                <FieldError message={errors.constitution} />
              </FormSection>

              <FormSection icon={IdCard} title="Business identification & contact">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextField
                    id="pan"
                    label="PAN number *"
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    autoCapitalize="characters"
                    value={form.pan}
                    onChange={(v) => {
                      set("pan", v.toUpperCase());
                      clearError("pan");
                    }}
                    error={errors.pan}
                  />
                  <TextField
                    id="gstin"
                    label="GST number *"
                    placeholder="22ABCDE1234F1Z5"
                    maxLength={15}
                    autoCapitalize="characters"
                    value={form.gstin}
                    onChange={(v) => {
                      set("gstin", v.toUpperCase());
                      clearError("gstin");
                    }}
                    error={errors.gstin}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextField
                    id="primary_mobile"
                    label="Primary / permanent mobile *"
                    type="tel"
                    inputMode="tel"
                    placeholder="9876543210"
                    value={form.primary_mobile}
                    onChange={(v) => {
                      set("primary_mobile", cleanMobileInput(v));
                      clearError("primary_mobile");
                    }}
                    error={errors.primary_mobile}
                  />
                  <TextField
                    id="alternate_mobile"
                    label="Alternative mobile *"
                    type="tel"
                    inputMode="tel"
                    placeholder="9123456789"
                    value={form.alternate_mobile}
                    onChange={(v) => {
                      set("alternate_mobile", cleanMobileInput(v));
                      clearError("alternate_mobile");
                    }}
                    error={errors.alternate_mobile}
                  />
                </div>
                <TextField
                  id="business_email"
                  label="Official business email *"
                  type="email"
                  placeholder="orders@yourbrand.com"
                  value={form.business_email}
                  onChange={(v) => {
                    set("business_email", v);
                    clearError("business_email");
                  }}
                  error={errors.business_email}
                />
              </FormSection>

              <FormSection
                icon={UserRound}
                title="Authorized person *"
                description={
                  constitution === "proprietorship"
                    ? "Usually the proprietor. Their Aadhaar card is uploaded under Documents."
                    : constitution === "huf"
                      ? "The Karta of the HUF. Their Aadhaar card is uploaded under Documents."
                      : "The partner, director or signatory who can act for the business. Their Aadhaar card is uploaded under Documents."
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(
                    [
                      ["name", "Full name *", "text"],
                      ["designation", "Designation *", "text"],
                      ["mobile", "Mobile number *", "tel"],
                      ["email", "Email ID *", "email"],
                    ] as const
                  ).map(([key, label, type]) => (
                    <TextField
                      key={key}
                      id={`auth_${key}`}
                      label={label}
                      type={type}
                      placeholder={
                        key === "designation"
                          ? constitution === "proprietorship"
                            ? "Proprietor"
                            : constitution === "huf"
                              ? "Karta"
                              : "e.g. Partner, Director"
                          : key === "mobile"
                            ? "10-digit mobile"
                            : undefined
                      }
                      value={authorized[key]}
                      onChange={(v) => {
                        setAuthorized((a) => ({ ...a, [key]: key === "mobile" ? cleanMobileInput(v) : v }));
                        clearError(`auth_${key}`);
                      }}
                      error={errors[`auth_${key}`]}
                    />
                  ))}
                </div>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox
                    id="contact_same"
                    checked={contactSame}
                    onCheckedChange={(v) => setContactSame(v === true)}
                    className="mt-0.5"
                  />
                  <span>The authorized person is also our day-to-day contact person</span>
                </label>
                {!contactSame && (
                  <div className="space-y-4 bg-ivory p-5">
                    <p className="text-sm font-medium">Contact person *</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(
                        [
                          ["name", "Full name *", "text"],
                          ["designation", "Designation *", "text"],
                          ["mobile", "Mobile number *", "tel"],
                          ["email", "Email ID *", "email"],
                        ] as const
                      ).map(([key, label, type]) => (
                        <TextField
                          key={key}
                          id={`contact_${key}`}
                          label={label}
                          type={type}
                          value={contact[key]}
                          onChange={(v) => {
                            setContact((c) => ({ ...c, [key]: key === "mobile" ? cleanMobileInput(v) : v }));
                            clearError(`contact_${key}`);
                          }}
                          error={errors[`contact_${key}`]}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </FormSection>

              <FormSection
                icon={FileText}
                title="Documents *"
                description="Upload each document as a PDF (up to 10 MB). The list matches your business type."
              >
                {constitution ? (
                  <div className="space-y-2">
                    {businessDocs.map((doc) => (
                      <DocumentUpload
                        key={doc.type}
                        id={`doc_${doc.type}`}
                        label={doc.label}
                        optional={doc.optional}
                        file={files[doc.type]}
                        error={errors[`doc_${doc.type}`]}
                        onChange={(file, problem) => setFile(doc.type, file, problem)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="bg-ivory p-4 text-sm text-muted-foreground">
                    Select your business type above to see the documents you need.
                  </p>
                )}
              </FormSection>

              <FormSection
                icon={Landmark}
                title="Bank details *"
                description="Where your payouts are sent."
              >
                <p className="border border-gold/40 bg-ivory p-4 text-xs leading-relaxed">
                  The bank account must be held in the name of the seller business (a proprietor may use their own
                  account) and must match the legal business details above.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextField
                    id="bank_holder"
                    label="Account holder name *"
                    value={bank.account_holder_name}
                    onChange={(v) => {
                      setBank((b) => ({ ...b, account_holder_name: v }));
                      clearError("bank_holder");
                    }}
                    error={errors.bank_holder}
                  />
                  <TextField
                    id="bank_account"
                    label="Account number *"
                    inputMode="numeric"
                    autoComplete="off"
                    value={bank.account_number}
                    onChange={(v) => {
                      setBank((b) => ({ ...b, account_number: v }));
                      clearError("bank_account");
                    }}
                    error={errors.bank_account}
                  />
                  <div className="space-y-2">
                    <TextField
                      id="bank_ifsc"
                      label="IFSC code *"
                      placeholder="HDFC0001234"
                      maxLength={11}
                      autoCapitalize="characters"
                      value={bank.ifsc}
                      onChange={(v) => {
                        setBank((b) => ({ ...b, ifsc: v.toUpperCase() }));
                        clearError("bank_ifsc");
                      }}
                      error={errors.bank_ifsc}
                    />
                    {bankBranch && <p className="text-xs text-muted-foreground -mt-1">{bankBranch}</p>}
                  </div>
                  <TextField
                    id="bank_name"
                    label="Bank name *"
                    value={bank.bank_name}
                    onChange={(v) => {
                      setBank((b) => ({ ...b, bank_name: v }));
                      clearError("bank_name");
                    }}
                    error={errors.bank_name}
                  />
                </div>
                {holderMismatch && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    The account holder name doesn't match your legal business name. Payouts can only go to an account
                    in the business's name.
                  </p>
                )}
                <div className="space-y-2">
                  <Label className={accountLabelClass}>Bank Proof (select any one) *</Label>
                  <RadioGroup
                    id="bank_proof_type"
                    value={bank.proof_type}
                    onValueChange={(v) => {
                      setBank((b) => ({ ...b, proof_type: v as BankProofType }));
                      clearError("bank_proof_type");
                    }}
                    className="flex flex-wrap gap-x-6 gap-y-2"
                  >
                    {BANK_PROOF_TYPES.map((t) => (
                      <label key={t.value} className="flex items-center gap-2 text-sm cursor-pointer">
                        <RadioGroupItem value={t.value} id={`proof-${t.value}`} />
                        {t.label}
                      </label>
                    ))}
                  </RadioGroup>
                  <FieldError message={errors.bank_proof_type} />
                </div>
                <DocumentUpload
                  id="doc_bank_proof"
                  label={BANK_PROOF_TYPES.find((t) => t.value === bank.proof_type)?.label ?? "Bank proof"}
                  file={files.bank_proof}
                  error={errors.doc_bank_proof}
                  onChange={(file, problem) => setFile("bank_proof", file, problem)}
                />
              </FormSection>

              <FormSection icon={MapPin} title="Business address *" description="Also used as your courier pickup address.">
                <div className="space-y-2">
                  <TextField
                    id="address_line1"
                    label="Address line 1 *"
                    placeholder="Shop / building number, street, area"
                    value={form.address_line1}
                    onChange={(v) => {
                      set("address_line1", v);
                      clearError("address_line1");
                    }}
                    error={errors.address_line1}
                  />
                  <p className="text-xs text-muted-foreground">Minimum {ADDRESS_LINE1_MIN} characters</p>
                </div>
                <TextField
                  id="address_line2"
                  label="Address line 2 (optional)"
                  value={form.address_line2}
                  onChange={(v) => set("address_line2", v)}
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <TextField
                    id="city"
                    label="City *"
                    value={form.city}
                    onChange={(v) => {
                      set("city", v);
                      clearError("city");
                    }}
                    error={errors.city}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="state" className={accountLabelClass}>State *</Label>
                    <StateSelect
                      id="state"
                      className={accountFieldClass}
                      value={form.state}
                      invalid={!!errors.state}
                      onChange={(v) => {
                        set("state", v);
                        clearError("state");
                      }}
                    />
                    <FieldError message={errors.state} />
                  </div>
                  <TextField
                    id="pincode"
                    label="PIN code *"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6 digits"
                    value={form.pincode}
                    onChange={(v) => {
                      set("pincode", v.replace(/\D/g, "").slice(0, 6));
                      clearError("pincode");
                    }}
                    error={errors.pincode}
                  />
                </div>
              </FormSection>

              <FormSection icon={Wallet} title="Shipping & returns">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className={accountLabelClass} htmlFor="shipping_flat_rate">Flat shipping (₹)</Label>
                    <Input
                      id="shipping_flat_rate"
                      className={accountFieldClass}
                      type="number"
                      min={0}
                      value={form.shipping_flat_rate}
                      onChange={(e) => set("shipping_flat_rate", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className={accountLabelClass} htmlFor="free_shipping_threshold">Free over (₹)</Label>
                    <Input
                      id="free_shipping_threshold"
                      className={accountFieldClass}
                      type="number"
                      min={0}
                      value={form.free_shipping_threshold}
                      onChange={(e) => set("free_shipping_threshold", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className={accountLabelClass} htmlFor="return_window_days">Return window (days)</Label>
                    <Input
                      id="return_window_days"
                      className={accountFieldClass}
                      type="number"
                      min={0}
                      value={form.return_window_days}
                      onChange={(e) => set("return_window_days", e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className={accountLabelClass} htmlFor="return_policy">Return policy</Label>
                  <Textarea
                    id="return_policy"
                    rows={2}
                    className="rounded-none border-foreground/20 bg-background focus-visible:border-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                    value={form.return_policy}
                    onChange={(e) => set("return_policy", e.target.value)}
                  />
                </div>
              </FormSection>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label id="accept_terms" className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                    <Checkbox
                      checked={acceptedTerms}
                      onCheckedChange={(v) => {
                        setAcceptedTerms(v === true);
                        clearError("accept_terms");
                      }}
                      aria-invalid={!!errors.accept_terms}
                      className="mt-0.5"
                    />
                    <span>
                      I have read and agree to the{" "}
                      <Link to={LEGAL_PATHS.privacy} target="_blank" className="text-primary underline underline-offset-4">
                        Privacy Policy
                      </Link>{" "}
                      and the{" "}
                      <Link to={LEGAL_PATHS.sellerTerms} target="_blank" className="text-primary underline underline-offset-4">
                        Seller Terms &amp; Conditions
                      </Link>
                      . *
                    </span>
                  </label>
                  <FieldError message={errors.accept_terms} />
                </div>
                <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                  <Checkbox
                    checked={marketingEmails}
                    onCheckedChange={(v) => setMarketingEmails(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Send me promotional emails from AllBoutiqs - news, offers and selling tips.{" "}
                    <span className="text-muted-foreground">(optional - you can stop them any time)</span>
                  </span>
                </label>
              </div>

              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <p>
                  By submitting, you confirm these details and documents are genuine. New stores start un-trusted
                  (products need admin approval); AllBoutiqs can grant trusted-partner status to publish instantly.
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex h-14 w-full items-center justify-center gap-2 bg-primary text-[12px] font-medium uppercase tracking-[0.22em] text-primary-foreground transition-colors hover:bg-maroon-deep disabled:opacity-70"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {progress ?? "Submit application"}
              </button>

              <aside aria-label="Need help?" className="border border-gold/40 bg-ivory p-5 text-sm">
                <p className="font-serif text-lg">Need help?</p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-3 sm:gap-4">
                  <li className="flex items-start gap-2">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    <span>
                      Email{" "}
                      <a href={`mailto:${COMPANY.supportEmail}`} className="font-medium underline-offset-4 hover:underline">
                        {COMPANY.supportEmail}
                      </a>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    <span>
                      WhatsApp{" "}
                      <a href={COMPANY.whatsappUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-4 hover:underline">
                        {COMPANY.whatsapp}
                      </a>{" "}
                      <span className="text-muted-foreground">(messages only)</span>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    <span>
                      Call{" "}
                      <a href={telHref(COMPANY.supportPhone)} className="font-medium underline-offset-4 hover:underline">
                        {COMPANY.supportPhone}
                      </a>{" "}
                      <span className="text-muted-foreground">(12:00 PM – 8:00 PM)</span>
                    </span>
                  </li>
                </ul>
              </aside>
            </form>
          )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
