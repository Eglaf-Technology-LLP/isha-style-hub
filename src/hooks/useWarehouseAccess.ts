import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { adminRoleQuery, ROLE_STALE_MS } from "./useAdmin";

// Who may use the warehouse screens: warehouse staff and admins (admins also
// make the decisions - partial parcels, inspection failures, undelivered
// parcels - and manage settings and staff). Both answers are shared and
// kept for 10 minutes, like useAdmin's.
export function useWarehouseAccess() {
  const { user, loading: authLoading } = useAuth();
  const admin = useQuery(adminRoleQuery(user?.id));
  const operate = useQuery({
    queryKey: ["can-operate-warehouse", user?.id],
    enabled: !!user,
    staleTime: ROLE_STALE_MS,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("can_operate_warehouse", { _user_id: user!.id });
      if (error) throw error;
      return data === true;
    },
  });

  return {
    canOperate: !!user && operate.data === true,
    isAdmin: !!user && admin.data === true,
    loading: authLoading || (!!user && (admin.isPending || operate.isPending)),
  };
}
