import {
  Ban,
  FileText,
  MessageCircle,
  RefreshCw,
  RotateCcw,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import {
  CancelSheet,
  RefundHistory,
  ReorderSheet,
} from '@/components/OrderActions';
import { ReturnRequests, ReturnSheet } from '@/components/ReturnSheet';
import { returnWindow } from '@/lib/returns';
import { Eyebrow, Placeholder, Sans, Touch } from '@/components/ui';
import { CONFIG } from '@/config';
import { formatINR } from '@/lib/format';
import {
  orderLabel,
  orderNumber,
  orderStage,
  paymentLabel,
  shortDate,
  STAGES,
  useMyOrders,
  cancellableParts,
  invoiceState,
} from '@/lib/orders';
import { useGo, useParams } from '@/navigation';
import { colors, fonts } from '@/theme';
import { TONE } from './OrdersScreen';

// One order: progress, pieces, delivery address and the bill.
export default function OrderScreen() {
  const { id } = useParams<'Order'>();
  const go = useGo();
  const { data: orders, isLoading } = useMyOrders();
  const o = orders?.find(x => x.id === id);
  const [sheet, setSheet] = useState<'cancel' | 'reorder' | 'return' | null>(
    null,
  );

  if (!o) {
    return (
      <View style={styles.flex}>
        <AppHeader back title="Order" />
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.spinner} />
        ) : (
          <Sans style={styles.missing}>This order isn't in your account.</Sans>
        )}
      </View>
    );
  }

  const label = orderLabel(o);
  const stopped = label.tone === 'stopped';
  const stage = orderStage(o);
  const a = o.shipping_address ?? {};
  const canCancel = cancellableParts(o).length > 0;
  const returnWin = returnWindow(o);
  const help = `Hi AllBoutiqs, I need help with my order ${orderNumber(o.id)}.`;

  return (
    <View style={styles.flex}>
      <AppHeader back title={`Order ${orderNumber(o.id)}`} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.block}>
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
          <Sans style={styles.meta}>Placed on {shortDate(o.created_at)}</Sans>
          {returnWin.items.length && returnWin.until ? (
            <Sans style={styles.meta}>
              Return or exchange until {shortDate(returnWin.until)}
            </Sans>
          ) : null}
          {o.estimated_delivery_date && stage < 4 && !stopped ? (
            <Sans style={styles.meta}>
              Expected by {shortDate(o.estimated_delivery_date)}
            </Sans>
          ) : null}
          {!stopped ? (
            <View style={styles.timeline}>
              {STAGES.map((s, i) => (
                <View key={s} style={styles.step}>
                  <View style={[styles.dot, i <= stage && styles.dotOn]} />
                  {i < STAGES.length - 1 ? (
                    <View style={[styles.line, i < stage && styles.lineOn]} />
                  ) : null}
                  <Text
                    style={[styles.stepText, i <= stage && styles.stepTextOn]}
                  >
                    {s}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.actions}>
            {returnWin.items.length ? (
              <Touch style={styles.action} onPress={() => setSheet('return')}>
                <RotateCcw size={14} color={colors.foreground} />
                <Text style={styles.actionText}>Return or exchange</Text>
              </Touch>
            ) : null}
            {canCancel ? (
              <Touch
                style={[styles.action, styles.actionDanger]}
                onPress={() => setSheet('cancel')}
              >
                <Ban size={14} color={colors.destructive} />
                <Text style={[styles.actionText, styles.danger]}>
                  Cancel order
                </Text>
              </Touch>
            ) : o.shipments.length ? (
              <Touch style={styles.action} onPress={() => setSheet('reorder')}>
                <RefreshCw size={14} color={colors.foreground} />
                <Text style={styles.actionText}>Reorder</Text>
              </Touch>
            ) : null}
          </View>
        </View>

        <View style={styles.block}>
          <Eyebrow style={styles.head}>Items</Eyebrow>
          {o.items.map(it => (
            <Touch
              key={it.id}
              style={styles.item}
              onPress={() => go(`/product/${it.product_id}`)}
            >
              <View style={styles.thumb}>
                {it.image ? (
                  <Image
                    source={{ uri: it.image }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                ) : (
                  <Placeholder label={it.product_title.charAt(0)} />
                )}
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.name} numberOfLines={2}>
                  {it.product_title}
                </Text>
                <Text style={styles.small}>
                  {[it.size, it.color].filter(Boolean).join(' / ') ||
                    it.variant_title ||
                    ''}
                  {` · Qty ${it.quantity}`}
                </Text>
                <Text style={styles.price}>
                  {formatINR(it.price * it.quantity)}
                </Text>
              </View>
            </Touch>
          ))}
          {o.shipments.map((part, n) => {
            const inv = invoiceState(o.payment_status, part.status);
            if (inv === 'none') return null;
            return (
              <Touch
                key={part.id}
                disabled={inv !== 'ready'}
                style={styles.invoice}
                onPress={() => go(`/invoice/${part.id}`)}
              >
                <FileText
                  size={15}
                  color={
                    inv === 'ready' ? colors.primary : colors.mutedForeground
                  }
                />
                <Text
                  style={[styles.invoiceText, inv !== 'ready' && styles.muted]}
                >
                  {inv === 'ready'
                    ? `Tax invoice${
                        o.shipments.length > 1 ? ` (part ${n + 1})` : ''
                      }`
                    : 'Invoice available once shipped'}
                </Text>
              </Touch>
            );
          })}
        </View>

        <View style={styles.blockBare}>
          <ReturnRequests orderId={o.id} />
        </View>

        <RefundBlock orderId={o.id} />

        <View style={styles.block}>
          <Eyebrow style={styles.head}>Delivering to</Eyebrow>
          <Text style={styles.name}>{o.customer_name}</Text>
          <Sans style={styles.address}>
            {[
              a.address_line1,
              a.address_line2,
              `${a.city ?? ''}, ${a.state ?? ''} ${a.pincode ?? ''}`,
            ]
              .filter(Boolean)
              .join('\n')}
          </Sans>
          <Sans style={styles.small}>{o.customer_phone}</Sans>
        </View>

        <View style={styles.block}>
          <Eyebrow style={styles.head}>Payment</Eyebrow>
          <Row label="Items" value={formatINR(o.subtotal)} />
          {o.discount_amount > 0 ? (
            <Row label="Discount" value={`- ${formatINR(o.discount_amount)}`} />
          ) : null}
          <Row
            label="Shipping"
            value={o.shipping_cost > 0 ? formatINR(o.shipping_cost) : 'Free'}
          />
          {o.cod_charge > 0 ? (
            <Row
              label="Cash on delivery charge"
              value={formatINR(o.cod_charge)}
            />
          ) : null}
          {o.wallet_amount > 0 ? (
            <Row
              label="Paid from wallet"
              value={`- ${formatINR(o.wallet_amount)}`}
            />
          ) : null}
          <View style={styles.rule} />
          <Row label="Total" value={formatINR(o.total)} strong />
          <Sans style={styles.small}>{paymentLabel(o)}</Sans>
        </View>

        <Touch
          style={styles.helpRow}
          onPress={() =>
            Linking.openURL(
              `${CONFIG.whatsappUrl}?text=${encodeURIComponent(help)}`,
            )
          }
        >
          <MessageCircle size={18} color={colors.primary} strokeWidth={1.6} />
          <Text style={styles.helpText}>Help with this order on WhatsApp</Text>
        </Touch>
      </ScrollView>
      <CancelSheet
        order={o}
        visible={sheet === 'cancel'}
        onClose={() => setSheet(null)}
      />
      <ReorderSheet
        order={o}
        visible={sheet === 'reorder'}
        onClose={() => setSheet(null)}
      />
      <ReturnSheet
        order={o}
        items={returnWin.items}
        visible={sheet === 'return'}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

// Refunds for this order, if any (the block hides itself when empty).
function RefundBlock({ orderId }: { orderId: string }) {
  return (
    <View style={styles.blockBare}>
      <RefundHistory orderId={orderId} />
    </View>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Sans style={strong ? styles.strong : undefined}>{label}</Sans>
      <Sans style={strong ? styles.strong : undefined}>{value}</Sans>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  body: { paddingVertical: 8, paddingBottom: 32 },
  spinner: { marginTop: 48 },
  missing: {
    textAlign: 'center',
    marginTop: 48,
    color: colors.mutedForeground,
  },
  block: { backgroundColor: colors.ivory, padding: 16, marginBottom: 8 },
  blockBare: { backgroundColor: colors.ivory, paddingHorizontal: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionDanger: { borderColor: 'rgba(171,56,43,0.35)' },
  actionText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.foreground,
  },
  danger: { color: colors.destructive },
  invoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
  },
  invoiceText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.primary,
  },
  muted: { color: colors.mutedForeground },
  head: { color: colors.foreground, marginBottom: 12 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  meta: { color: colors.mutedForeground, marginTop: 6 },
  timeline: { flexDirection: 'row', marginTop: 18 },
  step: { flex: 1, alignItems: 'center' },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
    zIndex: 1,
  },
  dotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  line: {
    position: 'absolute',
    top: 5,
    left: '50%',
    width: '100%',
    height: 2,
    backgroundColor: colors.border,
  },
  lineOn: { backgroundColor: colors.primary },
  stepText: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.mutedForeground,
    marginTop: 6,
    textAlign: 'center',
  },
  stepTextOn: { color: colors.foreground, fontFamily: fonts.sansMedium },
  item: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  thumb: {
    width: 64,
    height: 86,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  itemInfo: { flex: 1, gap: 3 },
  name: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.foreground,
  },
  small: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.mutedForeground,
  },
  price: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.foreground },
  address: { lineHeight: 21, marginVertical: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  strong: { fontFamily: fonts.sansSemi },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    backgroundColor: colors.ivory,
  },
  helpText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.primary,
  },
});
