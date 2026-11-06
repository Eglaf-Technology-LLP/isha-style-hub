import {
  BellRing,
  ChevronDown,
  Image as ImageIcon,
  MapPin,
  Ruler,
  Star,
  Trash2,
} from 'lucide-react-native';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSession } from '@/lib/auth';
import {
  estimateDelivery,
  isSubscribedToStock,
  Review,
  subscribeToStock,
  useReviewActions,
  useReviews,
  useSizeChart,
  visibleImages,
} from '@/lib/productExtras';
import { shortDate } from '@/lib/orders';
import { toast } from '@/lib/toast';
import { useGo } from '@/navigation';
import { colors, fonts } from '@/theme';
import { Sheet } from './Listing';
import { Button, Eyebrow, Sans, Touch } from './ui';

// ---------- delivery date by pincode ----------

export function DeliveryCheck({
  vendorId,
  productId,
}: {
  vendorId: string;
  productId: string;
}) {
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{
    available: boolean;
    etaLabel: string | null;
  } | null>(null);

  const check = async (value = pin) => {
    if (!/^\d{6}$/.test(value)) return;
    setChecking(true);
    setResult(null);
    setResult(await estimateDelivery(vendorId, productId, value));
    setChecking(false);
  };

  return (
    <View>
      <View style={styles.pinRow}>
        <MapPin size={17} color={colors.mutedForeground} />
        <TextInput
          value={pin}
          onChangeText={t => {
            const v = t.replace(/\D/g, '').slice(0, 6);
            setPin(v);
            setResult(null);
            if (v.length === 6) check(v);
          }}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="Enter pincode"
          placeholderTextColor={colors.mutedForeground}
          style={styles.pinInput}
          accessibilityLabel="Delivery pincode"
        />
        <Touch
          hitSlop={8}
          onPress={() => check()}
          disabled={pin.length !== 6 || checking}
        >
          <Text style={[styles.pinCheck, pin.length !== 6 && styles.muted]}>
            Check
          </Text>
        </Touch>
      </View>
      {checking ? (
        <ActivityIndicator color={colors.primary} style={styles.gapSm} />
      ) : null}
      {result ? (
        <Sans style={[styles.small, !result.available && styles.bad]}>
          {result.available
            ? result.etaLabel
              ? `Delivery by ${result.etaLabel}`
              : 'Delivers to this pincode'
            : "Sorry, we don't deliver to this pincode yet."}
        </Sans>
      ) : null}
    </View>
  );
}

// ---------- notify me when back in stock ----------

