import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// Who may use the warehouse screens: warehouse staff and admins (admins also
// make the decisions - partial parcels, inspection failures, undelivered
// parcels - and manage settings and staff).
export function useWarehouseAccess() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState({ canOperate: false, isAdmin: false, loading: true });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setState({ canOperate: false, isAdmin: false, loading: false });
      return;
    }
    let cancelled = false;
    Promise.all([
      supabase.rpc("can_operate_warehouse", { _user_id: user.id }),
      supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
    ]).then(([operate, admin]) => {
      if (cancelled) return;
      setState({ canOperate: operate.data === true, isAdmin: admin.data === true, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { ...state, loading: authLoading || state.loading };
}
