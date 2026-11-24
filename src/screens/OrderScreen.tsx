import {
  Ban,
  FileText,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Scissors,
  Truck,
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
import { CustomisationDetails } from '@/components/Customiser';
import { AppHeader } from '@/components/AppHeader';
import { CreditNoteLink } from '@/components/CreditNoteSheet';
import {
  CancelSheet,
  RefundHistory,
  ReorderSheet,
} from '@/components/OrderActions';
import { OrderStatusTimeline } from '@/components/OrderStatusTimeline';
import { ReturnRequests, ReturnSheet } from '@/components/ReturnSheet';
import { returnWindow, useReturnRequests } from '@/lib/returns';
import { Eyebrow, Placeholder, Sans, Touch } from '@/components/ui';
import { CONFIG } from '@/config';
import { formatDateInWordsWithDay, formatDateTimeInWords } from '@/lib/dates';
import { formatINR } from '@/lib/format';
import { mayHaveCreditNote } from '@/lib/invoiceLine';
import { goodsSplitRows, useGoodsSplitter } from '@/lib/orderAmounts';
import {
  CourierShipment,
  isViaWarehouse,
  Order,
  OrderItem,
  orderNumber,
  orderStatus,
  orderTracking,
  Shipment,
  useMyOrders,
  cancellableParts,
  customerCancelDeadline,
  invoiceState,
  isWithinCustomerCancelWindow,
} from '@/lib/orders';
import { OrderTimeline } from '@/lib/orderStatus';
import { orderPaymentLine, paymentPill } from '@/lib/paymentMode';
import { madeToOrderOrderNote } from '@/lib/soldOutMadeToOrder';
import { useGo, useParams } from '@/navigation';
import { colors, fonts } from '@/theme';
import { TONE } from './OrdersScreen';

// One order: where it is, its pieces by boutique part (each with its tracker
// on the direct route), delivery address and the bill - the website's My
// orders card, opened.
export default function OrderScreen() {
  const { id } = useParams<'Order'>();
  const go = useGo();
  const { data: orders, isLoading } = useMyOrders();
  const { data: returns = [] } = useReturnRequests(id);
  // Product value / customisation / GST, as checkout showed them.
  const splitGoods = useGoodsSplitter(true);
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

  const tracking = orderTracking(o);
  const status = orderStatus(o, tracking);
  const pay = paymentPill(o);
  // Warehouse route, or a single boutique part: one tracker, at the top.
  // Otherwise each part's tracker sits under its pieces.
  const single = tracking.single;
  const viaWarehouse = isViaWarehouse(o);
  const groups = partGroups(o);
  const showPartLabels = !viaWarehouse && groups.length > 1;
  const trackers = [single, ...tracking.parts.values()].filter(
    (t): t is OrderTimeline => !!t,
  );
  // The order's own estimate, while no tracker shows a date yet.
  const expectedBy =
    o.estimated_delivery_date &&
    status.tone === 'progress' &&
    !trackers.some(t => t.estimatedDeliveryDate)
      ? o.estimated_delivery_date
      : null;
  // A completed return has a credit note (on a part that stays delivered).
  const hasCompletedReturn = returns.some(r => r.status === 'completed');
  const a = o.shipping_address ?? {};
  // The customer's own cancel closes 24 hours after ordering.
  const canCancel =
    cancellableParts(o).length > 0 &&
    isWithinCustomerCancelWindow(o.created_at);
  const returnWin = returnWindow(o);
  const split = splitGoods(o.items, o);
  const help = `Hi AllBoutiqs, I need help with my order ${orderNumber(o.id)}.`;

  return (
    <View style={styles.flex}>
      <AppHeader back title={`Order ${orderNumber(o.id)}`} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.block}>
          <View style={styles.pills}>
            <Text
              style={[
                styles.badge,
                {
                  backgroundColor: TONE[status.tone].bg,
                  color: TONE[status.tone].fg,
                },
              ]}
            >
              {status.text}
            </Text>
            <Text
              style={[
                styles.badge,
                {
                  backgroundColor: TONE[pay.tone].bg,
                  color: TONE[pay.tone].fg,
                },
              ]}
            >
              {pay.text}
            </Text>
          </View>
          <Sans style={styles.meta}>
            Placed on {formatDateTimeInWords(o.created_at)}
          </Sans>
          {expectedBy ? (
            <Sans style={styles.meta}>
              Expected by {formatDateInWordsWithDay(expectedBy)}
            </Sans>
          ) : null}
          {single ? (
            <View style={styles.tracker}>
              <OrderStatusTimeline timeline={single} />
              {viaWarehouse ? (
                <ParcelLinks parts={o.shipments} />
              ) : (
                <TrackLink part={o.shipments[0]} />
              )}
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
          {returnWin.items.length && returnWin.note ? (
            <Sans style={styles.meta}>{returnWin.note}</Sans>
          ) : !returnWin.items.length && returnWin.closedAt ? (
            <Sans style={styles.meta}>
              Return / exchange window closed on{' '}
              {formatDateTimeInWords(returnWin.closedAt)}
            </Sans>
          ) : null}
          {canCancel ? (
            <Sans style={styles.meta}>
              You can cancel until{' '}
              {formatDateTimeInWords(customerCancelDeadline(o.created_at))}
            </Sans>
          ) : null}
        </View>

        <View style={styles.block}>
          <Eyebrow style={styles.head}>Items</Eyebrow>
          {groups.map(({ part, items }, n) => {
            const partTracker =
              part && !single ? tracking.parts.get(part.id) : null;
            return (
              <View
                key={part?.id ?? 'other'}
                style={showPartLabels ? styles.group : undefined}
              >
                {showPartLabels ? (
                  <Text style={styles.partLabel}>
                    Part {n + 1} of {groups.length}
                  </Text>
                ) : null}
                {items.map(it => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    onPress={() => go(`/product/${it.product_id}`)}
                  />
                ))}
                {part && partTracker ? (
                  <View style={styles.partTracker}>
                    <OrderStatusTimeline timeline={partTracker} />
                    <TrackLink part={part} />
                  </View>
                ) : null}
                {part ? (
                  <PartPapers
                    order={o}
                    part={part}
                    label={
                      o.shipments.length > 1 && !showPartLabels
                        ? ` (part ${o.shipments.indexOf(part) + 1})`
                        : ''
                    }
                    creditNote={mayHaveCreditNote(
                      part.status,
                      hasCompletedReturn,
                    )}
                    onInvoice={() => go(`/invoice/${part.id}`)}
                  />
                ) : null}
              </View>
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
          {/* The items' price as product value, customisation charge and
              GST; the plain total when a product can't be read. */}
          {split ? (
            goodsSplitRows(split).map(([label, amount]) => (
              <Row key={label} label={label} value={formatINR(amount)} />
            ))
          ) : (
            <Row label="Subtotal" value={formatINR(o.subtotal)} />
          )}
          {o.discount_amount > 0 ? (
            <Row label="Discount" value={`- ${formatINR(o.discount_amount)}`} />
          ) : null}
          <Row
            label="Shipping"
            value={o.shipping_cost > 0 ? formatINR(o.shipping_cost) : 'Free'}
          />
          {o.cod_charge > 0 ? (
            <Row
              label="Cash on Delivery fee (incl. GST)"
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
          {/* How it was paid: "Paid by UPI", or "Pay ₹X in cash when it
              arrives". */}
          <Row label="Payment" value={orderPaymentLine(o, o.shipments)} />
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

// The pieces of each boutique part, in the order they were bought; pieces
// without a part come last, with no tracker.
function partGroups(o: Order): { part: Shipment | null; items: OrderItem[] }[] {
  const groups = new Map<
    string,
    { part: Shipment | null; items: OrderItem[] }
  >();
  for (const item of o.items) {
    const part = o.shipments.find(s => s.id === item.vendor_order_id) ?? null;
    const key = part?.id ?? '';
    const g = groups.get(key) ?? { part, items: [] };
    g.items.push(item);
    groups.set(key, g);
  }
  return [...groups.values()].sort(
    (x, y) => (x.part ? 0 : 1) - (y.part ? 0 : 1),
  );
}

function ItemRow({
  item: it,
  onPress,
}: {
  item: OrderItem;
  onPress: () => void;
}) {
  return (
    <Touch style={styles.item} onPress={onPress}>
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
        <MadeToOrderBadge item={it} />
        <CustomisationDetails customisation={it.customisation} />
        <Text style={styles.price}>{formatINR(it.price * it.quantity)}</Text>
      </View>
    </Touch>
  );
}

// An order line made after the order (the website's MadeToOrderBadge, for
// the customer): a Made to Order listing, or a sold-out size made to order
// with its charge and extra days.
function MadeToOrderBadge({ item }: { item: OrderItem }) {
  const note = madeToOrderOrderNote(item.made_to_order, item.sold_out_terms);
  if (!note) return null;
  return (
    <View style={styles.mto}>
      <View style={styles.mtoBadge}>
        <Scissors size={11} color={colors.foreground} strokeWidth={1.8} />
        <Text style={styles.mtoBadgeText}>Made to order</Text>
      </View>
      <Text style={styles.mtoText}>{note}</Text>
    </View>
  );
}

const trackingUrl = (awb: string) => `https://shiprocket.co/tracking/${awb}`;

// Direct route: the courier's tracking page, or the tracking number.
function TrackLink({ part }: { part: Shipment | undefined }) {
  if (!part) return null;
  const awb = part.forward?.awb_code;
  if (awb) {
    return (
      <Touch
        style={styles.track}
        onPress={() => Linking.openURL(trackingUrl(awb))}
      >
        <Truck size={14} color={colors.primary} />
        <Text style={styles.trackText}>
          {part.forward?.courier_name ? `${part.forward.courier_name} • ` : ''}
          Track shipment
        </Text>
      </Touch>
    );
  }
  if (!part.tracking_number) return null;
  return (
    <Sans style={[styles.small, styles.trackNumber]}>
      {part.carrier ? `${part.carrier} • ` : ''}
      {part.tracking_number}
    </Sans>
  );
}

// Warehouse route: AllBoutiqs' own parcel(s) to the customer.
function ParcelLinks({ parts }: { parts: Shipment[] }) {
  const parcels = [
    ...new Map(
      parts
        .map(p => p.parcel)
        .filter((x): x is CourierShipment => !!x?.awb_code)
        .map(x => [x.awb_code as string, x]),
    ).values(),
  ];
  return (
    <>
      {parcels.map(x => (
        <Touch
          key={x.awb_code}
          style={styles.track}
          onPress={() => Linking.openURL(trackingUrl(x.awb_code as string))}
        >
          <Truck size={14} color={colors.primary} />
          <Text style={styles.trackText}>
            {x.courier_name ? `${x.courier_name} • ` : ''}
            Track {parcels.length > 1 ? 'parcel' : 'shipment'}
          </Text>
        </Touch>
      ))}
    </>
  );
}

// A part's tax invoice and, once one is issued, its credit note.
function PartPapers({
  order,
  part,
  label,
  creditNote,
  onInvoice,
}: {
  order: Order;
  part: Shipment;
  label: string;
  creditNote: boolean;
  onInvoice: () => void;
}) {
  const inv = invoiceState(order.payment_status, part.status);
  return (
    <>
      {inv !== 'none' ? (
        <Touch
          disabled={inv !== 'ready'}
          style={styles.invoice}
          onPress={onInvoice}
        >
          <FileText
            size={15}
            color={inv === 'ready' ? colors.primary : colors.mutedForeground}
          />
          <Text style={[styles.invoiceText, inv !== 'ready' && styles.muted]}>
            {inv === 'ready'
              ? `Tax invoice${label}`
              : 'Invoice available once shipped'}
          </Text>
        </Touch>
      ) : null}
      {creditNote ? <CreditNoteLink vendorOrderId={part.id} /> : null}
    </>
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
      <Sans style={[styles.rowValue, strong && styles.strong]}>{value}</Sans>
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
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
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
  tracker: { marginTop: 16 },
  group: {
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
  },
  partLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.mutedForeground,
    marginBottom: 10,
  },
  partTracker: {
    backgroundColor: colors.background,
    padding: 12,
    marginBottom: 4,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
  },
  trackText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  trackNumber: { marginTop: 8 },
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
  mto: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  mtoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(181,138,74,0.15)',
  },
  mtoBadgeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.foreground,
  },
  mtoText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.mutedForeground,
    flexShrink: 1,
  },
  price: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.foreground },
  address: { lineHeight: 21, marginVertical: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 3,
  },
  rowValue: { flexShrink: 1, textAlign: 'right' },
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
