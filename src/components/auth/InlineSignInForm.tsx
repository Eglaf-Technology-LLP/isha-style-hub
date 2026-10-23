import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Eye, EyeOff, KeyRound, Loader2, Mail, MessageSquareText, Smartphone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  PASSWORD_MIN_LENGTH,
  formatPhone,
  looksLikePhone,
  parseIdentifier,
  type Identifier,
} from "@/lib/authIdentifier";
import { cn } from "@/lib/utils";

const CODE_LENGTH = 6;
const PHONE_RESEND_SECONDS = 60;
const METHOD_KEY = "allboutiqs:signin-method";

type Tab = "signin" | "signup";
type Method = "code" | "password";

function rememberedMethod(): Method {
  try {
    return localStorage.getItem(METHOD_KEY) === "password" ? "password" : "code";
  } catch {
    return "code";
  }
}

function rememberMethod(method: Method) {
  try {
    localStorage.setItem(METHOD_KEY, method);
  } catch {
    // private mode - the default (code) is fine
  }
}

const shown = (id: Identifier) => (id.kind === "phone" ? formatPhone(id.value) : id.value);

// One form for signing in and signing up, for customers, boutiques and
// admins alike. Email or mobile number, then either a 6-digit code (email:
// our SMTP via auth-email-otp; mobile: SMS via Supabase + Twilio Verify) or
// the person's own password. "Create account" and "Forgot password" both
// verify with a code first, then save the chosen password. A code for a new
// email/number simply creates the account. Every gated page's own
// useAuth()/onAuthStateChange subscription flips it out of the gated view
// the moment the session exists, so no redirect or onSuccess callback is
// needed here.
//
// variant "store": square storefront look with Sign in / Create account
// tabs. "staff" (admin, warehouse): default look, sign-in only.
export function InlineSignInForm({ variant = "store" }: { variant?: "store" | "staff" }) {
  const navigate = useNavigate();
  const { sendEmailCode, verifyEmailCode, sendPhoneCode, verifyPhoneCode, signInWithPassword, setPassword } = useAuth();
  const store = variant === "store";
  const [tab, setTab] = useState<Tab>("signin");
  const [view, setView] = useState<"form" | "reset" | "code">("form");
  const [method, setMethod] = useState<Method>(rememberedMethod);
  const [identifier, setIdentifier] = useState("");
  const [password, setPasswordText] = useState("");
  const [target, setTarget] = useState<Identifier | null>(null);
  // The password to save once the code is verified (Create account /
  // Forgot password).
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const parsed = parseIdentifier(identifier);
  const resetting = view === "reset";
  const usesPassword = resetting || tab === "signup" || method === "password";
  const passwordRequired = resetting || (tab === "signin" && method === "password");

  const switchTo = (next: { tab?: Tab; view?: "form" | "reset" }) => {
    if (next.tab) setTab(next.tab);
    setView(next.view ?? "form");
    setError(null);
  };

  const sendCode = async (id: Identifier, savePassword: string | null) => {
    setBusy(true);
    setError(null);
    const result = id.kind === "email" ? await sendEmailCode(id.value) : await sendPhoneCode(id.value);
    setBusy(false);
    if (result.retryAfter) setResendIn(result.retryAfter);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (id.kind === "phone" && !result.retryAfter) setResendIn(PHONE_RESEND_SECONDS);
    setTarget(id);
    setPendingPassword(savePassword);
    setCode("");
    setView("code");
    toast.success(id.kind === "phone" ? `Code texted to ${shown(id)}` : `Code sent to ${id.value}`);
  };

  const submit = async () => {
    if (!parsed) {
      setError(
        looksLikePhone(identifier)
          ? "Enter a 10-digit mobile number (or +country code for numbers outside India)."
          : "Enter a valid email address or mobile number.",
      );
      return;
    }
    if (usesPassword && (passwordRequired || password) && password.length < PASSWORD_MIN_LENGTH) {
      setError(`Your password needs at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (tab === "signin" && method === "password" && !resetting) {
      setBusy(true);
      setError(null);
      const { error } = await signInWithPassword(parsed, password);
      setBusy(false);
      if (error) return setError(error);
      rememberMethod("password");
      toast.success("You're signed in");
      return;
    }
    await sendCode(parsed, usesPassword && password ? password : null);
  };

  const verify = async (value: string) => {
    if (!target || value.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    const { error, isNewUser } =
      target.kind === "email" ? await verifyEmailCode(target.value, value) : await verifyPhoneCode(target.value, value);
    if (error) {
      // Clear the boxes and put the cursor back for a fresh try (the input
      // was disabled while checking, which dropped focus).
      setVerifying(false);
      setError(error);
      setCode("");
      window.setTimeout(() => codeInput.current?.focus(), 0);
      return;
    }
    // Signed in now. The page may already be swapping this form out; the
    // password still saves, since the session is the same client's.
    let passwordError: string | null = null;
    if (pendingPassword) passwordError = (await setPassword(pendingPassword)).error;
    setVerifying(false);
    rememberMethod(pendingPassword && !passwordError ? "password" : "code");

    if (passwordError) {
      toast.error("You're signed in, but your password wasn't saved", {
        description: `${passwordError} You can set it in My Account, under Sign-in & security.`,
        action: { label: "Set it now", onClick: () => navigate("/account?tab=security") },
        duration: 10000,
      });
    } else if (isNewUser) {
      toast.success("Welcome to AllBoutiqs! Your account is ready.", {
        description: pendingPassword
          ? "Next time, sign in with your password or a code. Add your full name in My Account."
          : "Add your full name in My Account.",
        action: { label: "My Account", onClick: () => navigate("/account") },
        duration: 8000,
      });
    } else if (pendingPassword) {
      toast.success("Password saved. You're signed in.");
    } else {
      toast.success("You're signed in");
    }
  };

  const fieldClass = store ? "h-12 rounded-none" : "h-11";
  const submitClass = store ? "h-12 w-full rounded-none text-[11px] uppercase tracking-[0.22em]" : "w-full";
  const linkClass = "text-primary underline-offset-4 hover:underline";

  if (view === "code" && target) {
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
            We {target.kind === "phone" ? "texted" : "sent"} a 6-digit code to{" "}
            <span className="font-medium text-foreground break-all">{shown(target)}</span>.{" "}
            <button
              type="button"
              className={linkClass}
              onClick={() => {
                setView(pendingPassword && tab === "signin" ? "reset" : "form");
                setError(null);
              }}
            >
              Change
            </button>
          </p>
          {pendingPassword && (
            <p className="text-xs text-muted-foreground">Your password is saved as soon as the code is right.</p>
          )}
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
        <Button type="submit" className={submitClass} disabled={verifying || code.length !== CODE_LENGTH}>
          {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Verify and continue
        </Button>
        <div className="text-center text-sm text-muted-foreground">
          Didn't get it? {target.kind === "email" ? "Check spam, or" : "Check the number, or"}{" "}
          {resendIn > 0 ? (
            <span>resend in {resendIn}s</span>
          ) : (
            <button
              type="button"
              className="text-primary font-medium underline-offset-4 hover:underline disabled:opacity-50"
              onClick={() => sendCode(target, pendingPassword)}
              disabled={busy}
            >
              {busy ? "sending..." : "Resend code"}
            </button>
          )}
        </div>
      </form>
    );
  }

  const IdIcon = parsed?.kind === "phone" || (!parsed && looksLikePhone(identifier)) ? Smartphone : parsed ? Mail : UserRound;
  const idHint = !parsed
    ? "Indian mobile numbers work without +91."
    : !usesPassword || resetting || tab === "signup"
      ? parsed.kind === "phone"
        ? `We'll text a code to ${shown(parsed)}.`
        : `We'll email a code to ${parsed.value}.`
      : null;

  const submitLabel = resetting
    ? "Send code"
    : tab === "signup"
      ? "Send verification code"
      : method === "password"
        ? "Sign in"
        : "Send code";

  const footnote: ReactNode = resetting ? (
    <button type="button" className={linkClass} onClick={() => switchTo({ view: "form" })}>
      Back to sign in
    </button>
  ) : tab === "signup" ? (
    "We'll send a 6-digit code to confirm the email or mobile number is yours."
  ) : method === "code" ? (
    "New to AllBoutiqs? The same code creates your account."
  ) : store ? (
    <>
      New here?{" "}
      <button type="button" className={linkClass} onClick={() => switchTo({ tab: "signup" })}>
        Create an account
      </button>
    </>
  ) : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5 text-left"
      noValidate
    >
      {resetting ? (
        <div className="space-y-1">
          <p className="font-medium">Set a new password</p>
          <p className="text-sm text-muted-foreground">
            We'll send a code to your email or mobile to confirm it's you, then save the new password. Never set one?
            This sets your first.
          </p>
        </div>
      ) : (
        store && (
          <div role="tablist" aria-label="Sign in or create an account" className="grid grid-cols-2 border-b border-border">
            {(
              [
                ["signin", "Sign in"],
                ["signup", "Create account"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => switchTo({ tab: value })}
                className={cn(
                  "-mb-px h-11 border-b-2 text-[11px] font-medium uppercase tracking-[0.2em] transition-colors",
                  tab === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )
      )}

      <div className="space-y-2">
        <Label htmlFor="signin-id">Email or mobile number</Label>
        <div className="relative">
          <IdIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="signin-id"
            type="text"
            inputMode={looksLikePhone(identifier) ? "tel" : "email"}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Email or 10-digit mobile"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              setError(null);
            }}
            className={cn(fieldClass, "pl-10")}
          />
        </div>
        {idHint && <p className="text-xs text-muted-foreground">{idHint}</p>}
      </div>

      {tab === "signin" && !resetting && (
        <div role="radiogroup" aria-label="How do you want to sign in?" className="grid grid-cols-2 gap-2">
          <MethodChoice active={method === "code"} onClick={() => setMethod("code")} icon={MessageSquareText} square={store}>
            One-time code
          </MethodChoice>
          <MethodChoice active={method === "password"} onClick={() => setMethod("password")} icon={KeyRound} square={store}>
            Password
          </MethodChoice>
        </div>
      )}

      {usesPassword && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="signin-password">
              {resetting ? "New password" : tab === "signup" ? "Create a password" : "Password"}
              {tab === "signup" && !resetting && <span className="font-normal text-muted-foreground"> (optional)</span>}
            </Label>
            {tab === "signin" && !resetting && (
              <button type="button" className={cn(linkClass, "text-xs")} onClick={() => switchTo({ view: "reset" })}>
                Forgot password?
              </button>
            )}
          </div>
          <PasswordInput
            value={password}
            onChange={(v) => {
              setPasswordText(v);
              setError(null);
            }}
            autoComplete={tab === "signin" && !resetting ? "current-password" : "new-password"}
            className={fieldClass}
          />
          {(resetting || tab === "signup") && (
            <p className="text-xs text-muted-foreground">
              At least {PASSWORD_MIN_LENGTH} characters.
              {tab === "signup" && !resetting && " Leave it empty to always sign in with a one-time code."}
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className={submitClass} disabled={busy || !identifier.trim() || (passwordRequired && !password)}>
        {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {submitLabel}
      </Button>

      {footnote && <p className="text-center text-xs text-muted-foreground">{footnote}</p>}
    </form>
  );
}

function MethodChoice({
  active,
  onClick,
  icon: Icon,
  square,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof KeyRound;
  square: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex h-11 items-center justify-center gap-2 border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        square ? "rounded-none" : "rounded-md",
        active
          ? "border-foreground bg-background font-medium text-foreground"
          : "border-foreground/15 text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4", active ? "text-primary" : "")} />
      {children}
    </button>
  );
}

export function PasswordInput({
  value,
  onChange,
  autoComplete,
  className,
  id = "signin-password",
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  className?: string;
  id?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(className, "pr-11")}
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
