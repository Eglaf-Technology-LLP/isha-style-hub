import { useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CreditCard,
  Tag,
  Truck,
  Wallet as WalletIcon,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { DeliverTo, useDeliveryAddress } from '@/components/DeliverTo';
import { Button, Eyebrow, Placeholder, Sans, Touch } from '@/components/ui';
import { useWallet } from '@/lib/account';
import { useSession } from '@/lib/auth';
import {
  cartDeliveryDate,
  checkCoupon,
  checkPending,
  codQuote,
  Coupon,
  MIN_ONLINE_PAYMENT_AMOUNT,
  payOnline,
  placeOrder,
  splitCoupon,
  useBuyNow,
  useCheckoutData,
  vendorGroups,
} from '@/lib/checkout';
import { formatINR } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { shortDate } from '@/lib/orders';
import { useCart } from '@/lib/stores';
import { toast } from '@/lib/toast';
import { useGo } from '@/navigation';
import { colors, fonts } from '@/theme';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Checkout - Bag > Address > Payment, the website's rules (src/lib/checkout.ts).
export default function CheckoutScreen() {
  const go = useGo();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const buyNowMode =
    (useRoute().params as { buyNow?: string } | undefined)?.buyNow === '1';
  const buyNowItem = useBuyNow(st => st.item);
  const clearBuyNow = useBuyNow(st => st.set);
  const cartItems = useCart(st => st.items);
  const clearCart = useCart(st => st.clear);
  const items = useMemo(
    () => (buyNowMode ? (buyNowItem ? [buyNowItem] : []) : cartItems),
    [buyNowMode, buyNowItem, cartItems],
  );
  const user = useSession(st => st.user);
  const { address } = useDeliveryAddress();
  const { data, isLoading } = useCheckoutData(items);
  const { data: wallet } = useWallet();

  const [email, setEmail] = useState(user?.email ?? '');
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [walletOn, setWalletOn] = useState(false);
  const [method, setMethod] = useState<'razorpay' | 'cod'>('razorpay');
  const [cod, setCod] = useState<{
    status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
    amount: number;
  }>({
    status: 'idle',
    amount: 0,
  });
  const [eta, setEta] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  // ---- totals (the same sums the database makes) ----
  const groups = useMemo(
    () => (data ? vendorGroups(items, data) : []),
    [items, data],
  );
  const subtotal = items.reduce(
    (s, i) => s + parseFloat(i.price.amount) * i.quantity,
    0,
  );
  const shipping = groups.reduce((s, g) => s + g.shippingCost, 0);
  const categoryOf = (productId: string) =>
    data?.products.get(productId)?.category_id ?? null;
  const split = coupon ? splitCoupon(coupon, items, categoryOf) : null;
  const discount = split?.total ?? 0;
  const goodsDue = round2(subtotal - discount + shipping);
  const codFee = method === 'cod' && cod.status === 'ready' ? cod.amount : 0;
  const total = round2(goodsDue + codFee);
  const walletBalance = wallet?.balance ?? 0;
  const walletUse = walletOn ? Math.min(walletBalance, total) : 0;
  const payNow = round2(total - walletUse);
  const paidByWallet = walletUse > 0 && payNow <= 0;
  const belowOnlineMinimum = payNow > 0 && payNow < MIN_ONLINE_PAYMENT_AMOUNT;

  // COD only when every boutique and piece allows it, a courier collects
  // cash at this PIN, and the wallet isn't used (the website's rules).
  const codOffVendors = groups.filter(
    g => g.vendorId && data?.vendors.get(g.vendorId)?.cod_enabled === false,
  );
  const codOffProducts = items.filter(
    i => data?.products.get(i.productId)?.cod_available === false,
  );
  const codDisabled =
    codOffVendors.length > 0 ||
    codOffProducts.length > 0 ||
    cod.status === 'unavailable' ||
    walletOn;
  const codReason = codDisabled
    ? [
        walletOn &&
          "Can't be combined with your wallet balance - untick the wallet to pay on delivery",
        cod.status === 'unavailable' && "Isn't available for this PIN code",
        codOffProducts.length > 0 &&
          `Not available for ${codOffProducts
            .map(i => `"${i.productName}"`)
            .join(', ')}`,
        codOffVendors.length > 0 &&
          `${codOffVendors.map(g => g.vendorName ?? 'A boutique').join(', ')} ${
            codOffVendors.length > 1 ? "don't" : "doesn't"
          } offer it`,
      ]
        .filter(Boolean)
        .join('. ') + '.'
    : null;

  useEffect(() => {
    if (codDisabled && method === 'cod') setMethod('razorpay');
  }, [codDisabled, method]);
  useEffect(() => {
    if (belowOnlineMinimum && method === 'razorpay' && !codDisabled)
      setMethod('cod');
  }, [belowOnlineMinimum, method, codDisabled]);

  // ---- COD quote and delivery date for this PIN ----
  const pin = address?.pincode ?? '';
  const itemsKey = items.map(i => `${i.productId}:${i.quantity}`).join(',');
  useEffect(() => {
    if (!/^[1-9]\d{5}$/.test(pin) || !items.length) {
      setCod({ status: 'idle', amount: 0 });
      return;
    }
    let alive = true;
    setCod(c => ({ ...c, status: 'loading' }));
    const t = setTimeout(async () => {
      const q = await codQuote(pin, goodsDue, items);
      if (alive) setCod(q);
    }, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, itemsKey, goodsDue]);
  useEffect(() => {
    if (!/^\d{6}$/.test(pin) || !items.length) return setEta(null);
    let alive = true;
    cartDeliveryDate(pin, items).then(d => alive && setEta(d));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, itemsKey]);

  // ---- an online payment left open last time ----
  useEffect(() => {
    if (!user) return;
    checkPending(user.id).then(r => {
      if (!r) return;
      if (r.status === 'paid')
        finish(r.orderId, 'Payment successful!', r.buyNow);
      else if (r.status === 'processing')
        toast(
          "Your bank is still confirming the last payment. If it goes through, we'll place the order and email you.",
          {
            important: true,
          },
        );
      else
        toast(
          "Your last payment didn't go through, so no order was placed. You can try again.",
          { important: true },
        );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const finish = (orderId: string, message: string, wasBuyNow = buyNowMode) => {
    if (wasBuyNow) clearBuyNow(null);
    else clearCart();
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['wallet'] });
    toast(message);
    go(`/order-placed/${orderId}`, { replace: true });
  };

  const applyCoupon = async () => {
    if (!couponCode.trim())
      return setCouponError('Please enter a discount code');
    setCouponBusy(true);
    setCouponError(null);
    const r = await checkCoupon(couponCode, items, categoryOf);
    setCouponBusy(false);
    if (r.error) return setCouponError(r.error);
    setCoupon(r.coupon);
    setCouponCode('');
    toast(`Discount "${r.coupon!.name}" applied!`);
  };

  const place = async () => {
    if (!user) return go('/signin');
    if (!address)
      return toast('Please add a delivery address', { important: true });
    const mail = email.trim();
    if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))
      return toast('Please enter a valid email for your order updates', {
        important: true,
      });
    if (method === 'cod' && !paidByWallet && cod.status !== 'ready')
      return toast(
        cod.status === 'loading'
          ? 'Working out the Cash on Delivery charge - try again in a moment'
          : "Couldn't work out the Cash on Delivery charge for this PIN code. Check it, or pay online.",
        { important: true },
      );
    tap();
    setPlacing(true);
    const r = await placeOrder({
      items,
      address,
      email: mail,
      paymentMethod: method,
      coupon,
      couponPerLine: split?.perLine ?? new Map(),
      groups,
      totals: {
        subtotal,
        discount,
        shipping,
        codFee,
        total,
        walletUse,
        payNow,
      },
      deliveryEta: eta,
      products: new Map(
        [...(data?.products.entries() ?? [])].map(([id, p]) => [id, p]),
      ),
    });
    if (r.kind === 'error') {
      setPlacing(false);
      return toast(r.message, { important: true });
    }
    if (r.kind === 'placed') return finish(r.orderId, r.message);
    const outcome = await payOnline(
      r.orderId,
      r.razorpay,
      { name: address.full_name, email: mail, contact: address.phone },
      buyNowMode,
    );
    setPlacing(false);
    if (outcome === 'paid') return finish(r.orderId, 'Payment successful!');
    if (outcome === 'processing')
      return toast(
        "Your payment is still being confirmed by your bank. We'll place the order as soon as it goes through.",
        {
          important: true,
        },
      );
    if (outcome === 'unverified')
      return toast(
        'Payment could not be verified. If you were charged, contact support with your order reference.',
        {
          important: true,
        },
      );
    toast(
      'Payment not completed, so no order was placed. Your bag is saved - you can try again.',
      { important: true },
    );
  };

  if (!items.length) {
    return (
      <View style={styles.flex}>
        <AppHeader back title="Checkout" />
        <Sans style={styles.empty}>Nothing to check out.</Sans>
      </View>
    );
  }

  const ready = !!data && !isLoading;
  const actionLabel = placing
    ? 'Placing order...'
    : paidByWallet
    ? 'Place order (wallet)'
    : method === 'cod'
    ? 'Place order'
    : `Pay ${formatINR(payNow)}`;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <AppHeader back title="Checkout" />
      <View style={styles.steps}>
        {['Bag', 'Address', 'Payment'].map((s, i) => (
          <View key={s} style={styles.step}>
            <View style={[styles.stepDot, styles.stepDotOn]}>
              {i < 2 ? (
                <Check
                  size={11}
                  color={colors.primaryForeground}
                  strokeWidth={3}
                />
              ) : (
                <Text style={styles.stepNum}>3</Text>
              )}
            </View>
            <Text style={[styles.stepText, i === 2 && styles.stepTextOn]}>
              {s}
            </Text>
            {i < 2 ? <View style={styles.stepLine} /> : null}
          </View>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <DeliverTo />

        {!user?.email ? (
          <View style={styles.block}>
            <Eyebrow style={styles.head}>Email for order updates</Eyebrow>
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="you@example.com"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
            />
          </View>
        ) : null}

        <View style={styles.block}>
          <Eyebrow style={styles.head}>
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </Eyebrow>
          {items.map(i => (
            <View key={i.variantId} style={styles.item}>
              <View style={styles.thumb}>
                {i.productImage ? (
                  <Image
                    source={{ uri: i.productImage }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                ) : (
                  <Placeholder label={i.productName.charAt(0)} />
                )}
              </View>
              <View style={styles.flex1}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {i.productName}
                </Text>
                <Sans style={styles.small}>
                  {i.variantTitle !== 'Default' ? `${i.variantTitle} · ` : ''}
                  Qty {i.quantity}
                </Sans>
              </View>
              <Text style={styles.itemPrice}>
                {formatINR(parseFloat(i.price.amount) * i.quantity)}
              </Text>
            </View>
          ))}
          {eta ? (
            <View style={styles.eta}>
              <Truck size={15} color={colors.success} />
              <Sans style={styles.etaText}>
                Estimated delivery by {shortDate(eta)}
              </Sans>
            </View>
          ) : null}
        </View>

        <View style={styles.block}>
          <Eyebrow style={styles.head}>Coupon</Eyebrow>
          {coupon ? (
            <View style={styles.applied}>
              <Tag size={15} color={colors.success} />
              <Text style={styles.appliedText}>
                {coupon.code} applied - you save {formatINR(discount)}
              </Text>
              <Touch
                hitSlop={8}
                onPress={() => setCoupon(null)}
                accessibilityLabel="Remove coupon"
              >
                <X size={16} color={colors.mutedForeground} />
              </Touch>
            </View>
          ) : (
            <View style={styles.couponRow}>
              <TextInput
                value={couponCode}
                onChangeText={t => {
                  setCouponCode(t.toUpperCase());
                  setCouponError(null);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="Enter coupon code"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.flex1]}
                onSubmitEditing={applyCoupon}
              />
              <Touch
                style={styles.apply}
                onPress={applyCoupon}
                disabled={couponBusy}
              >
                <Text style={styles.applyText}>
                  {couponBusy ? '...' : 'Apply'}
                </Text>
              </Touch>
            </View>
          )}
          {couponError ? <Text style={styles.error}>{couponError}</Text> : null}
        </View>

        {walletBalance > 0 ? (
          <Touch
            style={[styles.block, styles.walletRow]}
            onPress={() => setWalletOn(v => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: walletOn }}
          >
            <View style={[styles.box, walletOn && styles.boxOn]}>
              {walletOn ? (
                <Check
                  size={13}
                  color={colors.primaryForeground}
                  strokeWidth={3}
                />
              ) : null}
            </View>
            <WalletIcon size={17} color={colors.primary} strokeWidth={1.6} />
            <Text style={styles.walletText}>
              Use my wallet balance ({formatINR(walletBalance)})
            </Text>
          </Touch>
        ) : null}

        {!paidByWallet ? (
          <View style={styles.block}>
            <Eyebrow style={styles.head}>Payment</Eyebrow>
            <PayOption
              on={method === 'razorpay'}
              disabled={belowOnlineMinimum}
              onPress={() => setMethod('razorpay')}
              icon={
                <CreditCard
                  size={18}
                  color={colors.foreground}
                  strokeWidth={1.6}
                />
              }
              title="Pay online"
              note={
                belowOnlineMinimum
                  ? 'Online payment needs at least ₹1'
                  : 'UPI, cards, netbanking and wallets - secured by Razorpay'
              }
            />
            <PayOption
              on={method === 'cod'}
              disabled={codDisabled}
              onPress={() => setMethod('cod')}
              icon={
                <Truck size={18} color={colors.foreground} strokeWidth={1.6} />
              }
              title="Cash on Delivery"
              note={
                codReason ??
                (cod.status === 'loading'
                  ? 'Working out the COD charge...'
                  : cod.status === 'ready'
                  ? `COD charge ${formatINR(cod.amount)}`
                  : cod.status === 'error'
                  ? "Couldn't get the COD charge - check the PIN code"
                  : 'Pay when it arrives')
              }
            />
          </View>
        ) : null}

        <View style={styles.block}>
          <Eyebrow style={styles.head}>Price details</Eyebrow>
          {!ready ? <ActivityIndicator color={colors.primary} /> : null}
          <Row label="Items" value={formatINR(subtotal)} />
          {discount > 0 ? (
            <Row
              label="Coupon discount"
              value={`- ${formatINR(discount)}`}
              good
            />
          ) : null}
          <Row
            label="Shipping"
            value={shipping > 0 ? formatINR(shipping) : 'Free'}
            good={shipping === 0}
          />
          {codFee > 0 ? (
            <Row label="Cash on Delivery charge" value={formatINR(codFee)} />
          ) : null}
          {walletUse > 0 ? (
            <Row
              label="Paid from wallet"
              value={`- ${formatINR(walletUse)}`}
              good
            />
          ) : null}
          <View style={styles.rule} />
          <Row
            label={walletUse > 0 ? 'To pay' : 'Total'}
            value={formatINR(payNow)}
            strong
          />
          <Sans style={styles.small}>
            Prices include GST. The final amount is confirmed when the order is
            placed.
          </Sans>
        </View>
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: 10 + insets.bottom }]}>
        <View>
          <Text style={styles.barTotal}>{formatINR(payNow)}</Text>
          <Sans style={styles.small}>
            {method === 'cod' && !paidByWallet ? 'Pay on delivery' : 'Total'}
          </Sans>
        </View>
        <Button
          label={actionLabel}
          onPress={place}
          disabled={placing || !ready || !address}
          style={styles.flex1}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function PayOption({
  on,
  disabled,
  onPress,
  icon,
  title,
  note,
}: {
  on: boolean;
  disabled?: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  title: string;
  note: string;
}) {
  return (
    <Touch
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.pay,
        on && !disabled && styles.payOn,
        disabled && styles.dim,
      ]}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled: !!disabled }}
    >
      <View style={[styles.radio, on && !disabled && styles.radioOn]}>
        {on && !disabled ? <View style={styles.radioDot} /> : null}
      </View>
      {icon}
      <View style={styles.flex1}>
        <Text style={styles.payTitle}>{title}</Text>
        <Sans style={styles.small}>{note}</Sans>
      </View>
    </Touch>
  );
}

