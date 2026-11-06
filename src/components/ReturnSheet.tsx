import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Camera,
  Check,
  ImagePlus,
  RotateCcw,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CONFIG } from '@/config';
import { formatINR } from '@/lib/format';
import {
  CHARGE_FREE_RETURN_REASONS,
  Order,
  OrderItem,
  orderNumber,
  RefundMethod,
  REFUND_METHOD_LABEL,
  refundOptions,
  shortDate,
  useRefundCharge,
} from '@/lib/orders';
import {
  exchangeVariants,
  MAX_PHOTOS_PER_ITEM,
  MIN_PHOTOS_PER_ITEM,
  pickPhotos,
  RETURN_REASONS,
  RETURN_REASONS_CUSTOMISED,
  RETURN_STATUS_LABEL,
  ReturnRequest,
  uploadPhoto,
  useReturnActions,
  useReturnRequests,
  VariantOption,
} from '@/lib/returns';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { colors, fonts } from '@/theme';
import { Chip, Sheet } from './Listing';
import { RefundPicker } from './OrderActions';
import { Button, Eyebrow, Sans, Touch } from './ui';

function useEvidenceRequired() {
  return useQuery({
    queryKey: ['return-evidence-required'],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('return_evidence_required')
        .maybeSingle();
      return data?.return_evidence_required !== false;
    },
  });
}

