import { Image } from 'react-native';
import { useGo, useParams } from '@/navigation';
import {
  ArrowRight,
  BadgeCheck,
  MessageCircle,
  Heart,
  RotateCcw,
  Share2,
  ShoppingBag,
  Truck,
  Wallet,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { ProductRail } from '@/components/ProductLists';
import {
  Accordion,
  DeliveryCheck,
  InfoRow,
  NotifyMe,
  RatingLine,
  Reviews,
  SizeGuideLink,
} from '@/components/ProductExtras';
import { CONFIG } from '@/config';
import { useVendorInfo, vendorAddressLine } from '@/lib/productExtras';
import {
  Button,
  Eyebrow,
  Placeholder,
  Sans,
  Serif,
  Touch,
} from '@/components/ui';
import {
  colorOf,
  productColors,
  productSizes,
  sizeOf,
  useProduct,
  useProducts,
} from '@/lib/catalog';
import { discountPercent, formatINR } from '@/lib/format';
import { success, tap } from '@/lib/haptics';
import { useCart, useWishlist } from '@/lib/stores';
import { SITE_URL } from '@/lib/supabase';
import { colors, fonts } from '@/theme';

export default function ProductScreen() {
  const { id } = useParams<'Product'>();
  const go = useGo();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data: product, isLoading } = useProduct(id);
  const { data: all = [] } = useProducts();
  const addItem = useCart(st => st.addItem);
  const wished = useWishlist(st => (id ? st.ids.includes(id) : false));
  const toggleWish = useWishlist(st => st.toggle);

  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [missing, setMissing] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const sizes = product ? productSizes(product) : [];
  const colours = product ? productColors(product) : [];
  const variant = useMemo(
    () =>
      product?.variants.find(
        v =>
          (!sizes.length || sizeOf(v) === size) &&
          (!colours.length || colorOf(v) === color),
      ) ?? null,
    [product, size, color, sizes.length, colours.length],
  );
  const similar = useMemo(
    () =>
      product
        ? all
            .filter(
              p => p.id !== product.id && p.category_id === product.category_id,
            )
            .slice(0, 12)
        : [],
    [all, product],
  );
  const { data: vendorInfo } = useVendorInfo(product?.vendor_id);

  if (isLoading) {
    return (
      <View style={{ flex: 1 }}>
        <AppHeader back />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 64 }} />
      </View>
    );
  }
  if (!product) {
    return (
      <View style={{ flex: 1 }}>
        <AppHeader back />
        <View style={{ alignItems: 'center', padding: 32 }}>
          <Serif style={{ fontSize: 24, textAlign: 'center' }}>
            This piece isn't available
          </Serif>
          <Button
            label="Keep shopping"
            onPress={() => go('/category/all', { replace: true })}
            style={{ marginTop: 20, alignSelf: 'stretch' }}
          />
        </View>
      </View>
    );
  }

  const price = variant?.price || product.price;
  const off = discountPercent(price, product.compare_at_price);
  const stock = variant ? variant.stock : product.stock_quantity;
  const soldOut =
    !product.made_to_order &&
    (product.variants.length
      ? product.variants.every(v => v.stock <= 0)
      : stock <= 0);
  const images = variant?.image_url ? [variant.image_url] : product.images;
  // Same rules as the website's product page.
  const prepDays = product.prep_days ?? vendorInfo?.default_prep_days ?? 2;
  const returnable =
    product.is_returnable !== false && vendorInfo?.returns_enabled !== false;
  const codAvailable =
    product.cod_available !== false && vendorInfo?.cod_enabled !== false;
  const photoHeight = Math.round((width * 4) / 3);

  // A size is out of stock when no variant with it (in the chosen colour) has any.
  const sizeAvailable = (sz: string) =>
    !!product.made_to_order ||
    product.variants.some(
      v => sizeOf(v) === sz && (!color || colorOf(v) === color) && v.stock > 0,
    );

  const addToBag = () => {
    if (added) return go('/bag');
    const need = [
      sizes.length && !size ? 'size' : null,
      colours.length && !color ? 'colour' : null,
    ].filter(Boolean);
    if (
      need.length ||
      (product.variants.length && (sizes.length || colours.length) && !variant)
    ) {
      setMissing(
        need.length === 2
          ? 'Please select a size and a colour'
          : `Please select a ${need[0] ?? 'size'}`,
      );
      tap();
      return;
    }
    setMissing(null);
    const options = [
      ...(size ? [{ name: 'Size', value: size }] : []),
      ...(color ? [{ name: 'Colour', value: color }] : []),
    ];
    addItem({
      productId: product.id,
      productName: product.name,
      productImage: product.images[0] ?? null,
      vendorId: product.vendor_id,
      variantId:
        variant?.id ??
        `${product.id}-${size || 'default'}-${color || 'default'}`,
      variantTitle: [size, color].filter(Boolean).join(' / ') || 'Default',
      price: { amount: String(price), currencyCode: 'INR' },
      quantity: 1,
      selectedOptions: options,
    });
    success();
    setAdded(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader back />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 90 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Gallery */}
        <View style={{ height: photoHeight, backgroundColor: colors.ivory }}>
          {images.length ? (
            <FlatList
              data={images}
              keyExtractor={(u, i) => `${i}-${u}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={e =>
                setPhoto(Math.round(e.nativeEvent.contentOffset.x / width))
              }
              renderItem={({ item, index }) => (
                <Image
                  source={{ uri: item }}
                  style={{ width, height: photoHeight }}
                  resizeMode="cover"
                  accessibilityLabel={`${product.name}, photo ${index + 1}`}
                />
              )}
            />
          ) : (
            <Placeholder label={product.name.charAt(0)} />
          )}
          {images.length > 1 ? (
            <Text style={styles.counter}>
              {photo + 1} / {images.length}
            </Text>
          ) : null}
          <Touch
            hitSlop={8}
            style={styles.share}
            accessibilityLabel="Share"
            onPress={() =>
              Share.share({
                message: `${product.name} on AllBoutiqs: ${SITE_URL}/product/${product.id}`,
              })
            }
          >
            <Share2 size={18} color={colors.foreground} strokeWidth={1.7} />
          </Touch>
        </View>

        {/* Title and price */}
        <View style={styles.block}>
          {product.vendor?.name ? (
            <Touch
              onPress={() =>
                product.vendor?.slug && go(`/store/${product.vendor.slug}`)
              }
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text style={styles.brand}>{product.vendor.name}</Text>
              {vendorInfo?.is_verified ? (
                <BadgeCheck size={14} color={colors.gold} />
              ) : null}
            </Touch>
          ) : null}
          {vendorInfo && (vendorInfo.is_founding || vendorInfo.is_trusted) ? (
            <View style={styles.badges}>
              {vendorInfo.is_founding ? (
                <Text style={styles.badge}>Founding boutique</Text>
              ) : null}
              {vendorInfo.is_trusted ? (
                <Text style={styles.badge}>Trusted partner</Text>
              ) : null}
            </View>
          ) : null}
          <Serif style={styles.name}>{product.name}</Serif>
          <RatingLine productId={product.id} />
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatINR(price)}</Text>
            {off ? (
              <>
                <Text style={styles.mrp}>
                  MRP {formatINR(product.compare_at_price)}
                </Text>
                <Text style={styles.off}>({off}% off)</Text>
              </>
            ) : null}
          </View>
          <Sans style={styles.tax}>Inclusive of all taxes</Sans>
          {soldOut ? <Text style={styles.soldOut}>Out of stock</Text> : null}
          {product.made_to_order ? (
            <Text style={styles.madeToOrder}>
              Made to order · ships in {prepDays} days
            </Text>
          ) : null}
          {!soldOut && !product.made_to_order && stock > 0 && stock <= 5 ? (
            <Text style={styles.low}>Only {stock} left</Text>
          ) : null}
        </View>

        {/* Colour */}
        {colours.length > 0 ? (
          <View style={styles.block}>
            <Eyebrow style={{ color: colors.foreground }}>
              Colour
              {color ? (
                <Text style={{ color: colors.mutedForeground }}>: {color}</Text>
              ) : null}
            </Eyebrow>
            <View style={styles.options}>
              {colours.map(c => (
                <Touch
                  key={c}
                  haptic
                  onPress={() => {
                    setColor(c);
                    setPhoto(0);
                    setMissing(null);
                    setAdded(false);
                  }}
                  style={[styles.option, color === c && styles.optionActive]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      color === c && { color: colors.primary },
                    ]}
                  >
                    {c}
                  </Text>
                </Touch>
              ))}
            </View>
          </View>
        ) : null}

        {/* Size */}
        {sizes.length > 0 ? (
          <View style={styles.block}>
            <View style={styles.sizeHead}>
              <Eyebrow style={{ color: colors.foreground }}>
                Select size
              </Eyebrow>
              <SizeGuideLink
                categoryId={product.category_id}
                vendorId={product.vendor_id}
              />
            </View>
            <View style={styles.options}>
              {sizes.map(sz => {
                const ok = sizeAvailable(sz);
                return (
                  <Touch
                    key={sz}
                    haptic
                    disabled={!ok}
                    onPress={() => {
                      setSize(sz);
                      setMissing(null);
                      setAdded(false);
                    }}
                    style={[
                      styles.size,
                      size === sz && styles.optionActive,
                      !ok && { opacity: 0.4 },
                    ]}
                    accessibilityState={{
                      selected: size === sz,
                      disabled: !ok,
                    }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        size === sz && { color: colors.primary },
                        !ok && { textDecorationLine: 'line-through' },
                      ]}
                    >
                      {sz}
                    </Text>
                  </Touch>
                );
              })}
            </View>
          </View>
        ) : null}
        {missing ? <Text style={styles.missing}>{missing}</Text> : null}

        {/* Promises */}
        <View style={[styles.block, { gap: 12 }]}>
          <Info
            icon={<Truck size={18} color={colors.gold} strokeWidth={1.6} />}
            text={
              product.made_to_order
                ? 'Made to order, then quality-checked and shipped free'
                : 'Free shipping on every order'
            }
          />
          {returnable ? (
            <Info
              icon={
                <RotateCcw size={18} color={colors.gold} strokeWidth={1.6} />
              }
              text={`${vendorInfo?.return_window_days ?? 7}-day returns`}
            />
          ) : null}
          {codAvailable ? (
            <Info
              icon={<Wallet size={18} color={colors.gold} strokeWidth={1.6} />}
              text="Cash on delivery available"
            />
          ) : null}
        </View>

        {soldOut ? (
          <View style={styles.block}>
            <NotifyMe productId={product.id} />
          </View>
        ) : null}

        {product.vendor_id ? (
          <View style={styles.block}>
            <Eyebrow style={{ color: colors.foreground, marginBottom: 10 }}>
              Check delivery
            </Eyebrow>
            <DeliveryCheck
              vendorId={product.vendor_id}
              productId={product.id}
            />
          </View>
        ) : null}

        <Touch
          style={[styles.block, styles.stylist]}
          onPress={() =>
            Linking.openURL(
              `${CONFIG.whatsappUrl}?text=${encodeURIComponent(
                `Hi AllBoutiqs, I'd like help with this piece: ${product.name} - ${SITE_URL}/product/${product.id}`,
              )}`,
            )
          }
        >
          <MessageCircle size={18} color={colors.primary} strokeWidth={1.6} />
          <Text style={styles.stylistText}>
            Speak to our stylist on WhatsApp
          </Text>
        </Touch>

        {/* Details */}
        {product.description || product.specifications?.length ? (
          <View style={styles.block}>
            <Eyebrow style={{ color: colors.foreground, marginBottom: 10 }}>
              Product details
            </Eyebrow>
            {product.description ? (
              <Sans style={{ lineHeight: 22, color: colors.foreground }}>
                {product.description}
              </Sans>
            ) : null}
            {product.specifications?.map(sp => (
              <View key={sp.label} style={styles.spec}>
                <Text style={styles.specLabel}>{sp.label}</Text>
                <Text style={styles.specValue}>{sp.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.block}>
          <Accordion title="Product information">
            <InfoRow label="Product code">
              {product.sku || product.id.slice(0, 8)}
            </InfoRow>
            <InfoRow label="MRP">
              {formatINR(product.compare_at_price ?? product.price)} inclusive
              of all taxes
            </InfoRow>
            <InfoRow label="Sold by">
              {vendorInfo?.name || 'AllBoutiqs'}
            </InfoRow>
            <InfoRow label="Marketed / manufactured by">
              {vendorInfo?.name || 'AllBoutiqs'}
              {vendorAddressLine(vendorInfo)
                ? `, ${vendorAddressLine(vendorInfo)}`
                : ''}
            </InfoRow>
            {product.net_quantity ? (
              <InfoRow label="Net quantity">{product.net_quantity}</InfoRow>
            ) : null}
            {product.country_of_origin ? (
              <InfoRow label="Country of origin">
                {product.country_of_origin}
              </InfoRow>
            ) : null}
            <InfoRow label="Customer care">
              {[
                vendorAddressLine(vendorInfo),
                vendorInfo?.contact_phone && `Ph: ${vendorInfo.contact_phone}`,
                vendorInfo?.contact_email &&
                  `Email: ${vendorInfo.contact_email}`,
              ]
                .filter(Boolean)
                .join('. ') ||
                `${CONFIG.supportEmail} · ${CONFIG.supportPhone}`}
            </InfoRow>
            <InfoRow label="AllBoutiqs customer care">
              {CONFIG.supportEmail} · {CONFIG.supportPhone} · WhatsApp{' '}
              {CONFIG.whatsapp}
            </InfoRow>
          </Accordion>
        </View>

        <View style={styles.block}>
          <Reviews productId={product.id} />
        </View>

        <ProductRail
          eyebrowText="You may also like"
          title="Similar"
          accent="pieces"
          products={similar}
        />
      </ScrollView>

      {/* Sticky actions */}
      <View style={[styles.bar, { paddingBottom: 10 + insets.bottom }]}>
        <Button
          label={wished ? 'Wishlisted' : 'Wishlist'}
          variant="outline"
          style={{ flex: 1 }}
          icon={
            <Heart
              size={17}
              color={wished ? colors.primary : colors.foreground}
              fill={wished ? colors.primary : 'transparent'}
            />
          }
          onPress={() => toggleWish(product.id)}
        />
        <Button
          label={soldOut ? 'Out of stock' : added ? 'Go to bag' : 'Add to bag'}
          disabled={soldOut}
          style={{ flex: 1.4 }}
          icon={
            added ? (
              <ArrowRight size={17} color={colors.primaryForeground} />
            ) : (
              <ShoppingBag
                size={17}
                color={
                  soldOut ? colors.mutedForeground : colors.primaryForeground
                }
              />
            )
          }
          onPress={addToBag}
        />
      </View>
    </View>
  );
}

function Info({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {icon}
      <Sans style={{ flex: 1, color: colors.foreground }}>{text}</Sans>
    </View>
  );
}

const styles = StyleSheet.create({
  counter: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(252,251,248,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.foreground,
  },
  share: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(252,251,248,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    backgroundColor: colors.ivory,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
  },
  brand: {
    fontFamily: fonts.sansSemi,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.foreground,
  },
  name: { fontSize: 24, lineHeight: 30, marginTop: 4 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  price: { fontFamily: fonts.sansSemi, fontSize: 20, color: colors.foreground },
  mrp: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.mutedForeground,
    textDecorationLine: 'line-through',
  },
  off: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.gold },
  tax: { fontSize: 12, color: colors.success, marginTop: 4 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 6 },
  badge: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.gold,
    borderWidth: 1,
    borderColor: colors.goldSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  madeToOrder: {
    fontFamily: fonts.sansMedium,
    color: colors.primary,
    marginTop: 8,
  },
  sizeHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stylist: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stylistText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.primary,
  },
  soldOut: {
    fontFamily: fonts.sansMedium,
    color: colors.destructive,
    marginTop: 8,
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  option: {
    paddingHorizontal: 14,
    height: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  size: {
    minWidth: 48,
    height: 48,
    paddingHorizontal: 10,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionActive: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    backgroundColor: colors.accent,
  },
  optionText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.foreground,
  },
  low: {
    fontFamily: fonts.sansMedium,
    color: colors.destructive,
    marginTop: 10,
    fontSize: 13,
  },
  missing: {
    fontFamily: fonts.sansMedium,
    color: colors.destructive,
    paddingHorizontal: 16,
    marginTop: -2,
    marginBottom: 10,
  },
  spec: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  specLabel: {
    width: 130,
    fontFamily: fonts.sans,
    color: colors.mutedForeground,
    fontSize: 13,
  },
  specValue: {
    flex: 1,
    fontFamily: fonts.sans,
    color: colors.foreground,
    fontSize: 13,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: colors.ivory,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
