import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// A super admin is an admin who also sees the screens hidden for everyone
// else (src/lib/hiddenFeatures.ts). It's the super_admin row in user_roles,
// next to the person's admin row. Until a database has that role the check
// just answers no.
export function useSuperAdmin(): boolean {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["is-super-admin", user?.id],
    enabled: !!user,
    // Checked again after 30 s (on the next screen or tab focus), so a role
    // given or taken away while the site is open shows without a reload.
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", { _user_id: user!.id, _role: "super_admin" });
      return !error && data === true;
    },
  });
  return !!user && data === true;
}

// A hiddenFeatures switch as the signed-in person sees it: shown to everyone
// when it's on, and to super admins always. Only what's on screen changes -
// saved values and how the site works stay the same either way.
export function useShown(enabled: boolean): boolean {
  const superAdmin = useSuperAdmin();
  return enabled || superAdmin;
}
