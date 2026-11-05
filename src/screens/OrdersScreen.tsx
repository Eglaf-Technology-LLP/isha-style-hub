import { ChevronRight, Package } from 'lucide-react-native';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Button, Placeholder, Sans, Serif, Touch } from '@/components/ui';
import { useSession } from '@/lib/auth';
import { formatINR } from '@/lib/format';
import { orderLabel, orderNumber, shortDate, useMyOrders } from '@/lib/orders';
import { useGo } from '@/navigation';
import { colors, fonts } from '@/theme';

export const TONE = {
  done: { bg: '#E7F0E9', fg: colors.success },
  progress: { bg: colors.accent, fg: colors.primary },
  stopped: { bg: colors.muted, fg: colors.mutedForeground },
};

// My orders, newest first.
export default function OrdersScreen() {
  const go = useGo();
  const status = useSession(st => st.status);
  const orders = useMyOrders();

  if (status !== 'signed-in') {
    return (
      <View style={styles.flex}>
        <AppHeader back title="My orders" />
        <View style={styles.empty}>
          <Serif style={styles.emptyTitle}>Sign in to see your orders</Serif>
          <Button
            label="Sign in"
            onPress={() => go('/signin')}
            style={styles.cta}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <AppHeader back title="My orders" />
      <FlatList
        data={orders.data ?? []}
        keyExtractor={o => o.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={orders.isRefetching}
            onRefresh={() => {
              orders.refetch();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          orders.isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.spinner} />
          ) : orders.isError ? (
            <Sans style={styles.errorText}>
              Couldn't load your orders. Pull down to try again.
            </Sans>
          ) : (
            <View style={styles.empty}>
              <Package size={34} color={colors.gold} strokeWidth={1.4} />
              <Serif style={styles.emptyTitle}>No orders yet</Serif>
              <Button
                label="Start shopping"
                onPress={() => go('/category/all')}
                style={styles.cta}
              />
            </View>
          )
        }
        renderItem={({ item: o }) => {
          const label = orderLabel(o);
          const first = o.items[0];
          return (
            <Touch style={styles.card} onPress={() => go(`/order/${o.id}`)}>
              <View style={styles.thumb}>
                {first?.image ? (
                  <Image
                    source={{ uri: first.image }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                ) : (
                  <Placeholder
                    label={(first?.product_title ?? 'A').charAt(0)}
                  />
                )}
              </View>
              <View style={styles.info}>
                <Text
                  style={[
                    styles.badge,
                    {
                      backgroundColor: TONE[label.tone].bg,
                      color: TONE[label.tone].fg,
                    },
                  ]}
                >
                  {label.text}
                </Text>
                <Text style={styles.name} numberOfLines={1}>
                  {first?.product_title}
                  {o.items.length > 1 ? ` + ${o.items.length - 1} more` : ''}
                </Text>
                <Text style={styles.meta}>
                  {orderNumber(o.id)} · {shortDate(o.created_at)}
                </Text>
                <Text style={styles.total}>{formatINR(o.total)}</Text>
              </View>
              <ChevronRight size={18} color={colors.mutedForeground} />
            </Touch>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  list: { padding: 12, gap: 10, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: colors.ivory,
  },
  thumb: {
    width: 72,
    height: 96,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  info: { flex: 1, gap: 4 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  name: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.foreground,
  },
  meta: { fontFamily: fonts.sans, fontSize: 12, color: colors.mutedForeground },
  total: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.foreground },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: { fontSize: 22, textAlign: 'center' },
  cta: { alignSelf: 'stretch', marginTop: 8 },
  spinner: { marginTop: 48 },
  errorText: { textAlign: 'center', color: colors.destructive, marginTop: 48 },
});
