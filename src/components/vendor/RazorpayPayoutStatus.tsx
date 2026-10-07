import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";

interface RazorpayPayoutStatusProps {
  state: {
    razorpay_status: string;
    razorpay_error: string | null;
    razorpay_requirements: { description?: string; reason_code?: string }[] | null;
  } | null;
}

// Where the boutique stands with Razorpay, which actually sends payouts.
export function RazorpayPayoutStatus({ state }: RazorpayPayoutStatusProps) {
  if (state?.razorpay_error?.startsWith("Automatic payouts are being switched on")) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <Clock className="h-4 w-4 mt-0.5 shrink-0" />
        <p>{state.razorpay_error}</p>
      </div>
    );
  }
  if (!state || state.razorpay_status === "not_created") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
        <Clock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <p>Save your bank details and PAN to start receiving automatic payouts through Razorpay.</p>
      </div>
    );
  }
  if (state.razorpay_status === "activated") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
        <p>Razorpay has verified your bank account. Payouts are sent automatically when each return window ends.</p>
      </div>
    );
  }
  if (state.razorpay_status === "needs_clarification" || state.razorpay_status === "failed" || state.razorpay_error) {
    const reasons = (state.razorpay_requirements ?? []).map((r) => r.description ?? r.reason_code).filter(Boolean);
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
        <div>
          <p className="font-medium">Razorpay couldn't verify these details - payouts are paused.</p>
          {state.razorpay_error && <p className="mt-1">{state.razorpay_error}</p>}
          {reasons.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <p className="mt-1">Correct them above and save again. Your money stays safe until then.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <Clock className="h-4 w-4 mt-0.5 shrink-0" />
      <p>Razorpay is verifying your bank account (usually 10-15 minutes). We'll email you when it's done.</p>
    </div>
  );
}
