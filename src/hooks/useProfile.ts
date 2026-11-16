import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { nationalPhone } from "@/lib/authIdentifier";

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

// Name and mobile number to start a first address with: the profile's name,
// and the account's verified mobile number (else one saved in the profile).
export function addressDefaults(user: User | null, profile: ProfileContact | null): { name: string; phone: string } {
  return {
    name: profile?.full_name?.trim() ?? "",
    phone: nationalPhone(user?.phone || profile?.phone?.trim() || ""),
  };
}

// Does ANOTHER account sign in with this email / number? null when the
// check itself failed.
export async function contactTaken(id: { email: string } | { phone: string }): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("contact_taken", "email" in id ? { _email: id.email } : { _phone: id.phone });
  return error ? null : !!data;
}

// After an address is saved: a profile with no name yet takes the address's
// name (client, 16 Nov 2026). The mobile number never goes to the profile
// from here - it's added in My Account and verified by SMS, since it signs
// in. Best effort - never blocks.
export async function fillProfileNameFromAddress(user: User, name: string): Promise<void> {
  if (!name.trim()) return;
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: name.trim() })
    .eq("user_id", user.id)
    .or("full_name.is.null,full_name.eq.");
  if (error) console.error("Couldn't copy the address name to the profile:", error.message);
}
