import { useQueryClient } from '@tanstack/react-query';
import { Check, Landmark, RotateCcw, Wallet } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatINR } from '@/lib/format';
import { tap } from '@/lib/haptics';
import {
  BANK_DETAILS_FIELDS,
  BANK_REFUND_DAYS,
  CANCEL_REASONS,
  cancellableParts,
  cancelParts,
  checkReorder,
  isPaidFromWallet,
  isPaidOnline,
  Order,
  orderNumber,
  RefundCharge,
  refundChargeLabel,
  RefundMethod,
  REFUND_METHOD_LABEL,
  refundOptions,
  ReorderLine,
  shortDate,
  useRefundCharge,
  useRefunds,
} from '@/lib/orders';
import { useCart } from '@/lib/stores';
import { toast } from '@/lib/toast';
import { CONFIG } from '@/config';
import { useGo } from '@/navigation';
import { colors, fonts } from '@/theme';
import { Sheet } from './Listing';
import { Button, Eyebrow, Sans, Touch } from './ui';

// ---------- where the refund goes ----------

export function RefundPicker({
  options,
  value,
  onChange,
  context,
  orderId,
  charge,
}: {
  options: RefundMethod[];
  value: RefundMethod | null;
  onChange: (m: RefundMethod) => void;
  context: 'return' | 'cancel';
  orderId: string;
  charge: RefundCharge | null;
}) {
  const when =
    context === 'return'
      ? 'as soon as your items pass our quality check'
      : 'as soon as you cancel';
  if (options.length === 1 && options[0] === 'wallet') {
    return (
      <View style={styles.note}>
        <Wallet size={16} color={colors.mutedForeground} />
        <Sans style={styles.flex}>
          This order was paid from your AllBoutiqs wallet, so the refund goes
          back to your wallet {when}.
        </Sans>
      </View>
    );
  }
  const chargeText = charge
    ? ` A refund charge of ${refundChargeLabel(charge)} is deducted.`
    : ' No refund charge on this one.';
  const text: Record<RefundMethod, string> = {
    wallet: `Instant and free - added to your wallet ${when}. Use the full amount on your next order.`,
    original:
      (context === 'return'
        ? 'Back to the card, UPI or netbanking you paid with, after the quality check. Banks usually take 5-7 working days.'
        : 'Back to the card, UPI or netbanking you paid with. Banks usually take 5-7 working days.') +
      chargeText,
    bank: `Email us your bank details. We transfer the refund within ${BANK_REFUND_DAYS} working days after the quality check.${chargeText}`,
  };
  const icon = { wallet: Wallet, original: RotateCcw, bank: Landmark };
  return (
    <View>
      <Text style={styles.label}>How would you like your refund?</Text>
      {options.map(m => {
        const Icon = icon[m];
        const on = value === m;
        return (
          <Touch
            key={m}
            style={[styles.method, on && styles.methodOn]}
            onPress={() => onChange(m)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
          >
            <View style={[styles.radio, on && styles.radioOn]}>
              {on ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={styles.flex}>
              <View style={styles.inline}>
                <Icon size={15} color={colors.foreground} />
                <Text style={styles.methodTitle}>{REFUND_METHOD_LABEL[m]}</Text>
              </View>
              <Sans style={styles.small}>{text[m]}</Sans>
            </View>
          </Touch>
        );
      })}
      {value === 'bank' ? (
        <Sans style={[styles.small, styles.bank]}>
          Email {CONFIG.supportEmail} with order {orderNumber(orderId)} and:{' '}
          {BANK_DETAILS_FIELDS.join(', ')}.
        </Sans>
      ) : null}
      {options.includes('wallet') ? (
        <Sans style={styles.tiny}>
          Wallet balance can be spent on any AllBoutiqs order. It can't be
          withdrawn to a bank account or transferred to someone else.
        </Sans>
      ) : null}
    </View>
  );
}

// ---------- cancel ----------

export function CancelSheet({
  order,
  visible,
  onClose,
}: {
  order: Order;
  visible: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: charge } = useRefundCharge();
  const parts = order.shipments.map(s => ({
    part: s,
    blocked: !cancellableParts(order).some(c => c.id === s.id),
    items: order.items.filter(i => i.vendor_order_id === s.id),
  }));
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const paidOnline = isPaidOnline(order);
  const fromWallet = isPaidFromWallet(order);
  const needsChoice = paidOnline && !fromWallet;
  const [method, setMethod] = useState<RefundMethod | null>(
    fromWallet ? 'wallet' : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      // Everything that can still be cancelled starts ticked.
      setPicked(
        Object.fromEntries(
          parts.filter(p => !p.blocked).map(p => [p.part.id, true]),
        ),
      );
      setReason('');
      setNotes('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const chosen = parts
    .filter(p => !p.blocked && picked[p.part.id])
    .map(p => p.part.id);

  const submit = async () => {
    if (!chosen.length) return setError('Choose what to cancel.');
    if (!reason) return setError('Please choose a reason.');
    if (needsChoice && !method)
      return setError("Please choose how you'd like your refund.");
    setBusy(true);
    const r = await cancelParts(
      chosen,
      reason === 'Other' && notes.trim() ? notes.trim() : reason,
      needsChoice || fromWallet ? method ?? undefined : undefined,
      paidOnline,
    );
    setBusy(false);
    if (r.error) return setError(r.error);
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['refunds', order.id] });
    qc.invalidateQueries({ queryKey: ['wallet'] });
    toast(r.message, { important: true });
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      title="Cancel order"
      onClose={onClose}
      scroll
      footer={
        <View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label={busy ? 'Cancelling...' : 'Cancel selected items'}
            variant="dark"
            onPress={submit}
            disabled={busy}
            style={styles.gapSm}
          />
        </View>
      }
    >
      {parts.length > 1 ? (
        <Text style={styles.label}>What would you like to cancel?</Text>
      ) : null}
      {parts.map(({ part, blocked, items }) => (
        <Touch
          key={part.id}
          disabled={blocked}
          style={[styles.part, blocked && styles.dim]}
          onPress={() => setPicked(p => ({ ...p, [part.id]: !p[part.id] }))}
          accessibilityRole="checkbox"
          accessibilityState={{
            checked: !blocked && !!picked[part.id],
            disabled: blocked,
          }}
        >
          <View
            style={[styles.box, !blocked && picked[part.id] && styles.boxOn]}
          >
            {!blocked && picked[part.id] ? (
              <Check
                size={13}
                color={colors.primaryForeground}
                strokeWidth={3}
              />
            ) : null}
          </View>
          <View style={styles.flex}>
            {items.map(i => (
              <Text key={i.id} style={styles.itemLine} numberOfLines={1}>
                {i.product_title} · Qty {i.quantity}
              </Text>
            ))}
            {blocked ? (
              <Sans style={styles.small}>
                Already {part.status.replace(/_/g, ' ')} - can't be cancelled
              </Sans>
            ) : null}
          </View>
        </Touch>
      ))}

      <Text style={styles.label}>Reason</Text>
      {CANCEL_REASONS.map(r => (
        <Touch
          key={r}
          style={styles.reason}
          onPress={() => setReason(r)}
          accessibilityRole="radio"
          accessibilityState={{ checked: reason === r }}
        >
          <View style={[styles.radio, reason === r && styles.radioOn]}>
            {reason === r ? <View style={styles.radioDot} /> : null}
          </View>
          <Text style={styles.reasonText}>{r}</Text>
        </Touch>
      ))}
      {reason === 'Other' ? (
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Tell us more (optional)"
          placeholderTextColor={colors.mutedForeground}
          multiline
          style={styles.notes}
        />
      ) : null}

      {needsChoice || fromWallet ? (
        <View style={styles.gapTop}>
          <RefundPicker
            options={refundOptions(order.payment_method)}
            value={method}
            onChange={setMethod}
            context="cancel"
            orderId={order.id}
            charge={charge ?? null}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

// ---------- reorder ----------

export function ReorderSheet({
  order,
  visible,
  onClose,
}: {
  order: Order;
  visible: boolean;
  onClose: () => void;
}) {
  const go = useGo();
  const addItem = useCart(st => st.addItem);
  const [lines, setLines] = useState<ReorderLine[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLines(null);
    checkReorder(order.items).then(setLines);
  }, [visible, order.items]);

  const available = (lines ?? []).filter(l => l.availability === 'available');

  const add = () => {
    for (const l of available) {
      const i = l.item;
      addItem({
        productId: i.product_id,
        productName: i.product_title,
        productImage: i.image,
        vendorId: i.vendor_id,
        variantId: i.variant_id,
        variantTitle:
          i.variant_title ||
          [i.size, i.color].filter(Boolean).join(' / ') ||
          'Default',
        price: {
          amount: String(l.currentPrice ?? i.price),
          currencyCode: 'INR',
        },
        quantity: l.availableQuantity,
        selectedOptions: [
          ...(i.size ? [{ name: 'Size', value: i.size }] : []),
          ...(i.color ? [{ name: 'Colour', value: i.color }] : []),
        ],
      });
    }
    tap();
    toast(
      `${available.length} item${
        available.length === 1 ? '' : 's'
      } added to your bag`,
    );
    onClose();
    go('/bag');
  };

  return (
    <Sheet visible={visible} title="Reorder" onClose={onClose} scroll>
      {!lines ? (
        <ActivityIndicator color={colors.primary} style={styles.gapTop} />
      ) : null}
      {(lines ?? []).map(l => (
        <View key={l.item.id} style={styles.reorderRow}>
          <View style={styles.flex}>
            <Text style={styles.itemLine} numberOfLines={1}>
              {l.item.product_title}
            </Text>
            <Sans style={styles.small}>
              {l.availability === 'unavailable'
                ? 'No longer available'
                : l.availability === 'out_of_stock'
                ? 'Out of stock right now'
                : l.availableQuantity < l.item.quantity
                ? `Only ${l.availableQuantity} available (you had ${l.item.quantity})`
                : `Qty ${l.availableQuantity}`}
              {l.priceChanged && l.currentPrice != null
                ? ` · now ${formatINR(l.currentPrice)} (was ${formatINR(
                    l.item.price,
                  )})`
                : ''}
            </Sans>
          </View>
        </View>
      ))}
      {lines ? (
        <Button
          label={
            available.length
              ? `Add ${available.length} to bag`
              : 'Nothing can be reordered'
          }
          onPress={add}
          disabled={!available.length}
          style={styles.gapTop}
        />
      ) : null}
    </Sheet>
  );
}

// ---------- refund history ----------

const REFUND_STATUS: Record<string, string> = {
  pending: 'Processing',
  processed: 'Refunded',
  failed: 'Failed',
};

export function RefundHistory({ orderId }: { orderId: string }) {
  const { data = [] } = useRefunds(orderId);
  if (!data.length) return null;
  return (
    <View>
      <Eyebrow style={styles.head}>Refunds</Eyebrow>
      {data.map(r => (
        <View key={r.id} style={styles.refund}>
          <View style={styles.flex}>
            <Text style={styles.itemLine}>{formatINR(r.amount)}</Text>
            <Sans style={styles.small}>
              {shortDate(r.initiated_at)}
              {r.reason ? ` · ${r.reason}` : ''}
            </Sans>
            {r.status === 'failed' && r.failure_reason ? (
              <Sans style={[styles.small, styles.bad]}>{r.failure_reason}</Sans>
            ) : null}
          </View>
          <Text
            style={[styles.refundStatus, r.status === 'failed' && styles.bad]}
          >
            {REFUND_STATUS[r.status] ?? r.status}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gapSm: { marginTop: 10 },
  gapTop: { marginTop: 16 },
  dim: { opacity: 0.5 },
  head: { color: colors.foreground, marginBottom: 10 },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.foreground,
    marginTop: 14,
    marginBottom: 8,
  },
  small: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 3,
    lineHeight: 18,
  },
  tiny: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 8,
    lineHeight: 16,
  },
  bad: { color: colors.destructive },
  error: {
    fontFamily: fonts.sansMedium,
    color: colors.destructive,
    marginTop: 10,
  },
  note: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.muted,
    padding: 12,
  },
  method: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  methodOn: { borderColor: colors.primary, backgroundColor: colors.accent },
  methodTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.foreground,
  },
  bank: { backgroundColor: colors.accent, padding: 10 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioOn: { borderColor: colors.primary },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  part: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  box: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  itemLine: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.foreground,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  reasonText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.foreground,
  },
  notes: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: 10,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.foreground,
    textAlignVertical: 'top',
  },
  reorderRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  refund: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  refundStatus: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.success,
  },
});
