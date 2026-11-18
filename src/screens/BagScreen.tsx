import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { useGo } from '@/navigation';
import {
  Check,
  ChevronDown,
  Lock,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
} from 'lucide-react-native';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { Sheet } from '@/components/Listing';
import { Button, Placeholder, Sans, Serif, Touch } from '@/components/ui';
import { useSession } from '@/lib/auth';
import {
  DeliverTo,
  useDeliverTo,
  useDeliveryAddress,
} from '@/components/DeliverTo';
import {
  lineAsSize,
  lineSize,
  SizeChoice,
  sizeChoices,
  useCartVariants,
} from '@/lib/cartVariants';
import { cartDeliveryDate } from '@/lib/checkout';
import { formatINR } from '@/lib/format';
import { shortDate } from '@/lib/orders';
import { CartItem, cartCount, cartTotal, useCart } from '@/lib/stores';
import { toast } from '@/lib/toast';
import { colors, fonts } from '@/theme';

export default function Bag() {
  const go = useGo();
  const insets = useSafeAreaInsets();
  const { items, setQuantity, removeItem, changeVariant } = useCart();
  const count = cartCount(items);
  const total = cartTotal(items);
  // Each piece's sizes (to change a line's size here) and its SKU.
  const { data: pieces } = useCartVariants(items.map(i => i.productId));
  const [sizeSheet, setSizeSheet] = useState<{
    item: CartItem;
    choices: SizeChoice[];
  } | null>(null);

  const changeSize = (item: CartItem, choice: SizeChoice) => {
    setSizeSheet(null);
    const size = choice.size;
    if (choice.soldOut || size === lineSize(item)) return;
    const stock = choice.variant.stock;
    // A line already in the bag in that size takes this one in.
    const twin = items.find(
      i => i !== item && i.variantId === choice.variant.id,
    );
    const wanted = item.quantity + (twin?.quantity ?? 0);
    changeVariant(item.variantId, lineAsSize(item, choice), stock);
    toast(
      wanted > stock
        ? `Size changed to ${size}. Only ${stock} left in this size, so the quantity is now ${stock}.`
        : twin
        ? `Size changed to ${size} and added to the ${size} already in your bag`
        : `Size changed to ${size}`,
    );
  };

  const signedIn = useSession(st => st.status === 'signed-in');
  const { address, loading: addressLoading } = useDeliveryAddress();
  const openDeliver = useDeliverTo(st => st.open);
  // Signed out: sign in first. No address: add one right here. Then checkout.
  const checkout = () => {
    if (!signedIn) return go('/signin');
    if (!address && !addressLoading) return openDeliver('add');
    go('/checkout');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader back title={`Bag${count ? ` (${count})` : ''}`} />
      {items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <ShoppingBag size={30} color={colors.gold} strokeWidth={1.4} />
          </View>
          <Serif style={{ fontSize: 24, marginTop: 20 }}>
            Your bag is empty
          </Serif>
          <Sans
            style={{
              color: colors.mutedForeground,
              marginTop: 8,
              textAlign: 'center',
            }}
          >
            Discover pieces from India's finest boutiques.
          </Sans>
          <Button
            label="Start shopping"
            onPress={() => go('/category/all', { replace: true })}
            style={{ marginTop: 24, alignSelf: 'stretch' }}
          />
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            ListHeaderComponent={
              <>
                {signedIn ? (
                  <DeliverTo />
                ) : (
                  <Touch
                    style={styles.signinStrip}
                    onPress={() => go('/signin')}
                  >
                    <Text style={styles.signinText}>
                      Sign in to choose where it's delivered
                    </Text>
                  </Touch>
                )}
                <DeliveryDate
                  items={items}
                  pincode={signedIn ? address?.pincode ?? null : null}
                />
              </>
            }
            keyExtractor={i => i.variantId}
            contentContainerStyle={{
              paddingVertical: 8,
              paddingBottom: 200 + insets.bottom,
            }}
            renderItem={({ item }) => {
              const choices = sizeChoices(
                item,
                pieces?.variants.get(item.productId),
              );
              const sku = item.sku || pieces?.skus.get(item.productId);
              // Size (a picker when the piece comes in other sizes in this
              // colour), colour if any, and the boutique's SKU.
              const details = [
                ...item.selectedOptions
                  .filter(o => !(choices && o.name.toLowerCase() === 'size'))
                  .map(o => `${o.name}: ${o.value}`),
                ...(sku ? [`SKU: ${sku}`] : []),
              ].join(' · ');
              return (
                <View style={styles.line}>
                  <Touch
                    onPress={() => go(`/product/${item.productId}`)}
                    style={styles.thumb}
                  >
                    {item.productImage ? (
                      <Image
                        source={{ uri: item.productImage }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                    ) : (
                      <Placeholder label={item.productName.charAt(0)} />
                    )}
                  </Touch>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={2}>
                      {item.productName}
                    </Text>
                    {choices ? (
                      <View style={styles.sizeRow}>
                        <Text style={styles.variant}>Size</Text>
                        <Touch
                          style={styles.sizePick}
                          onPress={() => setSizeSheet({ item, choices })}
                          accessibilityRole="button"
                          accessibilityLabel={`Size of ${
                            item.productName
                          }: ${lineSize(item)}. Change`}
                        >
                          <Text style={styles.sizeText}>{lineSize(item)}</Text>
                          <ChevronDown size={14} color={colors.foreground} />
                        </Touch>
                      </View>
                    ) : null}
                    {details ? (
                      <Text style={styles.variant}>{details}</Text>
                    ) : null}
                    <Text style={styles.price}>
                      {formatINR(Number(item.price.amount) * item.quantity)}
                    </Text>
                    <View style={styles.qtyRow}>
                      <View style={styles.stepper}>
                        <Touch
                          haptic
                          hitSlop={6}
                          style={styles.step}
                          onPress={() =>
                            setQuantity(item.variantId, item.quantity - 1)
                          }
                          accessibilityLabel="Fewer"
                        >
                          <Minus size={15} color={colors.foreground} />
                        </Touch>
                        <Text style={styles.qty}>{item.quantity}</Text>
                        <Touch
                          haptic
                          hitSlop={6}
                          style={styles.step}
                          onPress={() =>
                            setQuantity(item.variantId, item.quantity + 1)
                          }
                          accessibilityLabel="More"
                        >
                          <Plus size={15} color={colors.foreground} />
                        </Touch>
                      </View>
                      <Touch
                        hitSlop={8}
                        onPress={() => removeItem(item.variantId)}
                        accessibilityLabel="Remove"
                      >
                        <Trash2
                          size={18}
                          color={colors.mutedForeground}
                          strokeWidth={1.6}
                        />
                      </Touch>
                    </View>
                  </View>
                </View>
              );
            }}
          />
          <Sheet
            visible={!!sizeSheet}
            title="Size"
            onClose={() => setSizeSheet(null)}
          >
            {sizeSheet?.choices.map(c => {
              const on = c.size === lineSize(sizeSheet.item);
              const off = c.soldOut && !on;
              return (
                <Touch
                  key={c.size}
                  disabled={off}
                  style={[styles.sizeOption, off && styles.dim]}
                  onPress={() => changeSize(sizeSheet.item, c)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: off }}
                >
                  <Text style={[styles.sizeOptionText, on && styles.sizeOn]}>
                    {c.size}
                    {c.soldOut ? ' (sold out)' : ''}
                  </Text>
                  {on ? <Check size={17} color={colors.primary} /> : null}
                </Touch>
              );
            })}
          </Sheet>
          <View style={[styles.summary, { paddingBottom: 12 + insets.bottom }]}>
            <View style={styles.totalRow}>
              <Sans>Subtotal</Sans>
              <Sans style={{ fontFamily: fonts.sansSemi }}>
                {formatINR(total)}
              </Sans>
            </View>
            <Button
              label="Place order"
              icon={<Lock size={15} color={colors.primaryForeground} />}
              onPress={checkout}
              style={{ marginTop: 10 }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginTop: 10,
              }}
            >
              <ShieldCheck size={14} color={colors.gold} />
              <Text style={styles.secure}>Secure payments by Razorpay</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

// Delivery is free for every customer, so the bag doesn't spend room saying
// so - it only offers the delivery date (the website's CartShippingEstimate):
// for the delivery address's PIN code, else for a PIN code typed here.
function DeliveryDate({
  items,
  pincode,
}: {
  items: CartItem[];
  pincode: string | null;
}) {
  const [typed, setTyped] = useState('');
  const [checkedPin, setCheckedPin] = useState<string | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const pin = pincode ?? checkedPin;
  const itemsKey = items.map(i => `${i.productId}:${i.quantity}`).join(',');
  useEffect(() => {
    setEta(null);
    if (!pin || !/^\d{6}$/.test(pin) || !items.length) return;
    let alive = true;
    setChecking(true);
    cartDeliveryDate(pin, items).then(d => {
      if (!alive) return;
      setEta(d);
      setChecking(false);
    });
    return () => {
      alive = false;
      setChecking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, itemsKey]);

  if (pincode && !eta) return null;
  return (
    <View style={styles.dateBlock}>
      {pincode ? null : (
        <View style={styles.pinRow}>
          <TextInput
            value={typed}
            onChangeText={t => setTyped(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="Enter pincode for delivery date"
            placeholderTextColor={colors.mutedForeground}
            style={styles.pinInput}
            onSubmitEditing={() => typed.length === 6 && setCheckedPin(typed)}
          />
          <Touch
            style={[styles.pinCheck, typed.length !== 6 && styles.dim]}
            disabled={typed.length !== 6 || checking}
            onPress={() => setCheckedPin(typed)}
          >
            <Text style={styles.pinCheckText}>
              {checking ? '...' : 'Check'}
            </Text>
          </Touch>
        </View>
      )}
      {eta ? (
        <View style={styles.etaRow}>
          <Truck size={15} color={colors.success} />
          <Text style={styles.etaText}>
            Estimated delivery by {shortDate(eta)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dateBlock: { paddingHorizontal: 16, marginBottom: 8 },
  pinRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  pinInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
    paddingHorizontal: 12,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.foreground,
  },
  pinCheck: {
    height: 42,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.foreground,
  },
  pinCheckText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.foreground,
  },
  dim: { opacity: 0.5 },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  sizePick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 76,
    height: 32,
    paddingHorizontal: 10,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(35,31,26,0.2)',
    backgroundColor: colors.background,
  },
  sizeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.foreground,
  },
  sizeOption: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sizeOptionText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.foreground,
  },
  sizeOn: { color: colors.primary, fontFamily: fonts.sansMedium },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  etaText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.success,
  },
  signinStrip: { backgroundColor: colors.ivory, padding: 16, marginBottom: 8 },
  signinText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.primary,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    backgroundColor: colors.ivory,
    marginBottom: 8,
  },
  thumb: {
    width: 86,
    height: 115,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  name: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.foreground,
  },
  variant: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 3,
  },
  price: {
    fontFamily: fonts.sansSemi,
    fontSize: 15,
    color: colors.foreground,
    marginTop: 6,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  step: {
    width: 34,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: {
    minWidth: 28,
    textAlign: 'center',
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.foreground,
  },
  summary: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.ivory,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  secure: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.mutedForeground,
  },
});
