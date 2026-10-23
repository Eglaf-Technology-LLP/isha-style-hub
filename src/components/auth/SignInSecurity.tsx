import { useEffect, useState, type ReactNode } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { CheckCircle2, KeyRound, Loader2, Mail, Smartphone, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { PasswordInput } from "@/components/auth/InlineSignInForm";
import { useAuth } from "@/hooks/useAuth";
import { PASSWORD_MIN_LENGTH, formatPhone, hasOwnPassword, parseIdentifier, toE164 } from "@/lib/authIdentifier";
import { cn } from "@/lib/utils";

type Editing = "password" | "phone" | "email" | null;

// "Sign-in & security": the email, mobile number and password someone can
// sign in with. Add a mobile number (SMS code) or an email (email code) so
// both reach the same account, and set a password to skip codes. Used in
// My account (variant "store") and in a dialog for admins and boutiques.
export function SignInSecurity({ variant = "store" }: { variant?: "store" | "staff" }) {
  const { user, setPassword, sendPhoneChangeCode, verifyPhoneChange, sendEmailLinkCode, verifyEmailLink } = useAuth();
  const [editing, setEditing] = useState<Editing>(null);
  const store = variant === "store";
  if (!user) return null;

  const passwordSet = hasOwnPassword(user);
  const field = store ? "h-12 rounded-none border-foreground/20" : "";

  return (
    <div className={cn("divide-y divide-border border-border", store ? "border-b" : "rounded-md border")}>
      <Row
        icon={Mail}
        title="Email"
        value={user.email || "Not added"}
        verified={!!user.email}
        action={!user.email && editing !== "email" ? "Add email" : null}
        onAction={() => setEditing("email")}
        store={store}
      >
        {editing === "email" && (
          <CodeFlow
            kind="email"
            field={field}
            store={store}
            onCancel={() => setEditing(null)}
            send={(value) => sendEmailLinkCode(value)}
            verify={(value, code) => verifyEmailLink(value, code)}
            onDone={(value) => {
              setEditing(null);
              toast.success(`${value} added. You can sign in with it now.`);
            }}
          />
        )}
      </Row>

      <Row
        icon={Smartphone}
        title="Mobile number"
        value={user.phone ? formatPhone(user.phone) : "Not added"}
        verified={!!user.phone}
        action={editing === "phone" ? null : user.phone ? "Change" : "Add mobile"}
        onAction={() => setEditing("phone")}
        store={store}
      >
        {editing === "phone" && (
          <CodeFlow
            kind="phone"
            field={field}
            store={store}
            onCancel={() => setEditing(null)}
            send={(value) => sendPhoneChangeCode(value)}
            verify={(value, code) => verifyPhoneChange(value, code)}
            onDone={(value) => {
              setEditing(null);
              toast.success(`${formatPhone(value)} saved. You can sign in with it now.`);
            }}
          />
        )}
      </Row>

      <Row
        icon={KeyRound}
        title="Password"
        value={passwordSet ? "Set - sign in with it or a one-time code" : "Not set - you sign in with one-time codes"}
        verified={passwordSet}
        action={editing === "password" ? null : passwordSet ? "Change password" : "Set password"}
        onAction={() => setEditing("password")}
        store={store}
      >
        {editing === "password" && (
          <PasswordForm
            field={field}
            store={store}
            onCancel={() => setEditing(null)}
            save={setPassword}
            onDone={() => {
              setEditing(null);
              toast.success(passwordSet ? "Password changed" : "Password set. Next time, sign in with it or a code.");
            }}
          />
        )}
      </Row>
    </div>
  );
}

export function SignInSecurityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Password &amp; sign-in</DialogTitle>
          <DialogDescription>
            Sign in with your email or mobile number, using a one-time code or your own password.
          </DialogDescription>
        </DialogHeader>
        <SignInSecurity variant="staff" />
      </DialogContent>
    </Dialog>
  );
}

function Row({
  icon: Icon,
  title,
  value,
  verified,
  action,
  onAction,
  store,
  children,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  verified: boolean;
  action: string | null;
  onAction: () => void;
  store: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cn("py-5", !store && "px-4")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Icon className={cn("h-5 w-5 shrink-0", store ? "text-gold" : "text-muted-foreground")} strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <p className={store ? "text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground" : "text-sm font-medium"}>
            {title}
          </p>
          <p className={cn("mt-0.5 flex items-center gap-1.5 break-all text-sm", verified ? "text-foreground" : "text-muted-foreground")}>
            {value}
            {verified && title !== "Password" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="verified" />}
          </p>
        </div>
        {action && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAction}
            className={store ? "h-10 rounded-none border-foreground/20 px-4 text-[11px] uppercase tracking-[0.18em]" : ""}
          >
            {action}
          </Button>
        )}
      </div>
      {children && <div className="mt-4 sm:pl-9">{children}</div>}
    </div>
  );
}

