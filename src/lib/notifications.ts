import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from './auth';
import { supabase } from './supabase';

// The signed-in customer's notifications (notifications table) - the
// website's bell: last 50, in two areas ("order" and everything else),
// mark one or all read. Checked every 2 minutes while the app is open.

export interface AppNotification {
  id: string;
  title: string;
  body: string | null;
  category: 'order' | 'other' | string;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
}

export function useNotifications() {
  const userId = useSession(st => st.user?.id ?? null);
  return useQuery({
    queryKey: ['notifications', userId],
    enabled: !!userId,
    refetchInterval: 2 * 60 * 1000,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(50);
      return (data ?? []) as AppNotification[];
    },
  });
}

export function useUnreadCount() {
  const { data = [] } = useNotifications();
  return data.filter(n => !n.read_at).length;
}

export function useNotificationActions() {
  const qc = useQueryClient();
  const userId = useSession(st => st.user?.id ?? null);
  const key = ['notifications', userId];

  // Marked read on the phone straight away, then saved.
  const markRead = async (ids: string[]) => {
    if (!ids.length) return;
    const now = new Date().toISOString();
    qc.setQueryData<AppNotification[]>(key, cur =>
      (cur ?? []).map(n => (ids.includes(n.id) ? { ...n, read_at: now } : n)),
    );
    await supabase.from('notifications').update({ read_at: now }).in('id', ids);
  };

  return { markRead };
}
