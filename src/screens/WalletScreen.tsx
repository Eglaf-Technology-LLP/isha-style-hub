import { Wallet } from 'lucide-react-native';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Eyebrow, Sans, Serif, Touch } from '@/components/ui';
import { useWallet, WALLET_KIND_LABEL } from '@/lib/account';
import { formatINR } from '@/lib/format';
import {
  DEFAULT_REFUND_CHARGE,
  orderNumber,
  refundChargeLabel,
  shortDate,
  useRefundCharge,
} from '@/lib/orders';
import { useGo } from '@/navigation';
import { colors, fonts } from '@/theme';

// AllBoutiqs Wallet: balance and history (refunds in, payments out). No top-up
// or withdrawal - same as the website. Used at checkout.
export default function WalletScreen() {
  const go = useGo();
  const { data, isLoading, isRefetching, refetch } = useWallet();
  const { data: refundCharge = DEFAULT_REFUND_CHARGE } = useRefundCharge();

  return (
    <View style={styles.flex}>
      <AppHeader back title="Wallet" />
      <FlatList
        data={data?.entries ?? []}
        keyExtractor={e => e.id}
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
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              <Eyebrow>AllBoutiqs Wallet</Eyebrow>
              {isLoading ? (
                <ActivityIndicator
                  color={colors.ivory}
                  style={styles.spinner}
                />
              ) : (
                <Serif style={styles.balance}>
                  {formatINR(data?.balance ?? 0)}
                </Serif>
              )}
              <Sans style={styles.heroText}>
                Refunds you choose to take to your wallet land here instantly,
                and you can use them on your next order.
              </Sans>
            </View>
            <View style={styles.how}>
              <Eyebrow style={styles.howHead}>How your wallet works</Eyebrow>
              {[
                "When you return an item or cancel a paid order, you can take the refund in your wallet - free of any charge. It's added instantly: for a return, as soon as the items pass our quality check.",
                'At checkout, your balance can pay for part of an order or the whole of it.',
                `Wallet balance can't be topped up, withdrawn to a bank account or transferred to someone else. You can also take a refund back to the card, UPI or netbanking you paid with, in full. For a Cash on Delivery order refunded to your bank account, a refund charge of ${refundChargeLabel(
                  refundCharge,
                )} is deducted (not when the item arrived damaged, was the wrong item or wasn't as described).`,
              ].map(t => (
                <View key={t} style={styles.point}>
                  <Text style={styles.bullet}>•</Text>
                  <Sans style={styles.pointText}>{t}</Sans>
                </View>
              ))}
            </View>
          </>
        }
        ListEmptyComponent={
          isLoading ? undefined : (
            <View style={styles.empty}>
              <Wallet size={28} color={colors.gold} strokeWidth={1.4} />
              <Sans style={styles.muted}>No wallet activity yet.</Sans>
            </View>
          )
        }
        renderItem={({ item: e }) => (
          <Touch
            style={styles.row}
            disabled={!e.order_id}
            onPress={() => e.order_id && go(`/order/${e.order_id}`)}
          >
            <View style={styles.flex}>
              <Text style={styles.kind}>
                {WALLET_KIND_LABEL[e.kind] ?? e.kind}
              </Text>
              <Sans style={styles.meta}>
                {shortDate(e.created_at)}
                {e.order_id ? ` · Order ${orderNumber(e.order_id)}` : ''}
              </Sans>
              {e.note ? <Sans style={styles.meta}>{e.note}</Sans> : null}
            </View>
            <Text
              style={[styles.amount, e.amount < 0 ? styles.out : styles.in]}
            >
              {e.amount < 0 ? '- ' : '+ '}
              {formatINR(Math.abs(e.amount))}
            </Text>
          </Touch>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: 32, flexGrow: 1 },
  hero: { backgroundColor: colors.maroonDeep, padding: 20, marginBottom: 8 },
  balance: { fontSize: 38, color: colors.ivory, marginTop: 6 },
  heroText: {
    color: 'rgba(252,251,248,0.75)',
    marginTop: 8,
    lineHeight: 20,
    fontSize: 13,
  },
  how: { backgroundColor: colors.ivory, padding: 16, marginBottom: 8 },
  howHead: { color: colors.foreground, marginBottom: 8 },
  point: { flexDirection: 'row', gap: 8, marginTop: 4 },
  bullet: { color: colors.mutedForeground, lineHeight: 19 },
  pointText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.mutedForeground,
  },
  spinner: { marginTop: 14, alignSelf: 'flex-start' },
  empty: { alignItems: 'center', paddingTop: 40, gap: 10 },
  muted: { color: colors.mutedForeground },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.ivory,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  kind: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.foreground,
  },
  meta: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  amount: { fontFamily: fonts.sansSemi, fontSize: 15 },
  in: { color: colors.success },
  out: { color: colors.foreground },
});