function Actions({
  store,
  busy,
  disabled,
  label,
  onCancel,
}: {
  store: boolean;
  busy: boolean;
  disabled?: boolean;
  label: string;
  onCancel: () => void;
}) {
  const square = store ? "h-11 rounded-none text-[11px] uppercase tracking-[0.2em]" : "";
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy || disabled} className={square}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {label}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel} className={square}>
        Cancel
      </Button>
    </div>
  );
}

function PasswordForm({
  field,
  store,
  save,
  onCancel,
  onDone,
}: {
  field: string;
  store: boolean;
  save: (password: string) => Promise<{ error: string | null }>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (value.length < PASSWORD_MIN_LENGTH) return setError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
        setBusy(true);
        const { error } = await save(value);
        setBusy(false);
        if (error) return setError(error);
        onDone();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="security-password">New password</Label>
        <PasswordInput
          id="security-password"
          value={value}
          onChange={(v) => {
            setValue(v);
            setError(null);
          }}
          autoComplete="new-password"
          className={field}
        />
        <p className="text-xs text-muted-foreground">At least {PASSWORD_MIN_LENGTH} characters. One-time codes keep working too.</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Actions store={store} busy={busy} disabled={!value} label="Save password" onCancel={onCancel} />
    </form>
  );
}

// Enter an email/mobile -> a code is sent to it -> enter the code -> saved.
function CodeFlow({
  kind,
  field,
  store,
  send,
  verify,
  onCancel,
  onDone,
}: {
  kind: "email" | "phone";
  field: string;
  store: boolean;
  send: (value: string) => Promise<{ error: string | null; retryAfter: number | null }>;
  verify: (value: string, code: string) => Promise<{ error: string | null }>;
  onCancel: () => void;
  onDone: (value: string) => void;
}) {
  const [text, setText] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const target = () => {
    if (kind === "phone") return toE164(text);
    const id = parseIdentifier(text);
    return id?.kind === "email" ? id.value : null;
  };

  const requestCode = async (value: string) => {
    setBusy(true);
    setError(null);
    const { error, retryAfter } = await send(value);
    setBusy(false);
    if (retryAfter) setResendIn(retryAfter);
    if (error) return setError(error);
    if (!retryAfter) setResendIn(60);
    setSentTo(value);
    setCode("");
  };

  const check = async (value: string) => {
    if (!sentTo || value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error } = await verify(sentTo, value);
    setBusy(false);
    if (error) {
      setError(error);
      setCode("");
      return;
    }
    onDone(sentTo);
  };

  if (!sentTo) {
    return (
      <form
        className="max-w-sm space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const value = target();
          if (!value) {
            return setError(kind === "phone" ? "Enter a 10-digit mobile number." : "Enter a valid email address.");
          }
          requestCode(value);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`security-${kind}`}>{kind === "phone" ? "Mobile number" : "Email address"}</Label>
          <Input
            id={`security-${kind}`}
            type={kind === "phone" ? "tel" : "email"}
            autoComplete={kind === "phone" ? "tel" : "email"}
            placeholder={kind === "phone" ? "98765 43210" : "you@example.com"}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            className={field}
          />
          <p className="text-xs text-muted-foreground">
            {kind === "phone" ? "We'll text a 6-digit code to this number." : "We'll email a 6-digit code to this address."}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Actions store={store} busy={busy} disabled={!text.trim()} label="Send code" onCancel={onCancel} />
      </form>
    );
  }

  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        check(code);
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={`security-${kind}-code`}>Enter the code</Label>
        <p className="text-sm text-muted-foreground">
          Sent to <span className="font-medium text-foreground break-all">{kind === "phone" ? formatPhone(sentTo) : sentTo}</span>.{" "}
          {resendIn > 0 ? (
            <span>Resend in {resendIn}s</span>
          ) : (
            <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => requestCode(sentTo)}>
              Resend code
            </button>
          )}
        </p>
      </div>
      <InputOTP
        id={`security-${kind}-code`}
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        value={code}
        onChange={setCode}
        onComplete={check}
        autoComplete="one-time-code"
        autoFocus
        disabled={busy}
      >
        <InputOTPGroup>
          {Array.from({ length: 6 }, (_, i) => (
            <InputOTPSlot key={i} index={i} className="h-11 w-10 text-lg" />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Actions store={store} busy={busy} disabled={code.length !== 6} label="Verify" onCancel={onCancel} />
    </form>
  );
}