export function NotifyMe({ productId }: { productId: string }) {
  const user = useSession(st => st.user);
  const [email, setEmail] = useState(user?.email ?? '');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.email)
      isSubscribedToStock(productId, user.email).then(setSubscribed);
  }, [productId, user?.email]);

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      return setError('Enter a valid email address.');
    setBusy(true);
    const err = await subscribeToStock(productId, e);
    setBusy(false);
    if (err) return setError(err);
    setSubscribed(true);
    toast("You'll be notified when this product is back in stock!", {
      important: true,
    });
  };

  if (subscribed) {
    return (
      <View style={styles.notifyDone}>
        <BellRing size={17} color={colors.success} />
        <Sans style={styles.flex1}>
          We'll email you when it's back in stock.
        </Sans>
      </View>
    );
  }
  return (
    <View>
      <Eyebrow style={styles.head}>Notify me when it's back</Eyebrow>
      <View style={styles.pinRow}>
        <TextInput
          value={email}
          onChangeText={t => {
            setEmail(t);
            setError(null);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Your email"
          placeholderTextColor={colors.mutedForeground}
          style={styles.pinInput}
        />
        <Touch hitSlop={8} onPress={submit} disabled={busy}>
          <Text style={styles.pinCheck}>{busy ? '...' : 'Notify me'}</Text>
        </Touch>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

// ---------- size guide ----------

export function SizeGuideLink({
  categoryId,
  vendorId,
}: {
  categoryId: string | null;
  vendorId: string | null;
}) {
  const { data: chart } = useSizeChart(categoryId, vendorId);
  const [open, setOpen] = useState(false);
  if (!chart) return null;
  return (
    <>
      <Touch hitSlop={8} onPress={() => setOpen(true)} style={styles.inline}>
        <Ruler size={15} color={colors.primary} />
        <Text style={styles.link}>Size guide</Text>
      </Touch>
      <Sheet visible={open} title="Size guide" onClose={() => setOpen(false)}>
        <Sans style={styles.small}>
          {chart.name ? `${chart.name}. ` : ''}Measurements in{' '}
          {chart.unit === 'cm' ? 'centimetres (cm)' : 'inches'}.
        </Sans>
        <ScrollView horizontal style={styles.gapSm}>
          <View>
            <View style={styles.tr}>
              <Text style={[styles.th, styles.firstCol]}>Size</Text>
              {chart.rows.map(r => (
                <Text key={r.name} style={styles.th}>
                  {r.name}
                </Text>
              ))}
            </View>
            {chart.sizes.map(size => (
              <View key={size} style={styles.tr}>
                <Text style={[styles.td, styles.firstCol, styles.strong]}>
                  {size}
                </Text>
                {chart.rows.map(r => (
                  <Text key={r.name} style={styles.td}>
                    {r.values[size] || '-'}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </Sheet>
    </>
  );
}

// ---------- reviews ----------

function Stars({
  value,
  size = 14,
  onPick,
}: {
  value: number;
  size?: number;
  onPick?: (n: number) => void;
}) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map(n => (
        <Touch
          key={n}
          disabled={!onPick}
          hitSlop={4}
          onPress={() => onPick?.(n)}
          accessibilityLabel={`${n} stars`}
        >
          <Star
            size={size}
            color={colors.gold}
            fill={n <= Math.round(value) ? colors.gold : 'transparent'}
          />
        </Touch>
      ))}
    </View>
  );
}

export function useRatingSummary(productId: string) {
  const { data = [] } = useReviews(productId);
  return useMemo(() => {
    const shown = data.filter(r => r.is_approved);
    const avg = shown.length
      ? shown.reduce((s, r) => s + r.rating, 0) / shown.length
      : 0;
    return { count: shown.length, avg };
  }, [data]);
}

export function RatingLine({ productId }: { productId: string }) {
  const { count, avg } = useRatingSummary(productId);
  if (!count) return null;
  return (
    <View style={[styles.inline, styles.gapSm]}>
      <Stars value={avg} />
      <Sans style={styles.small}>
        {avg.toFixed(1)} ({count} {count === 1 ? 'review' : 'reviews'})
      </Sans>
    </View>
  );
}

export function Reviews({ productId }: { productId: string }) {
  const go = useGo();
  const user = useSession(st => st.user);
  const { data = [], isLoading } = useReviews(productId);
  const { save, remove } = useReviewActions(productId);
  const [editing, setEditing] = useState<Review | 'new' | null>(null);
  const [form, setForm] = useState({ rating: 0, title: '', review_text: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Approved reviews for everyone; your own even while it waits for approval.
  const list = data.filter(r => r.is_approved || r.user_id === user?.id);
  const mine = data.find(r => r.user_id === user?.id);
  const approved = data.filter(r => r.is_approved);
  const avg = approved.length
    ? approved.reduce((s, r) => s + r.rating, 0) / approved.length
    : 0;
  const dist = [5, 4, 3, 2, 1].map(n => ({
    n,
    c: approved.filter(r => r.rating === n).length,
  }));

  const open = (r: Review | 'new') => {
    if (!user) return go('/signin');
    setEditing(r);
    setError(null);
    setForm(
      r === 'new'
        ? { rating: 0, title: '', review_text: '' }
        : {
            rating: r.rating,
            title: r.title ?? '',
            review_text: r.review_text ?? '',
          },
    );
  };

  const submit = async () => {
    if (!form.rating) return setError('Please choose a star rating.');
    setBusy(true);
    const err = await save(
      form,
      editing && editing !== 'new' ? editing.id : undefined,
    );
    setBusy(false);
    if (err) return setError(err);
    setEditing(null);
    toast(
      editing === 'new' ? 'Thanks! Your review is posted.' : 'Review updated!',
      { important: true },
    );
  };

  return (
    <View>
      <View style={styles.reviewHead}>
        <Eyebrow style={styles.head}>Ratings & reviews</Eyebrow>
        <Touch hitSlop={8} onPress={() => open(mine ?? 'new')}>
          <Text style={styles.link}>
            {mine ? 'Edit your review' : 'Write a review'}
          </Text>
        </Touch>
      </View>
      {isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      {approved.length ? (
        <View style={styles.summary}>
          <View style={styles.avgBox}>
            <Text style={styles.avg}>{avg.toFixed(1)}</Text>
            <Stars value={avg} />
            <Sans style={styles.small}>{approved.length} reviews</Sans>
          </View>
          <View style={styles.flex1}>
            {dist.map(({ n, c }) => (
              <View key={n} style={styles.distRow}>
                <Text style={styles.distLabel}>{n}</Text>
                <View style={styles.bar}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${(c / approved.length) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.distLabel}>{c}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : !isLoading ? (
        <Sans style={styles.small}>
          No reviews yet. Be the first to review this piece.
        </Sans>
      ) : null}

      {list.slice(0, 10).map(r => (
        <View key={r.id} style={styles.review}>
          <View style={styles.inline}>
            <Stars value={r.rating} size={12} />
            {r.is_verified_purchase ? (
              <Text style={styles.verified}>Verified purchase</Text>
            ) : null}
            {!r.is_approved ? (
              <Text style={styles.pending}>Awaiting approval</Text>
            ) : null}
          </View>
          {r.title ? <Text style={styles.reviewTitle}>{r.title}</Text> : null}
          {r.review_text ? (
            <Sans style={styles.reviewText}>{r.review_text}</Sans>
          ) : null}
          {visibleImages(r, user?.id ?? null).length ? (
            <View style={styles.photos}>
              {visibleImages(r, user?.id ?? null).map(i => (
                <Image
                  key={i.id}
                  source={{ uri: i.url }}
                  style={styles.photo}
                />
              ))}
            </View>
          ) : null}
          <View style={styles.reviewFoot}>
            <Sans style={styles.small}>{shortDate(r.created_at)}</Sans>
            {r.user_id === user?.id ? (
              <Touch
                hitSlop={8}
                onPress={async () => {
                  const err = await remove(r.id);
                  toast(err ?? 'Review deleted', { important: !!err });
                }}
                accessibilityLabel="Delete my review"
              >
                <Trash2 size={15} color={colors.mutedForeground} />
              </Touch>
            ) : null}
          </View>
        </View>
      ))}

      <Sheet
        visible={editing !== null}
        title={editing === 'new' ? 'Write a review' : 'Edit your review'}
        onClose={() => setEditing(null)}
      >
        <Text style={styles.label}>Your rating</Text>
        <Stars
          value={form.rating}
          size={30}
          onPick={n => setForm(f => ({ ...f, rating: n }))}
        />
        <Text style={styles.label}>Title (optional)</Text>
        <TextInput
          value={form.title}
          onChangeText={t => setForm(f => ({ ...f, title: t }))}
          maxLength={100}
          style={styles.input}
        />
        <Text style={styles.label}>Your review (optional)</Text>
        <TextInput
          value={form.review_text}
          onChangeText={t => setForm(f => ({ ...f, review_text: t }))}
          multiline
          maxLength={2000}
          style={[styles.input, styles.textarea]}
        />
        <View style={[styles.inline, styles.gapSm]}>
          <ImageIcon size={14} color={colors.mutedForeground} />
          <Sans style={styles.small}>
            Adding photos: on the website for now.
          </Sans>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={busy ? 'Saving...' : 'Submit review'}
          onPress={submit}
          disabled={busy}
          style={styles.gapTop}
        />
      </Sheet>
    </View>
  );
}

// ---------- expandable info section ----------

export function Accordion({
  title,
  children,
  startOpen,
}: {
  title: string;
  children: ReactNode;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!startOpen);
  return (
    <View style={styles.acc}>
      <Touch
        style={styles.accHead}
        onPress={() => setOpen(v => !v)}
        accessibilityState={{ expanded: open }}
      >
        <Eyebrow style={styles.accTitle}>{title}</Eyebrow>
        <ChevronDown
          size={18}
          color={colors.foreground}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </Touch>
      {open ? <View style={styles.accBody}>{children}</View> : null}
    </View>
  );
}

export function InfoRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gapSm: { marginTop: 8 },
  gapTop: { marginTop: 16 },
  head: { color: colors.foreground, marginBottom: 10 },
  small: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 6,
    lineHeight: 18,
  },
  muted: { color: colors.mutedForeground },
  bad: { color: colors.destructive },
  strong: { fontFamily: fonts.sansSemi },
  link: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.primary },
  error: {
    fontFamily: fonts.sansMedium,
    color: colors.destructive,
    marginTop: 8,
  },
  pinRow: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
  },
  pinInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.foreground,
    paddingVertical: 0,
  },
  pinCheck: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  notifyDone: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  th: {
    width: 92,
    paddingVertical: 10,
    fontFamily: fonts.sansSemi,
    fontSize: 12,
    color: colors.foreground,
    textAlign: 'center',
  },
  td: {
    width: 92,
    paddingVertical: 10,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.foreground,
    textAlign: 'center',
  },
  firstCol: { width: 60, textAlign: 'left' },
  stars: { flexDirection: 'row', gap: 2 },
  reviewHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  summary: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'center',
    marginBottom: 8,
  },
  avgBox: { alignItems: 'center', gap: 4 },
  avg: { fontFamily: fonts.serif, fontSize: 36, color: colors.foreground },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 2,
  },
  distLabel: {
    width: 18,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  bar: { flex: 1, height: 6, backgroundColor: colors.muted },
  barFill: { height: 6, backgroundColor: colors.gold },
  review: {
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  verified: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    color: colors.success,
    marginLeft: 6,
  },
  pending: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    color: colors.gold,
    marginLeft: 6,
  },
  reviewTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 14,
    color: colors.foreground,
    marginTop: 6,
  },
  reviewText: { lineHeight: 21, marginTop: 4 },
  photos: { flexDirection: 'row', gap: 8, marginTop: 8 },
  photo: { width: 64, height: 64, backgroundColor: colors.muted },
  reviewFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.foreground,
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.foreground,
  },
  textarea: { minHeight: 100, textAlignVertical: 'top', paddingTop: 10 },
  acc: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  accHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  accTitle: { color: colors.foreground },
  accBody: { paddingBottom: 14 },
  infoRow: { paddingVertical: 6 },
  infoLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.mutedForeground,
  },
  infoValue: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.foreground,
    marginTop: 2,
    lineHeight: 19,
  },
});
