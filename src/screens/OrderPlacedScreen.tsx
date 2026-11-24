import { CheckCircle2 } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Eyebrow, Sans, Serif } from '@/components/ui';
import { formatDateInWordsWithDay } from '@/lib/dates';
import { formatINR } from '@/lib/format';
import { goodsSplitRows, useGoodsSplitter } from '@/lib/orderAmounts';
import { orderNumber, useMyOrders } from '@/lib/orders';
import { paymentModeLine } from '@/lib/paymentMode';
import { useGo, useParams } from '@/navigation';
import { colors, fonts } from '@/theme';

// After an order is placed (COD, wallet, or a verified online payment) - the
// website's OrderPlacedSummary: how it was paid and what was ordered, from
// the order itself.
export default function OrderPlacedScreen() {
  const { id } = useParams<'OrderPlaced'>();
  const go = useGo();
  const insets = useSafeAreaInsets();
  const { data: orders } = useMyOrders();
  // Product value / customisation / GST, as checkout showed them.
  const splitGoods = useGoodsSplitter(true);
  const o = orders?.find(x => x.id === id);
  const a = o?.shipping_address ?? {};
  const place = [a.city, a.state].filter(Boolean).join(', ');
  const split = o ? splitGoods(o.items, o) : null;

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingTop: insets.top + 40 }]}
      >
        <View style={styles.center}>
          <CheckCircle2 size={64} color={colors.success} strokeWidth={1.4} />
          <Eyebrow style={styles.eyebrow}>Thank you</Eyebrow>
          <Serif style={styles.title}>Your order is placed</Serif>
          {o ? (
            // How it was paid: "Paid by UPI", or "Pay ₹X in cash when it
            // arrives" for Cash on Delivery (client, 24 Nov 2026).
            <Sans style={styles.note}>
              {paymentModeLine(o, Number(o.total))}. We've emailed you the
              details.
            </Sans>
          ) : null}
          <Sans style={styles.text}>Order {orderNumber(id)}</Sans>
        </View>

        {o ? (
          <View style={styles.card}>
            {o.items.map(i => (
              <View key={i.id} style={styles.item}>
                <View style={styles.flex1}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {i.product_title}
                  </Text>
                  <Sans style={styles.small}>
                    {i.variant_title && i.variant_title !== 'Default'
                      ? `${i.variant_title} · `
                      : ''}
                    Qty {i.quantity}
                  </Sans>
                </View>
                <Sans>{formatINR(Number(i.price) * i.quantity)}</Sans>
              </View>
            ))}
            <View style={styles.rule} />
            {split ? (
              goodsSplitRows(split).map(([label, amount]) => (
                <Row key={label} label={label} value={formatINR(amount)} />
              ))
            ) : (
              <Row label="Subtotal" value={formatINR(o.subtotal)} />
            )}
            {Number(o.discount_amount) > 0 ? (
              <Row
                label={`Discount${
                  o.discount_code ? ` (${o.discount_code})` : ''
                }`}
                value={`-${formatINR(o.discount_amount)}`}
                primary
              />
            ) : null}
            <Row
              label="Delivery"
              value={
                Number(o.shipping_cost) > 0
                  ? formatINR(o.shipping_cost)
                  : 'Free'
              }
            />
            {Number(o.cod_charge) > 0 ? (
              <Row
                label="Cash on Delivery fee (incl. GST)"
                value={formatINR(o.cod_charge)}
              />
            ) : null}
            <View style={styles.rule} />
            <Row label="Total" value={formatINR(o.total)} strong />
            {Number(o.wallet_amount) > 0 ? (
              <Row
                label="Paid from your wallet"
                value={formatINR(o.wallet_amount)}
              />
            ) : null}
            <View style={styles.rule} />
            <Sans style={styles.small}>
              <Text style={styles.dark}>Delivering to</Text> {o.customer_name},{' '}
              {[
                a.address_line1,
                a.address_line2,
                place && a.pincode ? `${place} ${a.pincode}` : place,
              ]
                .filter(Boolean)
                .join(', ')}
            </Sans>
            {o.estimated_delivery_date ? (
              <Sans style={[styles.small, styles.gapSm]}>
                <Text style={styles.dark}>Expected by</Text>{' '}
                {formatDateInWordsWithDay(o.estimated_delivery_date)}
              </Sans>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.actions, { paddingBottom: insets.bottom + 20 }]}>
        <Button
          label="Track your order"
          variant="outline"
          onPress={() => go(`/order/${id}`, { replace: true })}
        />
        <Button label="Continue shopping" onPress={() => go('/')} />
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  strong,
  primary,
}: {
  label: string;
  value: string;
  strong?: boolean;
  primary?: boolean;
}) {
  const tone = strong ? styles.strong : primary ? styles.primary : styles.muted;
  return (
    <View style={styles.row}>
      <Sans style={tone}>{label}</Sans>
      <Sans style={[strong && styles.strong, primary && styles.primary]}>
        {value}
      </Sans>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ivory },
  flex1: { flex: 1 },
  body: { paddingHorizontal: 24, paddingBottom: 24 },
  center: { alignItems: 'center' },
  eyebrow: { marginTop: 20 },
  title: { fontSize: 30, marginTop: 6, textAlign: 'center' },
  text: { marginTop: 14, color: colors.foreground },
  note: {
    marginTop: 12,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 21,
  },
  card: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: 16,
  },
  item: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  itemName: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.foreground,
  },
  small: { fontSize: 13, color: colors.mutedForeground, lineHeight: 19 },
  dark: { color: colors.foreground },
  gapSm: { marginTop: 4 },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 3,
  },
  muted: { color: colors.mutedForeground },
  primary: { color: colors.primary },
  strong: { fontFamily: fonts.sansSemi, fontSize: 16 },
  actions: { gap: 10, paddingHorizontal: 24, paddingTop: 12 },
});
