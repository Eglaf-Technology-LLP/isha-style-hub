import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CircleAlert, ExternalLink, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  BANK_PROOF_TYPES,
  DOCUMENTS_BY_CONSTITUTION,
  constitutionLabel,
  documentLabel,
  type BusinessConstitution,
} from "@/lib/vendorKyc";

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

// What the boutique submitted on the seller registration form: constitution,
// identifiers, people, and the document checklist with each PDF openable
// through a short-lived signed link (the bucket is private).
export function VendorKycSection({ vendorId }: { vendorId: string }) {
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
    // Open the tab first (popup blockers allow it inside the click), then
    // point it at the signed URL.
    const tab = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("vendor-documents").createSignedUrl(doc.file_path, 300);
    setOpening(null);
    if (error || !data?.signedUrl) {
      tab?.close();
      toast.error("Couldn't open the document");
      return;
    }
    if (tab) tab.location.href = data.signedUrl;
    else window.location.assign(data.signedUrl);
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label="Business Constitution" value={constitutionLabel(kyc.business_constitution)} />
        <Field label="Legal Business Name" value={kyc.legal_business_name} />
        <Field label="Submitted" value={format(new Date(kyc.submitted_at), "MMM d, yyyy")} />
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
