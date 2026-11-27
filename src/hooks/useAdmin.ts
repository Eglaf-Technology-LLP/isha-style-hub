import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// Someone's roles hardly ever change, so each is asked once and shared by
// every screen for 10 minutes (it used to be asked by each screen on every
// mount and tab switch - ~100k has_role calls on 27 Nov 2026).
export const ROLE_STALE_MS = 10 * 60_000;

export function adminRoleQuery(userId: string | undefined) {
  return {
    queryKey: ["has-role", userId, "admin"],
    enabled: !!userId,
    staleTime: ROLE_STALE_MS,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("has_role", { _user_id: userId!, _role: "admin" });
      if (error) {
        console.error("Error checking admin status:", error);
        throw error;
      }
      return data === true;
    },
  };
}

export function useAdmin() {
  const { user, loading: authLoading } = useAuth();
  const { data, isPending } = useQuery(adminRoleQuery(user?.id));

  return {
    isAdmin: !!user && data === true,
    loading: authLoading || (!!user && isPending),
  };
}
