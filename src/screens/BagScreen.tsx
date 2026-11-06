import { Image } from 'react-native';
import { useGo } from '@/navigation';
import {
  Lock,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
} from 'lucide-react-native';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { Button, Placeholder, Sans, Serif, Touch } from '@/components/ui';
import { useSession } from '@/lib/auth';
import {
  DeliverTo,
  useDeliverTo,
  useDeliveryAddress,
} from '@/components/DeliverTo';
import { formatINR } from '@/lib/format';
import { cartCount, cartTotal, useCart } from '@/lib/stores';
import { colors, fonts } from '@/theme';

export default function Bag() {
  const go = useGo();
  const insets = useSafeAreaInsets();
  const { items, setQuantity, removeItem } = useCart();
  const count = cartCount(items);
  const total = cartTotal(items);

  const signedIn = useSession(st => st.status === 'signed-in');
  const { address, loading: addressLoading } = useDeliveryAddress();
  const openDeliver = useDeliverTo(st => st.open);
  // Signed out: sign in first. No address: add one right here. Payment
  // (Razorpay, with server-side prices) is the next step.
  const checkout = () => {
    if (!signedIn) return go('/signin');
    if (!address && !addressLoading) return openDeliver('add');
    Alert.alert(
      'Checkout is coming to the app',
      'Your bag and address are saved. In-app checkout with UPI, cards and cash on delivery arrives in the next update.',
    );
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
              signedIn ? (
                <DeliverTo />
              ) : (
                <Touch style={styles.signinStrip} onPress={() => go('/signin')}>
                  <Text style={styles.signinText}>
                    Sign in to choose where it's delivered
                  </Text>
                </Touch>
              )
            }
            keyExtractor={i => i.variantId}
            contentContainerStyle={{
              paddingVertical: 8,
              paddingBottom: 200 + insets.bottom,
            }}
            renderItem={({ item }) => (
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
                  {item.variantTitle !== 'Default' ? (
                    <Text style={styles.variant}>{item.variantTitle}</Text>
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
            )}
          />
          <View style={[styles.summary, { paddingBottom: 12 + insets.bottom }]}>
            <View style={styles.totalRow}>
              <Sans>Subtotal</Sans>
              <Sans style={{ fontFamily: fonts.sansSemi }}>
                {formatINR(total)}
              </Sans>
            </View>
            <View style={styles.totalRow}>
              <Sans>Shipping</Sans>
              <Sans
                style={{ color: colors.success, fontFamily: fonts.sansMedium }}
              >
                Free
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

const styles = StyleSheet.create({
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