function Row({
  label,
  value,
  strong,
  good,
}: {
  label: string;
  value: string;
  strong?: boolean;
  good?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Sans style={strong ? styles.strong : undefined}>{label}</Sans>
      <Sans style={[strong && styles.strong, good && styles.good]}>
        {value}
      </Sans>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  empty: { textAlign: 'center', marginTop: 48, color: colors.mutedForeground },
  steps: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: colors.ivory,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  stepDotOn: { backgroundColor: colors.primary },
  stepNum: {
    fontFamily: fonts.sansSemi,
    fontSize: 10,
    color: colors.primaryForeground,
  },
  stepText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.mutedForeground,
  },
  stepTextOn: { color: colors.primary },
  stepLine: {
    width: 22,
    height: 1,
    backgroundColor: colors.gold,
    marginLeft: 4,
  },
  block: { backgroundColor: colors.ivory, padding: 16, marginBottom: 8 },
  head: { color: colors.foreground, marginBottom: 10 },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.foreground,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  thumb: {
    width: 48,
    height: 64,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  itemName: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.foreground,
  },
  itemPrice: {
    fontFamily: fonts.sansSemi,
    fontSize: 14,
    color: colors.foreground,
  },
  small: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 2,
    lineHeight: 18,
  },
  eta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  etaText: { fontSize: 13, color: colors.success },
  couponRow: { flexDirection: 'row', gap: 8 },
  apply: {
    height: 46,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  applyText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ivory,
  },
  applied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#E7F0E9',
  },
  appliedText: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.success,
  },
  error: {
    fontFamily: fonts.sansMedium,
    color: colors.destructive,
    marginTop: 8,
  },
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  walletText: {
    flex: 1,
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
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  payOn: { borderColor: colors.primary, backgroundColor: colors.accent },
  dim: { opacity: 0.5 },
  payTitle: {
    fontFamily: fonts.sansMedium,
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  strong: { fontFamily: fonts.sansSemi, color: colors.foreground },
  good: { color: colors.success },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.ivory,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  barTotal: {
    fontFamily: fonts.sansSemi,
    fontSize: 18,
    color: colors.foreground,
  },
});
