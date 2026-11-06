import { Bell, Package } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { Sans, Serif, Touch } from '@/components/ui';
import {
  AppNotification,
  useNotificationActions,
  useNotifications,
} from '@/lib/notifications';
import { useGo } from '@/navigation';
import { colors, fonts } from '@/theme';

// Notifications in the website's two areas: Orders and Updates.
export default function NotificationsScreen() {
  const go = useGo();
  const { data = [], isLoading, isRefetching, refetch } = useNotifications();
  const { markRead } = useNotificationActions();
  const [tab, setTab] = useState<'order' | 'other'>('order');
  const list = data.filter(n =>
    tab === 'order' ? n.category === 'order' : n.category !== 'order',
  );
  const unread = (c: 'order' | 'other') =>
    data.filter(
      n =>
        !n.read_at &&
        (c === 'order' ? n.category === 'order' : n.category !== 'order'),
    ).length;

  const open = (n: AppNotification) => {
    if (!n.read_at) markRead([n.id]);
    if (n.link_url) go(n.link_url);
  };

  return (
    <View style={styles.flex}>
      <AppHeader back title="Notifications" />
      <View style={styles.tabs}>
        {(['order', 'other'] as const).map(t => (
          <Touch
            key={t}
            style={[styles.tab, tab === t && styles.tabOn]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
              {t === 'order' ? 'Orders' : 'Updates'}
              {unread(t) ? ` (${unread(t)})` : ''}
            </Text>
          </Touch>
        ))}
      </View>
      {unread(tab) ? (
        <Touch
          style={styles.markAll}
          onPress={() => markRead(list.filter(n => !n.read_at).map(n => n.id))}
        >
          <Text style={styles.markAllText}>Mark all read</Text>
        </Touch>
      ) : null}
      <FlatList
        data={list}
        keyExtractor={n => n.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetch();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loading}>
              {[0, 1, 2, 3].map(k => (
                <Skeleton key={k} style={styles.skeletonRow} />
              ))}
            </View>
          ) : (
            <View style={styles.empty}>
              <Bell size={30} color={colors.gold} strokeWidth={1.4} />
              <Serif style={styles.emptyTitle}>Nothing new</Serif>
              <Sans style={styles.muted}>
                {tab === 'order'
                  ? 'Order updates will show up here.'
                  : 'News from AllBoutiqs will show up here.'}
              </Sans>
            </View>
          )
        }
        renderItem={({ item: n }) => (
          <Touch
            style={[styles.row, !n.read_at && styles.unread]}
            onPress={() => open(n)}
          >
            <View style={styles.icon}>
              {n.category === 'order' ? (
                <Package size={17} color={colors.primary} strokeWidth={1.6} />
              ) : (
                <Bell size={17} color={colors.primary} strokeWidth={1.6} />
              )}
            </View>
            <View style={styles.flex1}>
              <Text style={[styles.title, !n.read_at && styles.titleUnread]}>
                {n.title}
              </Text>
              {n.body ? <Sans style={styles.body}>{n.body}</Sans> : null}
              <Sans style={styles.time}>{timeAgo(n.created_at)}</Sans>
            </View>
            {!n.read_at ? <View style={styles.dot} /> : null}
          </Touch>
        )}
      />
    </View>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.ivory,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 13 },
  tabOn: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.mutedForeground,
  },
  tabTextOn: { color: colors.foreground },
  markAll: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingTop: 10 },
  markAllText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.primary,
  },
  list: { paddingVertical: 8, flexGrow: 1 },
  loading: { padding: 16, gap: 10 },
  skeletonRow: { height: 64 },
  empty: {
    alignItems: 'center',
    paddingTop: 64,
    gap: 8,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 22 },
  muted: { color: colors.mutedForeground, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: colors.ivory,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  unread: { backgroundColor: colors.accent },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.foreground,
  },
  titleUnread: { color: colors.primary },
  body: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 3,
    lineHeight: 19,
  },
  time: { fontSize: 11, color: colors.mutedForeground, marginTop: 4 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
});
