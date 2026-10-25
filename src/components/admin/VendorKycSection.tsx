import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CircleAlert, ExternalLink, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  BANK_PROOF_TYPES,
  DOCUMENTS_BY_CONSTITUTION,
  constitutionLabel,
  documentLabel,
  instagramHandle,
  type BusinessConstitution,
} from "@/lib/vendorKyc";
import { formatDate, formatDateTime } from "@/lib/dates";

interface Kyc {
  business_constitution: BusinessConstitution;
  legal_business_name: string;
  pan: string;
  gstin: string | null;
  primary_mobile: string;
  alternate_mobile: string;
  business_email: string;
  authorized_name: string;
  authorized_designation: string;
  authorized_mobile: string;
  authorized_email: string;
  contact_same_as_authorized: boolean;
  contact_name: string | null;
  contact_designation: string | null;
  contact_mobile: string | null;
  contact_email: string | null;
  bank_proof_type: string;
  submitted_at: string;
  brand_same_as_legal: boolean;
  brand_legal_declared_at: string | null;
  instagram_url: string | null;
  website_url: string | null;
  terms_accepted_at: string | null;
  terms_version: string | null;
  marketing_emails_opt_in: boolean;
}

function ExternalLinkValue({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline break-all">
      {children}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

interface VendorDocument {
  id: string;
  doc_type: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  created_at: string;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium break-words">{value || "—"}</div>
    </div>
  );
}

// Opens a private seller document in a new tab through a short-lived
// signed link. The tab opens first (popup blockers allow it inside the
// click), then is pointed at the link.
export async function openVendorDocument(filePath: string) {
  const tab = window.open("", "_blank");
  const { data, error } = await supabase.storage.from("vendor-documents").createSignedUrl(filePath, 300);
  if (error || !data?.signedUrl) {
    tab?.close();
    toast.error("Couldn't open the document");
    return;
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.location.assign(data.signedUrl);
}

// The PAN card the boutique uploaded at registration, if any, as a button.
export function PanCardButton({ vendorId }: { vendorId: string }) {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from("vendor_documents")
      .select("file_path")
      .eq("vendor_id", vendorId)
      .eq("doc_type", "pan_card")
      .maybeSingle()
      .then(({ data }) => setPath(data?.file_path ?? null));
  }, [vendorId]);
  if (!path) return <p className="text-xs text-muted-foreground">No PAN card uploaded</p>;
  return (
    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => openVendorDocument(path)}>
      <FileText className="h-3.5 w-3.5" /> View PAN card
    </Button>
  );
}

