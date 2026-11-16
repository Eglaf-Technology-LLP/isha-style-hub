import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { nationalPhone, signedUpWith, toE164 } from "@/lib/authIdentifier";

export interface ProfileContact {
  full_name: string | null;
  phone: string | null;
}

// The signed-in person's name and mobile number from their profile. null
// while loading or signed out.
export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileContact | null>(null);
  useEffect(() => {
    setProfile(null);
    if (!user) return;
    let alive = true;
    supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setProfile(data ?? { full_name: null, phone: null });
      });
    return () => {
      alive = false;
    };
    // Once per account, not per session refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  return { user, profile };
}

// Name and mobile number to start a first address with: the profile's, and
// for an account registered with a mobile number, that number.
export function addressDefaults(user: User | null, profile: ProfileContact | null): { name: string; phone: string } {
  return {
    name: profile?.full_name?.trim() ?? "",
    phone: nationalPhone(profile?.phone?.trim() || user?.phone || ""),
  };
}

// Does ANOTHER account sign in with this email / number, or have the number
// in its profile? null when the check itself failed.
export async function contactTaken(id: { email: string } | { phone: string }): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("contact_taken", "email" in id ? { _email: id.email } : { _phone: id.phone });
  return error ? null : !!data;
}

// After an address is saved: a profile with no name / mobile number yet
// takes them from the address (client, 16 Nov 2026). A number another
// account already has stays on the address only. An account registered
// with a mobile number keeps that number. Best effort - never blocks.
export async function fillProfileFromAddress(user: User, name: string, phone: string): Promise<void> {
  try {
    const { data: current } = await supabase.from("profiles").select("full_name, phone").eq("user_id", user.id).maybeSingle();
    const patch: Partial<ProfileContact> = {};
    if (!current?.full_name?.trim() && name.trim()) patch.full_name = name.trim();
    const e164 = toE164(phone);
    if (signedUpWith(user) === "email" && !current?.phone?.trim() && e164 && (await contactTaken({ phone: e164 })) === false) {
      patch.phone = e164;
    }
    if (!Object.keys(patch).length) return;
    const { error } = await supabase.from("profiles").update(patch).eq("user_id", user.id);
    if (error) console.error("Couldn't copy the address details to the profile:", error.message);
  } catch (e) {
    console.error("Couldn't copy the address details to the profile:", e);
  }
}
