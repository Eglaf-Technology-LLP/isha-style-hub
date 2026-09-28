import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// Backs the notification-style status-tab badges on the Orders pages
// (Pending/Cancelled/etc. - not "All Orders", which stays a real live
// total). `prefix` scopes keys per page/role (e.g. "orders_admin",
// "orders_vendor") so admin and vendor tracking never collide.
//
// The badge for a status only counts orders with `updated_at` after the
// last time that specific status tab was opened - opening a tab marks it
// "seen" right now, so anything that changes into that status afterward
// shows up again next time, but anything already sitting there when you
// looked doesn't keep nagging you.
export function useListSeenTracking(prefix: string) {
  const { user } = useAuth();
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("order_list_seen")
      .select("list_key, last_seen_at")
      .eq("user_id", user.id)
      .like("list_key", `${prefix}:%`)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach((row) => {
          map[row.list_key.slice(prefix.length + 1)] = row.last_seen_at;
        });
        setLastSeen(map);
        setLoaded(true);
      });
  }, [user, prefix]);

  const lastSeenAt = useCallback((key: string) => lastSeen[key] ?? null, [lastSeen]);

  const markSeen = useCallback(
    (key: string) => {
      if (!user) return;
      const now = new Date().toISOString();
      setLastSeen((prev) => ({ ...prev, [key]: now }));
      supabase
        .from("order_list_seen")
        .upsert({ user_id: user.id, list_key: `${prefix}:${key}`, last_seen_at: now }, { onConflict: "user_id,list_key" })
        .then();
    },
    [user, prefix],
  );

  return { lastSeenAt, markSeen, loaded };
}
