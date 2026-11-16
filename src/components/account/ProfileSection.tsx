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
// never to one another account already has. An email added here is
// confirmed with a code and becomes a second way to sign in; a mobile
// number added here is the contact number for orders.
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
  const [phoneError, setPhoneError] = useState<string | null>(null);
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

    setPhoneError(null);
    setSaving(true);
    try {
      // Registered with a mobile number: the profile keeps that number.
      // Otherwise the typed one, if it's a real number no other account has.
      let phone: string | null = null;
      if (phoneLocked) {
        phone = user.phone ? `+${user.phone.replace(/\D/g, "")}` : null;
      } else if (profile.phone?.trim()) {
        phone = toE164(profile.phone);
        if (!phone) {
          setPhoneError("Enter a 10-digit mobile number (or +country code for numbers outside India).");
          return;
        }
        if (await contactTaken({ phone })) {
          setPhoneError(takenMessage("mobile number"));
          return;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .upsert({
          user_id: user.id,
          full_name: profile.full_name,
          phone,
          avatar_url: profile.avatar_url,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (error) throw error;

      setProfile((p) => ({ ...p, phone: nationalPhone(phone) }));
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
    const file = event.target.files?.[0];
    if (!file || !user) return;

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
              accept="image/*"
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
            <EmailField current={user?.email ?? ""} />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="email" className={accountLabelClass}>Email</Label>
              <Input id="email" value={user?.email ?? ""} disabled className={accountFieldClass} />
              <p className="text-xs text-muted-foreground">You registered with this email, so it can't be changed.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="phone" className={accountLabelClass}>Mobile number</Label>
            {phoneLocked ? (
              <>
                <Input id="phone" value={formatPhone(user?.phone)} disabled className={accountFieldClass} />
                <p className="text-xs text-muted-foreground">You registered with this number, so it can't be changed.</p>
              </>
            ) : (
              <>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={profile.phone || ""}
                  onChange={(e) => {
                    setProfile({ ...profile, phone: e.target.value });
                    setPhoneError(null);
                  }}
                  placeholder="10-digit mobile number"
                  aria-invalid={!!phoneError}
                  className={accountFieldClass}
                />
                {phoneError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {phoneError}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">For your orders and deliveries.</p>
                )}
              </>
            )}
          </div>
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

// The email of an account registered with a mobile number: add one, or
// change it, by confirming a code sent to it. It then signs in to this same
// account (auth-email-otp, purpose "link").
function EmailField({ current }: { current: string }) {
  const { sendEmailLinkCode, verifyEmailLink } = useAuth();
  const [text, setText] = useState(current);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Shows the saved email once it's confirmed.
  useEffect(() => setText(current), [current]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const parsed = parseIdentifier(text);
  const email = parsed?.kind === "email" ? parsed.value : null;
  const changed = text.trim().toLowerCase() !== current.toLowerCase();

  const sendCode = async (value: string) => {
    setBusy(true);
    setError(null);
    if (await contactTaken({ email: value })) {
      setBusy(false);
      setError(takenMessage("email"));
      return;
    }
    const { error, retryAfter } = await sendEmailLinkCode(value);
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
    const { error } = await verifyEmailLink(sentTo, value);
    setBusy(false);
    if (error) {
      setError(error);
      setCode("");
      return;
    }
    toast.success(`${sentTo} saved. You can sign in with it too.`);
    setSentTo(null);
  };

  const button =
    "inline-flex h-10 items-center gap-2 border border-foreground px-4 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors hover:bg-foreground hover:text-background disabled:pointer-events-none disabled:opacity-50";

  return (
    <div className="space-y-2">
      <Label htmlFor="email" className={accountLabelClass}>Email</Label>
      <Input
        id="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
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
            Enter the 6-digit code sent to <span className="break-all font-medium text-foreground">{sentTo}</span>.{" "}
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
          <button type="button" className={button} disabled={busy || !email} onClick={() => email && sendCode(email)}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {current ? "Verify new email" : "Verify email"}
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
            {changed && text.trim() && !email
              ? "Enter a valid email address."
              : "We'll email a code to confirm it. You can then sign in with it too."}
          </p>
        )
      )}
    </div>
  );
}