export function ReturnSheet({
  order,
  items,
  visible,
  onClose,
}: {
  order: Order;
  // Items still inside their return window.
  items: OrderItem[];
  visible: boolean;
  onClose: () => void;
}) {
  const { submit } = useReturnActions(order.id);
  const { data: evidenceRequired = true } = useEvidenceRequired();
  const { data: charge } = useRefundCharge();
  const isCustom = (i: OrderItem) => !!i.customisation;
  const anyRefundable = items.some(i => i.is_returnable || isCustom(i));
  const [type, setType] = useState<'return' | 'exchange'>(
    anyRefundable ? 'return' : 'exchange',
  );
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [variants, setVariants] = useState<Record<string, VariantOption[]>>({});
  const [targets, setTargets] = useState<
    Record<string, { size: string | null; color: string | null }>
  >({});
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const choices = refundOptions(order.payment_method);
  const [method, setMethod] = useState<RefundMethod | null>(
    choices.length === 1 ? choices[0] : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setType(anyRefundable ? 'return' : 'exchange');
    setPicked({});
    setPhotos({});
    setTargets({});
    setReason('');
    setNotes('');
    setError(null);
    setMethod(choices.length === 1 ? choices[0] : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Which items each type allows: a refund needs a returnable (or customised)
  // piece; an exchange never takes a customised one.
  const allowed = (i: OrderItem) =>
    type === 'return' ? i.is_returnable || isCustom(i) : !isCustom(i);
  const chosen = items.filter(i => picked[i.id] && allowed(i));
  const customisedChosen = chosen.some(isCustom);
  const reasons = customisedChosen ? RETURN_REASONS_CUSTOMISED : RETURN_REASONS;
  useEffect(() => {
    if (reason && !reasons.includes(reason)) setReason('');
  }, [reasons, reason]);

  // Live variants for the exchange picker.
  useEffect(() => {
    if (type !== 'exchange') return;
    for (const i of chosen) {
      if (variants[i.product_id]) continue;
      exchangeVariants(i.product_id).then(v =>
        setVariants(cur => ({ ...cur, [i.product_id]: v })),
      );
    }
  }, [type, chosen, variants]);

  const addPhotos = async (item: OrderItem, camera: boolean) => {
    const have = photos[item.id]?.length ?? 0;
    const room = MAX_PHOTOS_PER_ITEM - have;
    if (room <= 0) return;
    const assets = (await pickPhotos(camera, room)).slice(0, room);
    if (!assets.length) return;
    setUploading(item.id);
    const urls = (await Promise.all(assets.map(a => uploadPhoto(a)))).filter(
      (u): u is string => !!u,
    );
    setUploading(null);
    if (urls.length < assets.length)
      toast('Some photos failed to upload - please try again.', {
        important: true,
      });
    setPhotos(cur => ({
      ...cur,
      [item.id]: [...(cur[item.id] ?? []), ...urls],
    }));
  };

  const send = async () => {
    setError(null);
    if (!chosen.length) return setError('Choose the items to send back.');
    if (!reason) return setError('Please choose a reason.');
    if (
      evidenceRequired &&
      chosen.some(i => (photos[i.id]?.length ?? 0) < MIN_PHOTOS_PER_ITEM)
    )
      return setError(
        `Please add ${MIN_PHOTOS_PER_ITEM} photos of every selected item: the front, the back and the tag.`,
      );
    if (type === 'return' && !method)
      return setError("Please choose how you'd like your refund.");
    if (type === 'exchange') {
      for (const i of chosen) {
        const vs = variants[i.product_id] ?? [];
        const t = targets[i.id];
        if (vs.length && !vs.some(v => v.stock > 0))
          return setError(
            `Nothing is currently in stock to exchange "${i.product_title}" into.`,
          );
        if (vs.some(v => v.size) && !t?.size)
          return setError(
            `Please pick a size to exchange "${i.product_title}" into.`,
          );
        if (vs.some(v => v.color) && !t?.color)
          return setError(
            `Please pick a colour to exchange "${i.product_title}" into.`,
          );
      }
    }
    setBusy(true);
    const err = await submit({
      request_type: type,
      reason,
      additional_notes: notes.trim() || undefined,
      refund_method: type === 'return' ? method : null,
      items: chosen.map(i => ({
        order_item_id: i.id,
        product_title: i.product_title,
        quantity: i.quantity,
        size: i.size,
        color: i.color,
        price: i.price,
        photo_urls: photos[i.id] ?? [],
        photo_url: photos[i.id]?.[0],
        exchange_to:
          type === 'exchange'
            ? targets[i.id] ?? { size: null, color: null }
            : undefined,
      })),
    });
    setBusy(false);
    if (err) return setError(err);
    toast(
      type === 'return' && method === 'bank'
        ? `Return request submitted. Please email your bank details (account holder name, account number, bank name, IFSC code) to ${
            CONFIG.supportEmail
          } with order ${orderNumber(order.id)}.`
        : 'Return request submitted successfully!',
      { important: true },
    );
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      title="Return or exchange"
      onClose={onClose}
      scroll
      footer={
        <View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label={busy ? 'Submitting...' : `Request ${type}`}
            onPress={send}
            disabled={busy || !!uploading}
            style={styles.gapSm}
          />
        </View>
      }
    >
      <View style={styles.types}>
        {(['return', 'exchange'] as const).map(t => (
          <Touch
            key={t}
            disabled={t === 'return' && !anyRefundable}
            style={[
              styles.type,
              type === t && styles.typeOn,
              t === 'return' && !anyRefundable && styles.dim,
            ]}
            onPress={() => setType(t)}
          >
            {t === 'return' ? (
              <RotateCcw
                size={15}
                color={type === t ? colors.primary : colors.foreground}
              />
            ) : (
              <ArrowLeftRight
                size={15}
                color={type === t ? colors.primary : colors.foreground}
              />
            )}
            <Text style={[styles.typeText, type === t && styles.primary]}>
              {t === 'return' ? 'Return for refund' : 'Exchange'}
            </Text>
          </Touch>
        ))}
      </View>

      <Text style={styles.label}>Items</Text>
      {items.map(i => {
        const ok = allowed(i);
        const on = !!picked[i.id] && ok;
        const vs = (variants[i.product_id] ?? []).filter(v => v.stock > 0);
        const sizes = [
          ...new Set(vs.map(v => v.size).filter((s): s is string => !!s)),
        ];
        const colorsFor = [
          ...new Set(
            vs
              .filter(
                v => !targets[i.id]?.size || v.size === targets[i.id]?.size,
              )
              .map(v => v.color)
              .filter((c): c is string => !!c),
          ),
        ];
        return (
          <View key={i.id} style={styles.item}>
            <Touch
              disabled={!ok}
              style={[styles.itemHead, !ok && styles.dim]}
              onPress={() => setPicked(p => ({ ...p, [i.id]: !p[i.id] }))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: !ok }}
            >
              <View style={[styles.box, on && styles.boxOn]}>
                {on ? (
                  <Check
                    size={13}
                    color={colors.primaryForeground}
                    strokeWidth={3}
                  />
                ) : null}
              </View>
              <View style={styles.flex}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {i.product_title}
                </Text>
                <Sans style={styles.small}>
                  {[i.size, i.color].filter(Boolean).join(' / ')} · Qty{' '}
                  {i.quantity} · {formatINR(i.price)}
                </Sans>
                {!ok ? (
                  <Sans style={styles.small}>
                    {type === 'return'
                      ? 'Not returnable - can be exchanged'
                      : "Customised pieces can't be exchanged"}
                  </Sans>
                ) : null}
              </View>
            </Touch>

            {on ? (
              <View style={styles.itemBody}>
                <Text style={styles.subLabel}>
                  Photos - front, back and the tag (
                  {evidenceRequired
                    ? `${MIN_PHOTOS_PER_ITEM} required`
                    : 'optional'}
                  , up to {MAX_PHOTOS_PER_ITEM})
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.photos}
                >
                  {(photos[i.id] ?? []).map(url => (
                    <View key={url}>
                      <Image source={{ uri: url }} style={styles.photo} />
                      <Touch
                        hitSlop={6}
                        style={styles.remove}
                        onPress={() =>
                          setPhotos(cur => ({
                            ...cur,
                            [i.id]: cur[i.id].filter(u => u !== url),
                          }))
                        }
                        accessibilityLabel="Remove photo"
                      >
                        <X size={12} color={colors.ivory} />
                      </Touch>
                    </View>
                  ))}
                  {(photos[i.id]?.length ?? 0) < MAX_PHOTOS_PER_ITEM ? (
                    <>
                      <Touch
                        style={styles.addPhoto}
                        onPress={() => addPhotos(i, true)}
                        accessibilityLabel="Take a photo"
                      >
                        <Camera size={20} color={colors.primary} />
                        <Text style={styles.addText}>Camera</Text>
                      </Touch>
                      <Touch
                        style={styles.addPhoto}
                        onPress={() => addPhotos(i, false)}
                        accessibilityLabel="Choose photos"
                      >
                        <ImagePlus size={20} color={colors.primary} />
                        <Text style={styles.addText}>Gallery</Text>
                      </Touch>
                    </>
                  ) : null}
                  {uploading === i.id ? (
                    <ActivityIndicator
                      color={colors.primary}
                      style={styles.uploading}
                    />
                  ) : null}
                </ScrollView>

                {type === 'exchange' ? (
                  variants[i.product_id] === undefined ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : vs.length === 0 &&
                    (variants[i.product_id] ?? []).length > 0 ? (
                    <Sans style={[styles.small, styles.bad]}>
                      Nothing in stock to exchange into right now.
                    </Sans>
                  ) : (
                    <>
                      {sizes.length ? (
                        <Text style={styles.subLabel}>Exchange to size</Text>
                      ) : null}
                      <View style={styles.wrap}>
                        {sizes.map(s => (
                          <Chip
                            key={s}
                            label={s}
                            active={targets[i.id]?.size === s}
                            onPress={() =>
                              setTargets(t => ({
                                ...t,
                                [i.id]: { size: s, color: null },
                              }))
                            }
                          />
                        ))}
                      </View>
                      {colorsFor.length ? (
                        <Text style={styles.subLabel}>Exchange to colour</Text>
                      ) : null}
                      <View style={styles.wrap}>
                        {colorsFor.map(c => (
                          <Chip
                            key={c}
                            label={c}
                            active={targets[i.id]?.color === c}
                            onPress={() =>
                              setTargets(t => ({
                                ...t,
                                [i.id]: {
                                  size: t[i.id]?.size ?? null,
                                  color: c,
                                },
                              }))
                            }
                          />
                        ))}
                      </View>
                    </>
                  )
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      <Text style={styles.label}>Reason</Text>
      {reasons.map(r => (
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
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Anything else we should know? (optional)"
        placeholderTextColor={colors.mutedForeground}
        multiline
        style={styles.notes}
      />

      {type === 'return' ? (
        <View style={styles.gapTop}>
          <RefundPicker
            options={choices}
            value={method}
            onChange={setMethod}
            context="return"
            orderId={order.id}
            charge={
              CHARGE_FREE_RETURN_REASONS.includes(reason)
                ? null
                : charge ?? null
            }
          />
        </View>
      ) : null}
    </Sheet>
  );
}

// Requests already made on this order, newest first; a pending one can be withdrawn.
export function ReturnRequests({ orderId }: { orderId: string }) {
  const { data = [] } = useReturnRequests(orderId);
  const { withdraw } = useReturnActions(orderId);
  const shown = useMemo(() => data, [data]);
  if (!shown.length) return null;
  return (
    <View>
      <Eyebrow style={styles.head}>Returns & exchanges</Eyebrow>
      {shown.map((r: ReturnRequest) => {
        const net =
          (r.refund_amount ?? 0) -
          Number(r.refund_fee ?? 0) -
          Number(r.refund_fee_gst ?? 0);
        return (
          <View key={r.id} style={styles.req}>
            <View style={styles.reqHead}>
              <Text style={styles.itemName}>
                {r.request_type === 'return' ? 'Return' : 'Exchange'}{' '}
                {orderNumber(r.id)}
              </Text>
              <Text style={styles.status}>
                {RETURN_STATUS_LABEL[r.status] ?? r.status}
              </Text>
            </View>
            <Sans style={styles.small}>
              {shortDate(r.created_at)} · {r.reason}
            </Sans>
            {(r.items ?? []).map((it, n) => (
              <Sans key={n} style={styles.small}>
                {it.product_title} · Qty {it.quantity}
                {r.request_type === 'exchange' &&
                it.exchange_to &&
                (it.exchange_to.size || it.exchange_to.color)
                  ? ` → ${[it.exchange_to.size, it.exchange_to.color]
                      .filter(Boolean)
                      .join(' / ')}`
                  : ''}
              </Sans>
            ))}
            {r.request_type === 'return' && r.refund_method ? (
              <Sans style={styles.small}>
                Refund to: {REFUND_METHOD_LABEL[r.refund_method]}
              </Sans>
            ) : null}
            {r.status === 'completed' &&
            r.request_type === 'return' &&
            r.refund_amount ? (
              <Text style={styles.refunded}>
                {formatINR(net)} refunded
                {r.refund_method === 'wallet' ? ' to your wallet' : ''}
              </Text>
            ) : null}
            {r.status === 'pending' ? (
              <Touch
                hitSlop={8}
                style={styles.withdraw}
                onPress={async () => {
                  const err = await withdraw(r.id);
                  toast(err ?? 'Return request cancelled', {
                    important: !!err,
                  });
                }}
              >
                <Text style={styles.withdrawText}>Cancel request</Text>
              </Touch>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dim: { opacity: 0.45 },
  primary: { color: colors.primary },
  bad: { color: colors.destructive },
  gapSm: { marginTop: 10 },
  gapTop: { marginTop: 16 },
  head: { color: colors.foreground, marginBottom: 10 },
  error: {
    fontFamily: fonts.sansMedium,
    color: colors.destructive,
    marginTop: 10,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.foreground,
    marginTop: 16,
    marginBottom: 8,
  },
  subLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 10,
    marginBottom: 6,
  },
  small: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 2,
    lineHeight: 18,
  },
  types: { flexDirection: 'row', gap: 8, marginTop: 4 },
  type: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeOn: { borderColor: colors.primary, backgroundColor: colors.accent },
  typeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.foreground,
  },
  item: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: 10,
  },
  itemHead: { flexDirection: 'row', gap: 12 },
  itemBody: { paddingLeft: 30 },
  itemName: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.foreground,
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
  photos: { gap: 8, alignItems: 'center' },
  photo: { width: 64, height: 64, backgroundColor: colors.muted },
  remove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(27,22,19,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: {
    width: 64,
    height: 64,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addText: { fontFamily: fonts.sans, fontSize: 10, color: colors.primary },
  uploading: { marginLeft: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.primary },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  notes: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: 10,
    marginTop: 8,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.foreground,
    textAlignVertical: 'top',
  },
  req: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  reqHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  status: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  refunded: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.success,
    marginTop: 4,
  },
  withdraw: { alignSelf: 'flex-start', marginTop: 8 },
  withdrawText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.destructive,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
