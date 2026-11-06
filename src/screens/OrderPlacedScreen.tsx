import { CheckCircle2 } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Eyebrow, Sans, Serif } from '@/components/ui';
import { formatINR } from '@/lib/format';
import {
  orderNumber,
  paymentLabel,
  shortDate,
  useMyOrders,
} from '@/lib/orders';
import { useGo, useParams } from '@/navigation';
import { colors } from '@/theme';

// After an order is placed (COD, wallet, or a verified online payment).
export default function OrderPlacedScreen() {
  const { id } = useParams<'OrderPlaced'>();
  const go = useGo();
  const insets = useSafeAreaInsets();
  const { data: orders } = useMyOrders();
  const o = orders?.find(x => x.id === id);

  return (
    <View
      style={[
        styles.flex,
        { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 },
      ]}
    >
      <View style={styles.center}>
        <CheckCircle2 size={64} color={colors.success} strokeWidth={1.4} />
        <Eyebrow style={styles.eyebrow}>Thank you</Eyebrow>
        <Serif style={styles.title}>Your order is placed</Serif>
        <Sans style={styles.text}>Order {orderNumber(id)}</Sans>
        {o ? (
          <>
            <Sans style={styles.text}>
              {formatINR(o.total)} · {paymentLabel(o)}
            </Sans>
            {o.estimated_delivery_date ? (
              <Sans style={styles.text}>
                Estimated delivery by {shortDate(o.estimated_delivery_date)}
              </Sans>
            ) : null}
          </>
        ) : null}
        <Sans style={styles.note}>
          We've emailed you the details. Every piece is quality-checked before
          it ships.
        </Sans>
      </View>
      <View style={styles.actions}>
        <Button
          label="View order"
          onPress={() => go(`/order/${id}`, { replace: true })}
        />
        <Button
          label="Continue shopping"
          variant="outline"
          onPress={() => go('/')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.ivory,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  center: { alignItems: 'center', marginTop: 40 },
  eyebrow: { marginTop: 20 },
  title: { fontSize: 30, marginTop: 6, textAlign: 'center' },
  text: { marginTop: 6, color: colors.foreground },
  note: {
    marginTop: 18,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 21,
  },
  actions: { gap: 10 },
});
