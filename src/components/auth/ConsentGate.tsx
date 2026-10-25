import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStaffRole } from "@/hooks/useStaffRole";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ConsentFields, CONSENT_REQUIRED_MESSAGE } from "@/components/auth/ConsentFields";
import { acceptTerms, takePendingConsent, type ConsentKind } from "@/lib/consent";
import { LEGAL_PATHS } from "@/lib/legal";

// Every signed-in customer and seller has agreed to the Privacy Policy and
// their Terms. "Create account" asks before the code is sent - saved here as
// soon as the account exists. An account made another way (a sign-in code
// for a new email or number, or from before) is asked once, here. Sellers
// (the vendor area, Sell with us) agree to the Seller Terms. Admins and the
// warehouse tool aren't asked; the policy pages stay readable.
const NOT_ASKED = ["/admin", "/warehouse", ...Object.values(LEGAL_PATHS)];

export function ConsentGate() {
  const { user, signOut } = useAuth();
  const { role, loading } = useStaffRole();
  const { pathname } = useLocation();
  const [accepted, setAccepted] = useState<Record<ConsentKind, boolean> | null>(null);
  const [termsTicked, setTermsTicked] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const kind: ConsentKind =
    role === "vendor" || pathname.startsWith("/vendor") || pathname.startsWith("/sell-with-us") ? "seller" : "customer";
  const skip = !user || loading || role === "admin" || NOT_ASKED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    setAccepted(null);
    if (!user) return;
    let alive = true;
    supabase
      .from("profiles")
      .select("terms_accepted_at, seller_terms_accepted_at")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setAccepted({ customer: !!data?.terms_accepted_at, seller: !!data?.seller_terms_accepted_at });
      });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const needed = !skip && accepted !== null && !accepted[kind];

  // Ticked on "Create account" before the code was sent: save it now.
  useEffect(() => {
    if (!needed) return;
    const pending = takePendingConsent(kind);
    if (!pending) return;
    acceptTerms(kind, pending.marketing).then(({ error: e }) => {
      if (!e) setAccepted((a) => (a ? { ...a, [kind]: true } : a));
    });
  }, [needed, kind]);

  const accept = async () => {
    if (!termsTicked) {
      setError(CONSENT_REQUIRED_MESSAGE(kind));
      return;
    }
    setSaving(true);
    const { error: e } = await acceptTerms(kind, marketing);
    setSaving(false);
    if (e) return toast.error(e.message);
    setAccepted((a) => (a ? { ...a, [kind]: true } : a));
  };

  if (!needed) return null;
  return (
    <AlertDialog open>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif text-2xl font-normal">One last step</AlertDialogTitle>
          <AlertDialogDescription>
            {kind === "seller"
              ? "To sell on AllBoutiqs, please agree to our Privacy Policy and Seller Terms & Conditions."
              : "To continue, please agree to our Privacy Policy and Terms & Conditions."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ConsentFields
          kind={kind}
          accepted={termsTicked}
          onAccepted={(v) => {
            setTermsTicked(v);
            setError(null);
          }}
          marketing={marketing}
          onMarketing={setMarketing}
          error={error}
        />
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => signOut()}>
            Sign out
          </Button>
          <Button onClick={accept} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Agree and continue
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