// What the boutique submitted on the seller registration form: constitution,
// identifiers, people, and the document checklist with each PDF openable
// through a short-lived signed link (the bucket is private).
export function VendorKycSection({ vendorId, brandName }: { vendorId: string; brandName: string }) {
  const [loading, setLoading] = useState(true);
  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("vendor_kyc").select("*").eq("vendor_id", vendorId).maybeSingle(),
      supabase.from("vendor_documents").select("id, doc_type, file_path, file_name, file_size, created_at").eq("vendor_id", vendorId),
    ]).then(([k, d]) => {
      setKyc((k.data as Kyc | null) ?? null);
      setDocuments((d.data as VendorDocument[] | null) ?? []);
      setLoading(false);
    });
  }, [vendorId]);

  const openDocument = async (doc: VendorDocument) => {
    setOpening(doc.id);
    await openVendorDocument(doc.file_path);
    setOpening(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!kyc) {
    return (
      <p className="text-sm text-muted-foreground rounded-md bg-muted/40 p-3">
        No registration details on file - this boutique registered before the seller registration form asked for
        business documents.
      </p>
    );
  }

  const checklist = [
    ...DOCUMENTS_BY_CONSTITUTION[kyc.business_constitution],
    { type: "bank_proof" as const, label: "Bank Proof" },
  ];
  const byType = new Map(documents.map((d) => [d.doc_type, d]));
  const missingRequired = checklist.filter((c) => !("optional" in c && c.optional) && !byType.has(c.type));
  const proofLabel = BANK_PROOF_TYPES.find((t) => t.value === kyc.bank_proof_type)?.label ?? kyc.bank_proof_type;

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Boutique / Brand Name" value={brandName} />
          <Field label="Legal Business Name" value={kyc.legal_business_name} />
        </div>
        <Field
          label="Brand name vs legal name"
          value={
            kyc.brand_same_as_legal
              ? "Same - the Boutique / Brand Name is the Legal Business Name"
              : "Different - the Boutique / Brand Name is not the Legal Business Name"
          }
        />
        {!kyc.brand_same_as_legal && (
          <p className="flex items-start gap-1.5 text-sm">
            {kyc.brand_legal_declared_at ? (
              <>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <span>
                  Declaration ticked on {formatDateTime(kyc.brand_legal_declared_at)}: the brand operates under, is owned by, or
                  is associated with the legal business.
                </span>
              </>
            ) : (
              <>
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>No declaration on file (applied before the declaration was asked for).</span>
              </>
            )}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label="Business Type" value={constitutionLabel(kyc.business_constitution)} />
        <Field
          label="Instagram"
          value={kyc.instagram_url ? <ExternalLinkValue href={kyc.instagram_url}>{instagramHandle(kyc.instagram_url) ?? kyc.instagram_url}</ExternalLinkValue> : null}
        />
        <Field label="Website" value={kyc.website_url ? <ExternalLinkValue href={kyc.website_url}>{kyc.website_url.replace(/^https?:\/\//, "")}</ExternalLinkValue> : null} />
        <Field label="Submitted" value={formatDateTime(kyc.submitted_at)} />
        <Field
          label="Privacy Policy & Seller Terms"
          value={
            kyc.terms_accepted_at
              ? `Accepted ${formatDateTime(kyc.terms_accepted_at)}${kyc.terms_version ? ` (version ${formatDate(kyc.terms_version)})` : ""}`
              : "Applied before sign-up asked for it"
          }
        />
        <Field label="Promotional emails" value={kyc.marketing_emails_opt_in ? "Yes - agreed at sign-up" : "No"} />
        <Field label="PAN" value={<span className="font-mono">{kyc.pan}</span>} />
        <Field label="GST Number" value={kyc.gstin ? <span className="font-mono">{kyc.gstin}</span> : null} />
        <Field label="Official Business Email" value={kyc.business_email} />
        <Field label="Primary Mobile" value={kyc.primary_mobile} />
        <Field label="Alternative Mobile" value={kyc.alternate_mobile} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-md border border-border p-3 space-y-1">
          <p className="text-xs text-muted-foreground">Authorized person</p>
          <p className="text-sm font-medium">
            {kyc.authorized_name} · {kyc.authorized_designation}
          </p>
          <p className="text-sm">
            {kyc.authorized_mobile} · {kyc.authorized_email}
          </p>
        </div>
        <div className="rounded-md border border-border p-3 space-y-1">
          <p className="text-xs text-muted-foreground">Contact person</p>
          {kyc.contact_same_as_authorized ? (
            <p className="text-sm">Same as the authorized person</p>
          ) : (
            <>
              <p className="text-sm font-medium">
                {kyc.contact_name} · {kyc.contact_designation}
              </p>
              <p className="text-sm">
                {kyc.contact_mobile} · {kyc.contact_email}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-medium">Documents</p>
          {missingRequired.length === 0 ? (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> All required documents uploaded
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <CircleAlert className="h-3 w-3" /> {missingRequired.length} missing
            </Badge>
          )}
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {checklist.map((item) => {
            const doc = byType.get(item.type);
            const optional = "optional" in item && item.optional;
            return (
              <li key={item.type} className="flex items-center gap-3 p-2.5">
                <FileText className={`h-4 w-4 shrink-0 ${doc ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    {item.type === "bank_proof" ? `Bank Proof (${proofLabel})` : documentLabel(kyc.business_constitution, item.type)}
                    {optional && <span className="text-xs text-muted-foreground"> · optional</span>}
                  </p>
                  {doc && <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>}
                </div>
                {doc ? (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openDocument(doc)} disabled={opening === doc.id}>
                    {opening === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                    View
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{optional ? "Not provided" : "Missing"}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
