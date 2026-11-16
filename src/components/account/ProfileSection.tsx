import { useState, useEffect } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Camera, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { contactTaken } from "@/hooks/useProfile";
import { toast } from "sonner";
import { PHOTO_ACCEPT, preparePhoto, uploadProblemMessage } from "@/lib/uploadPrep";
import { AccountSectionTitle, accountFieldClass, accountLabelClass } from "@/components/storefront/account/AccountKit";
import { formatPhone, nationalPhone, parseIdentifier, signedUpWith, toE164, userContact } from "@/lib/authIdentifier";

interface Profile {
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

const takenMessage = (what: "email" | "mobile number") =>
  `This ${what} is already registered with another AllBoutiqs account.`;

// Email and mobile number (client, 16 Nov 2026): the one the account was
// registered with is shown locked, for good - also after the other one is
// added and used to sign in. The other one can be added or changed, but
// never to one another account already has. Either one added here is
// confirmed with a code sent to it (email, or SMS) and becomes a second way
// to sign in to this same account.
export function ProfileSection() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    full_name: "",
    phone: "",
    avatar_url: null,
  });
  // Sign-up only asks for an email, so a new account's name is taken here.
  const [nameMissing, setNameMissing] = useState(false);
  const phoneLocked = signedUpWith(user) === "phone";

  // Once per account: adding an email refreshes the session (a new user
  // object), which mustn't wipe a name typed but not saved yet.
  useEffect(() => {
    if (user) {
      fetchProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, phone, avatar_url")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      setNameMissing(!data?.full_name?.trim());
      if (data) {
        setProfile({
          full_name: data.full_name || "",
          phone: nationalPhone(data.phone),
          avatar_url: data.avatar_url,
        });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      // The mobile number isn't typed in here: it's the account's verified
      // one (MobileField / registration), kept in the profile too.
      const { error } = await supabase
        .from("profiles")
        .upsert({
          user_id: user.id,
          full_name: profile.full_name,
          ...(user.phone ? { phone: `+${user.phone.replace(/\D/g, "")}` } : {}),
          avatar_url: profile.avatar_url,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (error) throw error;

      setNameMissing(!profile.full_name?.trim());
      toast.success("Profile updated successfully!");
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast.error(error.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked || !user) return;

    // JPG, PNG, WEBP or HEIC; HEIC becomes JPG and over 5 MB is compressed.
    let file: File;
    try {
      file = await preparePhoto(picked);
    } catch (e) {
      toast.error(uploadProblemMessage(e, picked.name));
      return;
    }

    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/avatar.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("category-images")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("category-images")
        .getPublicUrl(filePath);

      setProfile({ ...profile, avatar_url: urlData.publicUrl });
      toast.success("Avatar uploaded! Click Save to confirm.");
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      toast.error("Failed to upload avatar");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const initials = profile.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    // A mobile-only account's email is "" (not null), so "?." alone isn't
    // enough: ""[0] is undefined and .toUpperCase() on it blanked the page.
    .toUpperCase() || user?.email?.charAt(0).toUpperCase() || "U";
  const contact = userContact(user);

  return (
    <div className="grid gap-10 lg:grid-cols-[260px_1fr] lg:gap-16">
      {/* Avatar */}
      <div className="flex items-center gap-5 lg:flex-col lg:items-start">
        <div className="relative">
          <Avatar className="h-24 w-24 border border-gold/40 lg:h-32 lg:w-32">
            <AvatarImage src={profile.avatar_url || undefined} className="object-cover" />
            <AvatarFallback className="bg-ivory font-serif text-3xl text-primary">{initials}</AvatarFallback>
          </Avatar>
          <label
            htmlFor="avatar-upload"
            className="absolute bottom-1 right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-maroon-deep"
            aria-label="Change photo"
          >
            <Camera className="h-4 w-4" />
            <input
              id="avatar-upload"
              type="file"
              accept={PHOTO_ACCEPT}
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </label>
        </div>
        <div className="min-w-0">
          <p className="font-serif text-2xl leading-tight">{profile.full_name || "Set your name"}</p>
          <p className="mt-1 break-all text-sm text-muted-foreground">{contact}</p>
        </div>
      </div>

      <div>
        <AccountSectionTitle title="Profile information" text="Update your personal details and contact information" />

        {nameMissing && (
          <p className="mb-6 border border-gold/40 bg-ivory px-4 py-3 text-sm">
            Add your full name to finish setting up your account. Boutiques and couriers use it for your orders, and it
            appears on your invoices.
          </p>
        )}

        {/* Form */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="full_name" className={accountLabelClass}>Full name</Label>
            <Input
              id="full_name"
              value={profile.full_name || ""}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
              placeholder="Enter your full name"
              autoFocus={nameMissing}
              className={accountFieldClass}
            />
          </div>

          {phoneLocked ? (
            <VerifiedField kind="email" current={user?.email ?? ""} />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="email" className={accountLabelClass}>Email</Label>
              <Input id="email" value={user?.email ?? ""} disabled className={accountFieldClass} />
              <p className="text-xs text-muted-foreground">You registered with this email, so it can't be changed.</p>
            </div>
          )}

          {phoneLocked ? (
            <div className="space-y-2">
              <Label htmlFor="phone" className={accountLabelClass}>Mobile number</Label>
              <Input id="phone" value={formatPhone(user?.phone)} disabled className={accountFieldClass} />
              <p className="text-xs text-muted-foreground">You registered with this number, so it can't be changed.</p>
            </div>
          ) : (
            // An unverified number saved here before (old accounts) is
            // offered for verifying.
            <VerifiedField kind="phone" current={user?.phone ?? ""} suggested={profile.phone ?? ""} />
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-8 inline-flex h-12 items-center gap-2 bg-primary px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground transition-colors hover:bg-maroon-deep disabled:opacity-70"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save changes
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// The email or mobile number the account was NOT registered with: add it,
// or change it, by confirming a code sent to it (email: auth-email-otp,
// purpose "link"; mobile: an SMS from Supabase Auth). It then signs in to
// this same account. current: the verified one, as auth.users has it
// (email, or 919876543210). suggested: an unverified number to start with.
function VerifiedField({ kind, current, suggested = "" }: { kind: "email" | "phone"; current: string; suggested?: string }) {
  const { sendEmailLinkCode, verifyEmailLink, sendPhoneChangeCode, verifyPhoneChange } = useAuth();
  const phone = kind === "phone";
  const shownCurrent = phone ? nationalPhone(current) : current;
  const [text, setText] = useState(shownCurrent || suggested);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Shows the saved one once it's confirmed.
  useEffect(() => setText(shownCurrent || suggested), [shownCurrent, suggested]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  // What a code would go to: an email, or +919876543210.
  const parsed = parseIdentifier(text);
  const value = phone ? toE164(text) : parsed?.kind === "email" ? parsed.value : null;
  const currentValue = phone ? (current ? `+${current.replace(/\D/g, "")}` : "") : current.toLowerCase();
  const changed = (value ?? text.trim().toLowerCase()) !== currentValue;
  const shown = (v: string) => (phone ? formatPhone(v) : v);

  const sendCode = async (target: string) => {
    setBusy(true);
    setError(null);
    if (await contactTaken(phone ? { phone: target } : { email: target })) {
      setBusy(false);
      setError(takenMessage(phone ? "mobile number" : "email"));
      return;
    }
    const { error, retryAfter } = phone ? await sendPhoneChangeCode(target) : await sendEmailLinkCode(target);
    setBusy(false);
    if (retryAfter) setResendIn(retryAfter);
    if (error) return setError(error);
    if (!retryAfter) setResendIn(60);
    setSentTo(target);
    setCode("");
  };

  const check = async (typed: string) => {
    if (!sentTo || typed.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error } = phone ? await verifyPhoneChange(sentTo, typed) : await verifyEmailLink(sentTo, typed);
    setBusy(false);
    if (error) {
      setError(error);
      setCode("");
      return;
    }
    toast.success(`${shown(sentTo)} saved. You can sign in with it too.`);
    setSentTo(null);
  };

  const button =
    "inline-flex h-10 items-center gap-2 border border-foreground px-4 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors hover:bg-foreground hover:text-background disabled:pointer-events-none disabled:opacity-50";

  return (
    <div className="space-y-2">
      <Label htmlFor={kind} className={accountLabelClass}>{phone ? "Mobile number" : "Email"}</Label>
      <Input
        id={kind}
        type={phone ? "tel" : "email"}
        autoComplete={phone ? "tel" : "email"}
        placeholder={phone ? "10-digit mobile number" : "you@example.com"}
        value={text}
        disabled={!!sentTo}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        aria-invalid={!!error}
        className={accountFieldClass}
      />

      {sentTo ? (
        <div className="space-y-3 pt-1">
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code sent to <span className="break-all font-medium text-foreground">{shown(sentTo)}</span>.{" "}
            {resendIn > 0 ? (
              <span>Resend in {resendIn}s</span>
            ) : (
              <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => sendCode(sentTo)}>
                Resend code
              </button>
            )}
          </p>
          <InputOTP
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
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy || code.length !== 6} onClick={() => check(code)}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify
            </button>
            <button
              type="button"
              className="h-10 px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSentTo(null);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        changed &&
        text.trim() && (
          <button type="button" className={button} disabled={busy || !value} onClick={() => value && sendCode(value)}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {phone ? (current ? "Verify new number" : "Verify number") : current ? "Verify new email" : "Verify email"}
          </button>
        )
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        !sentTo && (
          <p className="text-xs text-muted-foreground">
            {changed && text.trim() && !value
              ? phone
                ? "Enter a 10-digit mobile number (or +country code for numbers outside India)."
                : "Enter a valid email address."
              : phone
                ? "We'll text a code to confirm it. You can then sign in with it too."
                : "We'll email a code to confirm it. You can then sign in with it too."}
          </p>
        )
      )}
    </div>
  );
}
