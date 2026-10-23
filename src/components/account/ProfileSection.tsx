import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Camera, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { AccountSectionTitle, accountFieldClass, accountLabelClass } from "@/components/storefront/account/AccountKit";
import { userContact } from "@/lib/authIdentifier";

interface Profile {
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

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

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

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
          phone: data.phone || "",
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
      const { error } = await supabase
        .from("profiles")
        .upsert({
          user_id: user.id,
          full_name: profile.full_name,
          phone: profile.phone,
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
    .toUpperCase() || user?.email?.[0].toUpperCase() || "U";
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

          <div className="space-y-2">
            <Label htmlFor="email" className={accountLabelClass}>Email</Label>
            <Input
              id="email"
              value={user?.email || "Not added - see Sign-in & security"}
              disabled
              className={accountFieldClass}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className={accountLabelClass}>Phone number</Label>
            <Input
              id="phone"
              value={profile.phone || ""}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              placeholder="+91 9876543210"
              className={accountFieldClass}
            />
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
