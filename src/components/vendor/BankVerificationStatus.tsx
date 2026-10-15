import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// The boutique's bank account check for RazorpayX payouts (₹1 deposit and
// the account-holder name at the bank).
export interface BankCheck {
  status: string;
  error: string | null;
}

const MESSAGES: Record<string, { tone: "muted" | "amber" | "green" | "red"; text: string }> = {
  none: { tone: "muted", text: "Save your bank details to get paid. We check the account with a ₹1 deposit." },
  not_started: { tone: "muted", text: "Bank details saved. We'll check the account with a ₹1 deposit before your first payout." },
  registered: { tone: "amber", text: "Bank details saved. We'll check the account with a ₹1 deposit before your first payout." },
  verifying: { tone: "amber", text: "Checking your bank account with a ₹1 deposit - this usually takes a few minutes." },
  verified: {
    tone: "green",
    text: "Bank account verified. You're paid every payout day for orders whose return/exchange window has closed.",
  },
  name_mismatch: {
    tone: "amber",
    text: "Your bank shows a different account-holder name. AllBoutiqs is reviewing it - payouts start once it's approved.",
  },
  invalid: { tone: "red", text: "Your bank couldn't confirm this account. Check the account number and IFSC and save again." },
  failed: { tone: "amber", text: "We couldn't check your bank account yet - we'll try again automatically." },
};

const TONES = {
  muted: "border-border bg-muted/50",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  red: "border-destructive/30 bg-destructive/10",
};

export function BankVerificationStatus({ check }: { check: BankCheck | null }) {
  const m = MESSAGES[check?.status ?? "none"] ?? MESSAGES.not_started;
  const Icon = m.tone === "green" ? CheckCircle2 : m.tone === "red" ? AlertTriangle : Clock;
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border p-3 text-sm", TONES[m.tone])} data-testid="bank-check">
      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", m.tone === "red" && "text-destructive", m.tone === "muted" && "text-muted-foreground")} />
      <p>{m.text}</p>
    </div>
  );
}
