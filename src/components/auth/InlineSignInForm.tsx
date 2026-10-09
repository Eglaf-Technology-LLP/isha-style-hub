import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const CODE_LENGTH = 6;

// One form for signing in and signing up, for customers, boutiques and
// admins alike: email -> 6-digit code from the inbox -> signed in. No
// passwords; a new email simply becomes a new account (the name is added
// later in My Account). Every gated page's own useAuth()/onAuthStateChange
// subscription flips it out of the gated view the moment the session
// exists, so no redirect or onSuccess callback is needed here.
export function InlineSignInForm() {
  const navigate = useNavigate();
  const { sendEmailCode, verifyEmailCode } = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    setSending(true);
    setError(null);
    const { error, retryAfter } = await sendEmailCode(email.trim());
    setSending(false);
    if (retryAfter) setResendIn(retryAfter);
    if (error) {
      setError(error);
      return;
    }
    setCode("");
    setStep("code");
    toast.success(`Code sent to ${email.trim()}`);
  };

  const verify = async (value: string) => {
    if (value.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    const { error, isNewUser } = await verifyEmailCode(email.trim(), value);
    setVerifying(false);
    if (error) {
      // Clear the boxes and put the cursor back for a fresh try (the input
      // was disabled while checking, which dropped focus).
      setError(error);
      setCode("");
      window.setTimeout(() => codeInput.current?.focus(), 0);
      return;
    }
    if (isNewUser) {
      toast.success("Welcome to AllBoutiqs! Your account is ready.", {
        description: "Add your full name in My Account.",
        action: { label: "My Account", onClick: () => navigate("/account") },
        duration: 8000,
      });
    } else {
      toast.success("You're signed in");
    }
  };

  if (step === "email") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendCode();
        }}
        className="space-y-4 text-left"
      >
        <div className="space-y-2">
          <Label htmlFor="signin-email">Email address</Label>
          <Input
            id="signin-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            We'll email you a 6-digit code. New to AllBoutiqs? The same code creates your account.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={sending || !email.trim()}>
          {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Continue
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        verify(code);
      }}
      className="space-y-4 text-left"
    >
      <div className="space-y-1">
        <Label htmlFor="signin-code">Enter the code</Label>
        <p className="text-sm text-muted-foreground">
          We sent a 6-digit code to <span className="font-medium text-foreground break-all">{email.trim()}</span>.{" "}
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={() => {
              setStep("email");
              setError(null);
            }}
          >
            Change email
          </button>
        </p>
      </div>
      <InputOTP
        ref={codeInput}
        id="signin-code"
        maxLength={CODE_LENGTH}
        pattern={REGEXP_ONLY_DIGITS}
        value={code}
        onChange={setCode}
        onComplete={verify}
        autoComplete="one-time-code"
        autoFocus
        disabled={verifying}
        containerClassName="justify-center"
      >
        <InputOTPGroup>
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <InputOTPSlot key={i} index={i} className="h-12 w-11 text-lg" />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {error && (
        <p role="alert" className="text-sm text-destructive text-center">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={verifying || code.length !== CODE_LENGTH}>
        {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Verify and continue
      </Button>
      <div className="text-center text-sm text-muted-foreground">
        Didn't get it? Check spam, or{" "}
        {resendIn > 0 ? (
          <span>resend in {resendIn}s</span>
        ) : (
          <button
            type="button"
            className="text-primary font-medium underline-offset-4 hover:underline disabled:opacity-50"
            onClick={sendCode}
            disabled={sending}
          >
            {sending ? "sending..." : "Resend code"}
          </button>
        )}
      </div>
    </form>
  );
}
