import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useVendor, type PersonDetails, type ApplicationDocument } from "@/hooks/useVendor";
import { InlineSignInForm } from "@/components/auth/InlineSignInForm";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
} from "lucide-react";
import { toast } from "sonner";
import {
  ACCOUNT_RE,
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
    <section className="rounded-lg border border-border p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </h3>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
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
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className={error ? "border-destructive" : undefined}
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
      className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border p-3 ${
        error ? "border-destructive" : file ? "border-primary/40 bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
          {file ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />}
          {label}
          {optional ? (
            <Badge variant="outline" className="text-[10px] font-normal">Optional</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] font-normal">Required</Badge>
          )}
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
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          <Upload className="h-3.5 w-3.5 mr-1.5" /> {file ? "Replace" : "Upload PDF"}
        </Button>
        {file && (
          <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${label}`} onClick={() => onChange(null, null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
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
        <Header />
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

  // Not signed in → prompt
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16">
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <Store className="h-16 w-16 mx-auto text-primary mb-4" />
              <CardTitle>Sign in to start selling</CardTitle>
              <CardDescription>
                Create an account or sign in, then submit your store application to
                join AllBoutiqs as a vendor.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <InlineSignInForm />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate("/")}
              >
                Continue Shopping
              </Button>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  const businessDocs = constitution ? DOCUMENTS_BY_CONSTITUTION[constitution] : [];

  const chooseConstitution = (value: BusinessConstitution) => {
    setConstitution(value);
    clearError("constitution");
    // Drop files that don't belong to the new checklist.
    const keep = new Set<DocumentType>([...DOCUMENTS_BY_CONSTITUTION[value].map((d) => d.type), "bank_proof"]);
    setFiles((f) => Object.fromEntries(Object.entries(f).filter(([t]) => keep.has(t as DocumentType))));
    if (value === "proprietorship" && !authorized.designation) {
      setAuthorized((a) => ({ ...a, designation: "Proprietor" }));
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
    if (!form.name.trim()) e.name = "Enter your store name";
    if (!constitution) e.constitution = "Select your business constitution";
    if (!form.legal_business_name.trim()) e.legal_business_name = "Enter your legal business name";
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
        name: form.name.trim(),
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
        legal_business_name: form.legal_business_name.trim(),
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

  const holderMismatch =
    constitution &&
    constitution !== "proprietorship" &&
    bank.account_holder_name.trim() &&
    form.legal_business_name.trim() &&
    !sameName(bank.account_holder_name, form.legal_business_name);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-secondary/30 border-b border-border">
        <div className="container mx-auto px-4 py-16 text-center max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-4">
            <Store className="h-4 w-4" /> Marketplace Vendor Program
          </span>
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">
            Sell your brand Across India
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            Open your own storefront on AllBoutiqs. Keep full control of your
            products, pricing, shipping and returns — we bring the customers.
          </p>
          <Button size="lg" onClick={() => document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" })}>
            Start your application <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* Benefits */}
      <section className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((b) => (
            <Card key={b.title} className="h-full">
              <CardHeader>
                <b.icon className="h-8 w-8 text-primary mb-2" />
                <CardTitle className="text-lg">{b.title}</CardTitle>
                <CardDescription>{b.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Application form */}
      <section id="apply" className="container mx-auto px-4 py-12">
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-serif">Seller registration</CardTitle>
            <CardDescription>
              Tell us about your business. Our team reviews applications within 1–2 business days. Fields marked * are
              required.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              <FormSection icon={Store} title="Your store">
                <TextField
                  id="name"
                  label="Store name *"
                  placeholder="e.g. Anaya Ethnic Wear"
                  value={form.name}
                  onChange={(v) => {
                    set("name", v);
                    clearError("name");
                  }}
                  error={errors.name}
                />
                <div className="space-y-2">
                  <Label htmlFor="description">Store description</Label>
                  <Textarea
                    id="description"
                    placeholder="What do you sell? What makes your brand special?"
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={3}
                  />
                </div>
              </FormSection>

              <FormSection
                icon={Building2}
                title="Business constitution *"
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
                      className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer font-normal transition-colors ${
                        constitution === c.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
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
                <TextField
                  id="legal_business_name"
                  label="Legal business name * (as on PAN / GST)"
                  value={form.legal_business_name}
                  onChange={(v) => {
                    set("legal_business_name", v);
                    clearError("legal_business_name");
                  }}
                  error={errors.legal_business_name}
                />
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
                    placeholder="98765 43210"
                    value={form.primary_mobile}
                    onChange={(v) => {
                      set("primary_mobile", v);
                      clearError("primary_mobile");
                    }}
                    error={errors.primary_mobile}
                  />
                  <TextField
                    id="alternate_mobile"
                    label="Alternative mobile *"
                    type="tel"
                    inputMode="tel"
                    placeholder="91234 56789"
                    value={form.alternate_mobile}
                    onChange={(v) => {
                      set("alternate_mobile", v);
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
                      placeholder={key === "designation" ? (constitution === "proprietorship" ? "Proprietor" : "e.g. Partner, Director") : undefined}
                      value={authorized[key]}
                      onChange={(v) => {
                        setAuthorized((a) => ({ ...a, [key]: v }));
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
                  <div className="space-y-3 rounded-md bg-muted/40 p-3">
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
                            setContact((c) => ({ ...c, [key]: v }));
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
                description="Upload each document as a PDF (up to 10 MB). The list matches your business constitution."
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
                  <p className="text-sm text-muted-foreground rounded-md bg-muted/40 p-3">
                    Select your business constitution above to see the documents you need.
                  </p>
                )}
              </FormSection>

              <FormSection
                icon={Landmark}
                title="Bank details *"
                description="Where your payouts are sent."
              >
                <p className="text-xs rounded-md border border-primary/30 bg-primary/5 p-3">
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
                  <Label>Bank proof *</Label>
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

              <FormSection icon={MapPin} title="Business address" description="Also used as your courier pickup address.">
                <Input
                  id="address_line1"
                  placeholder="Address line 1"
                  value={form.address_line1}
                  onChange={(e) => set("address_line1", e.target.value)}
                />
                <Input
                  placeholder="Address line 2 (optional)"
                  value={form.address_line2}
                  onChange={(e) => set("address_line2", e.target.value)}
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input placeholder="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
                  <Input placeholder="State" value={form.state} onChange={(e) => set("state", e.target.value)} />
                  <Input placeholder="PIN code" value={form.pincode} onChange={(e) => set("pincode", e.target.value)} />
                </div>
              </FormSection>

              <FormSection icon={Wallet} title="Shipping & returns">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="shipping_flat_rate">Flat shipping (₹)</Label>
                    <Input
                      id="shipping_flat_rate"
                      type="number"
                      min={0}
                      value={form.shipping_flat_rate}
                      onChange={(e) => set("shipping_flat_rate", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="free_shipping_threshold">Free over (₹)</Label>
                    <Input
                      id="free_shipping_threshold"
                      type="number"
                      min={0}
                      value={form.free_shipping_threshold}
                      onChange={(e) => set("free_shipping_threshold", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="return_window_days">Return window (days)</Label>
                    <Input
                      id="return_window_days"
                      type="number"
                      min={0}
                      value={form.return_window_days}
                      onChange={(e) => set("return_window_days", e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="return_policy">Return policy</Label>
                  <Textarea
                    id="return_policy"
                    rows={2}
                    value={form.return_policy}
                    onChange={(e) => set("return_policy", e.target.value)}
                  />
                </div>
              </FormSection>

              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <p>
                  By submitting, you confirm these details and documents are genuine and agree to the marketplace
                  terms. New stores start un-trusted (products need admin approval); AllBoutiqs can grant
                  trusted-partner status to publish instantly.
                </p>
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {progress ?? "Submit application"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <Footer />
    </div>
  );
}
