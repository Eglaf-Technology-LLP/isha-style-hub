import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { LEGAL_PATHS } from "@/lib/legal";
import { TERMS_FOR, type ConsentKind } from "@/lib/consent";

// The two boxes asked when an account is created: Privacy Policy + Terms
// (required) and promotional emails (optional). Links open in a new tab so
// nothing typed is lost.
export function ConsentFields({
  kind,
  accepted,
  onAccepted,
  marketing,
  onMarketing,
  error,
}: {
  kind: ConsentKind;
  accepted: boolean;
  onAccepted: (v: boolean) => void;
  marketing: boolean;
  onMarketing: (v: boolean) => void;
  error?: string | null;
}) {
  const link = "text-primary underline underline-offset-4";
  const terms = TERMS_FOR[kind];
  return (
    <div className="space-y-3 text-left text-sm leading-relaxed">
      <div className="space-y-1">
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            id="consent-terms"
            checked={accepted}
            onCheckedChange={(v) => onAccepted(v === true)}
            aria-invalid={!!error}
            className="mt-0.5"
          />
          <span>
            I agree to the{" "}
            <Link to={LEGAL_PATHS.privacy} target="_blank" className={link}>
              Privacy Policy
            </Link>{" "}
            and the{" "}
            <Link to={terms.path} target="_blank" className={link}>
              {terms.label}
            </Link>
            . *
          </span>
        </label>
        {error && (
          <p role="alert" className="pl-7 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox id="consent-marketing" checked={marketing} onCheckedChange={(v) => onMarketing(v === true)} className="mt-0.5" />
        <span>
          {kind === "seller"
            ? "Send me promotional emails from AllBoutiqs - news, offers and selling tips."
            : "Send me offers, new arrivals and news from AllBoutiqs by email."}{" "}
          <span className="text-muted-foreground">(optional)</span>
        </span>
      </label>
    </div>
  );
}

export const CONSENT_REQUIRED_MESSAGE = (kind: ConsentKind) =>
  `Please agree to the Privacy Policy and the ${TERMS_FOR[kind].label}.`;
