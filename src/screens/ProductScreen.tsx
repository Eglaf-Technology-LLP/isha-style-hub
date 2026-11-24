import { Image } from 'react-native';
import { useGo, useParams } from '@/navigation';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Earth,
  MessageCircle,
  Heart,
  RotateCcw,
  Scissors,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
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
import { ColourBoxes } from '@/components/ColourBoxes';
import { Customiser } from '@/components/Customiser';
import { GrievanceOfficerNote } from '@/components/GrievanceOfficerNote';
import { Chip, Sheet } from '@/components/Listing';
import { PhotoViewer } from '@/components/PhotoViewer';
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
  returnWindowAdjective,
  returnWindowSpan,
  useReturnWindowHours,
} from '@/lib/settings';
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
  defaultVariant,
  productColors,
  productSizes,
  sizeOf,
  useBoutiques,
  useProduct,
  useProducts,
  variantImages,
  variantPrice,
} from '@/lib/catalog';
import { colourCodes } from '@/lib/colors';
import { daysUntil } from '@/lib/dates';
import { discountPercent, formatINR } from '@/lib/format';
import { success, tap } from '@/lib/haptics';
import { CartItem, newLineId, useCart, useWishlist } from '@/lib/stores';
import {
  buildCustomisation,
  customisationPrice,
  emptyCustomiser,
  readSetup,
} from '@/lib/customisation';
import { toast } from '@/lib/toast';
import { useBuyNow } from '@/lib/checkout';
import { useShipsBy } from '@/lib/shipsBy';
import {
  readSoldOutSetup,
  soldOutTermsFor,
  takesSoldOutOrders,
} from '@/lib/soldOutMadeToOrder';
import { useSession } from '@/lib/auth';
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
  const setBuyNow = useBuyNow(st => st.set);
  const signedIn = useSession(st => st.status === 'signed-in');
  const wished = useWishlist(st => (id ? st.ids.includes(id) : false));
  const toggleWish = useWishlist(st => st.toggle);

  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  // The photo on screen, for the set of photos it belongs to (another
  // colour's photos start from the first again).
  const [photoAt, setPhotoAt] = useState({ gallery: '', index: 0 });
  const [missing, setMissing] = useState<string | null>(null);
  // "Customise this piece" (products a boutique made customisable).
  const [customiser, setCustomiser] = useState(emptyCustomiser);
  const [added, setAdded] = useState(false);
  // Add to bag without a size: the size picker opens from the bottom (Myntra-style).
  const [chooser, setChooser] = useState(false);
  const [chooserFor, setChooserFor] = useState<'bag' | 'buy'>('bag');
  // Full-screen photos, opened at the tapped one.
  const [viewer, setViewer] = useState<number | null>(null);

  const sizes = product ? productSizes(product) : [];
  const colours = product ? productColors(product) : [];
  const variant = useMemo(() => {
    if (!product) return null;
    // Nothing chosen yet (first frame): the default variant, so its price -
    // the one on the product card - shows from the start.
    if (size == null && color == null) return defaultVariant(product);
    const matches = product.variants.filter(
      v =>
        (!sizes.length || sizeOf(v) === size) &&
        (!colours.length || colorOf(v) === color),
    );
    // Same rule as the default: the first in stock, else the first.
    return matches.find(v => v.stock > 0) ?? matches[0] ?? null;
  }, [product, size, color, sizes.length, colours.length]);
  // As on the website: a size and a colour are always chosen - on opening,
  // the first variant in stock (else the first); changing one keeps the
  // pair a real variant (another colour in that size, or another size in
  // that colour).
  useEffect(() => {
    if (!product) return;
    const pick = defaultVariant(product);
    setSize(pick ? sizeOf(pick) : null);
    setColor(pick ? colorOf(pick) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);
  const chooseSize = (sz: string) => {
    setSize(sz);
    const vs = product?.variants ?? [];
    if (
      vs.length &&
      color &&
      !vs.some(v => sizeOf(v) === sz && colorOf(v) === color)
    ) {
      const alt =
        vs.find(v => sizeOf(v) === sz && v.stock > 0) ??
        vs.find(v => sizeOf(v) === sz);
      setColor(alt ? colorOf(alt) : null);
    }
  };
  const chooseColor = (c: string) => {
    setColor(c);
    const vs = product?.variants ?? [];
    if (
      vs.length &&
      size &&
      !vs.some(v => colorOf(v) === c && sizeOf(v) === size)
    ) {
      const alt =
        vs.find(v => colorOf(v) === c && v.stock > 0) ??
        vs.find(v => colorOf(v) === c);
      setSize(alt ? sizeOf(alt) : null);
    }
  };
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
  const { data: boutiques = [] } = useBoutiques();
  // One return window for every boutique, set by AllBoutiqs (24 hours).
  const windowHours = useReturnWindowHours();

  // The chosen size / colour's own price and stock, not the whole product's
  // (website 7a1decb).
  const price = product ? variantPrice(product, variant) : 0;
  const stock = product
    ? variant
      ? variant.stock
      : product.stock_quantity
    : 0;
  // "When a size sells out" (Ready to Ship): sold-out sizes made to order,
  // or left off the page - src/lib/soldOutMadeToOrder.ts (website c9475fd).
  const soldOutSetup = readSoldOutSetup(product);
  // A Made to Order listing has no stock: it's made after every order.
  const listingMadeToOrder = !!product?.made_to_order;
  // This size has none left, but the boutique makes it to order.
  const sizeMadeToOrder =
    !!product &&
    !listingMadeToOrder &&
    stock <= 0 &&
    takesSoldOutOrders(soldOutSetup);
  const soldOutTerms = sizeMadeToOrder
    ? soldOutTermsFor(soldOutSetup, price)
    : null;
  const madeToOrderExtra = soldOutTerms?.extra ?? 0;
  // "Ships in N days" = the days to the "Ships by" date the Delivery date box
  // shows (making + courier to our centre + quality check), so the page has
  // one number (website a4e8e67). Nothing until the date is known.
  const { data: shipsByDate } = useShipsBy(product?.vendor_id, product?.id, {
    enabled: listingMadeToOrder || sizeMadeToOrder,
    soldOutMadeToOrder: sizeMadeToOrder,
  });
  const shipsInDays = shipsByDate ? Math.max(daysUntil(shipsByDate), 0) : null;
  const shipsInText =
    shipsInDays != null ? `ships in ${shipsInDays} days` : null;

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

  const off = discountPercent(price, product.compare_at_price);
  // The chosen size / colour has none left (and isn't made to order).
  const soldOut = stock <= 0 && !listingMadeToOrder && !sizeMadeToOrder;
  // One piece with the made-to-order charge.
  const piecePrice = price + madeToOrderExtra;
  // A variant with its own photos (every size of a colour shares them)
  // replaces the product's photos while selected; otherwise the product's
  // own photos show (as on the website).
  const colourImages = (c: string | null) =>
    c
      ? variantImages(
          product.variants.find(
            v => colorOf(v) === c && variantImages(v).length > 0,
          ),
        )
      : [];
  const ownImages = variantImages(variant);
  const variantGallery = ownImages.length ? ownImages : colourImages(color);
  const images = variantGallery.length ? variantGallery : product.images;
  const galleryKey = images.join('|');
  const photo = photoAt.gallery === galleryKey ? photoAt.index : 0;
  // Each colour's first photo: when any colour has one, the colours show as
  // small photo boxes (a colour without a photo shows its swatch).
  const thumbnails: Record<string, string> = {};
  for (const c of colours) {
    const first = colourImages(c)[0];
    if (first) thumbnails[c] = first;
  }
  const photoBoxes = Object.keys(thumbnails).length > 0;
  const swatches = colourCodes(product.variants);
  // Nothing is unavailable on a piece made to order (a Made to Order
  // listing, or sold-out sizes made to order).
  const anyMadeToOrder = listingMadeToOrder || takesSoldOutOrders(soldOutSetup);
  const unavailableColours = new Set(
    anyMadeToOrder
      ? []
      : colours.filter(
          c => !product.variants.some(v => colorOf(v) === c && v.stock > 0),
        ),
  );
  // Customisation: the boutique's % of the chosen piece's price, on top.
  const customisationSetup = readSetup(
    product as unknown as Record<string, unknown>,
  );
  const customised = buildCustomisation(customisationSetup, customiser, price);
  const customisationExtra =
    'choice' in customised ? customisationPrice(customised.choice) : 0;
  const returnable =
    product.is_returnable !== false && vendorInfo?.returns_enabled !== false;
  const codAvailable =
    product.cod_available !== false && vendorInfo?.cod_enabled !== false;
  const photoHeight = Math.round((width * 4) / 3);
  const boutique = product.vendor_id
    ? boutiques.find(b => b.id === product.vendor_id)
    : undefined;
  // The return line follows the product's Returnable switch; Cash on
  // Delivery says whether it's available; the country of origin is the
  // product's own field (website a12bffc, client corrections 2.4).
  const returnsTitle = returnable
    ? `${returnWindowAdjective(windowHours)} returns`
    : 'Not returnable';
  const returnsText = returnable
    ? `Return within ${returnWindowSpan(windowHours)} of delivery`
    : `Damaged, defective or wrong item: report within ${returnWindowSpan(
        windowHours,
      )} of delivery`;

  // A size is out of stock when no variant with it (in the chosen colour) has any.
  // A size is greyed out only when no colour has it in stock - picking it
  // switches the colour to one that does (chooseSize).
  const sizeAvailable = (sz: string) =>
    anyMadeToOrder ||
    product.variants.some(v => sizeOf(v) === sz && v.stock > 0);
  // "Hide that size": sold-out sizes are left off (the chosen one stays,
  // shown sold out). When every size is sold out they all show, sold out.
  const sizeOptions =
    soldOutSetup.action === 'hide' && sizes.some(sizeAvailable)
      ? sizes.filter(sz => sizeAvailable(sz) || sz === size)
      : sizes;

  // The chosen piece as a bag line - or, when a size / colour is still
  // missing, the picker slides up (and remembers which button was pressed).
  const chosenItem = (forAction: 'bag' | 'buy'): CartItem | null => {
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
      setChooserFor(forAction);
      setChooser(true);
      return null;
    }
    setMissing(null);
    setChooser(false);
    if ('error' in customised) {
      toast(customised.error);
      return null;
    }
    const customisation = customised.choice;
    const options = [
      ...(size ? [{ name: 'Size', value: size }] : []),
      ...(color ? [{ name: 'Colour', value: color }] : []),
    ];
    return {
      productId: product.id,
      productName: product.name,
      // The chosen colour's own photo, when it has one.
      productImage: images[0] ?? product.images[0] ?? null,
      vendorId: product.vendor_id,
      variantId:
        variant?.id ??
        `${product.id}-${size || 'default'}-${color || 'default'}`,
      variantTitle: [size, color].filter(Boolean).join(' / ') || 'Default',
      price: {
        amount: String(
          price +
            (customisation ? customisationPrice(customisation) : 0) +
            madeToOrderExtra,
        ),
        currencyCode: 'INR',
      },
      quantity: 1,
      selectedOptions: options,
      sku: product.sku ?? null,
      // A sold-out size made to order: its extra charge and days (the
      // server checks them again when the order is placed).
      ...(soldOutTerms ? { soldOutTerms, basePrice: String(price) } : {}),
      // A customised piece is its own bag line, priced with its
      // customisation (as on the website).
      ...(customisation
        ? { lineId: newLineId(), customisation, basePrice: String(price) }
        : {}),
    };
  };

  // Help from AllBoutiqs, never the boutique directly: WhatsApp with the
  // piece's name and link already written - right below the sizes (as on
  // the website, client corrections 2.3.6).
  const stylist = (
    <Touch
      style={styles.stylist}
      accessibilityRole="link"
      onPress={() =>
        Linking.openURL(
          `${CONFIG.whatsappUrl}?text=${encodeURIComponent(
            `Hi AllBoutiqs, I'd like help with this piece: ${product.name} - ${SITE_URL}/product/${product.id}`,
          )}`,
        )
      }
    >
      <MessageCircle size={16} color={colors.foreground} strokeWidth={1.6} />
      <Text style={styles.stylistText}>Speak to a stylist</Text>
    </Touch>
  );

  // A sold-out size the boutique makes to order: the charge, the days,
  // online-only payment and the 24-hour cancel spelled out (website
  // c9475fd, a4e8e67).
  const madeToOrderNote = soldOutTerms ? (
    <View style={styles.mtoNote} accessibilityRole="summary">
      <View style={styles.mtoHead}>
        <Scissors size={16} color={colors.gold} strokeWidth={1.7} />
        <Text style={styles.mtoTitle}>
          {size ? `Size ${size} is sold out` : 'This piece is sold out'} - the
          boutique will make it for you
        </Text>
      </View>
      <Bullet>
        {madeToOrderExtra > 0 ? (
          <>
            Price: {formatINR(price)} + {formatINR(madeToOrderExtra)}{' '}
            made-to-order charge
            {soldOutTerms.pct ? ` (${soldOutTerms.pct}%)` : ''} ={' '}
            <Text style={styles.mtoStrong}>{formatINR(piecePrice)}</Text> per
            piece, GST included.
          </>
        ) : (
          `Price: ${formatINR(
            price,
          )} per piece - no extra charge for making it.`
        )}
      </Bullet>
      <Bullet>
        {shipsInText
          ? `Ships in ${shipsInDays} days, making and our quality check included.`
          : `${soldOutTerms.days} extra days to make it.`}{' '}
        The delivery date below includes this.
      </Bullet>
      <Bullet>
        Pay online - Cash on Delivery isn't available for made-to-order pieces.
      </Bullet>
      <Bullet>
        You can cancel within 24 hours of ordering.{' '}
        {returnable
          ? 'Returns as usual for this piece.'
          : "This piece isn't returnable."}
      </Bullet>
    </View>
  ) : null;

  const addToBag = () => {
    if (added) return go('/bag');
    const item = chosenItem('bag');
    if (!item) return;
    addItem(item);
    if (item.customisation) setCustomiser(emptyCustomiser);
    success();
    setAdded(true);
  };

  // Buy now: only this piece goes to checkout; the bag stays as it is.
  const buyNow = () => {
    const item = chosenItem('buy');
    if (!item) return;
    setBuyNow(item);
    tap();
    go(signedIn ? '/checkout?buyNow=1' : '/signin');
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
              // Another colour's photos start from the first one again.
              key={galleryKey}
              data={images}
              keyExtractor={(u, i) => `${i}-${u}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={e =>
                setPhotoAt({
                  gallery: galleryKey,
                  index: Math.round(e.nativeEvent.contentOffset.x / width),
                })
              }
              renderItem={({ item, index }) => (
                <Touch
                  onPress={() => setViewer(index)}
                  accessibilityLabel={`${product.name}, photo ${
                    index + 1
                  }. Tap to zoom`}
                >
                  {/* The whole photo, never cropped - its corners and edges
                      included (as on the website). */}
                  <Image
                    source={{ uri: item }}
                    style={{ width, height: photoHeight }}
                    resizeMode="contain"
                  />
                </Touch>
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
          {soldOutTerms && madeToOrderExtra > 0 ? (
            <Sans style={styles.tax}>
              + {formatINR(madeToOrderExtra)} made-to-order charge
              {soldOutTerms.pct ? ` (${soldOutTerms.pct}%)` : ''} ={' '}
              <Text style={styles.customTotal}>{formatINR(piecePrice)}</Text>
            </Sans>
          ) : null}
          {customisationExtra > 0 ? (
            <Sans style={styles.tax}>
              + {formatINR(customisationExtra)} customisation
              {customisationSetup.customisation_pct
                ? ` (${customisationSetup.customisation_pct}%)`
                : ''}{' '}
              ={' '}
              <Text style={styles.customTotal}>
                {formatINR(piecePrice + customisationExtra)}
              </Text>
            </Sans>
          ) : null}
          {/* "EMI available" under the price (website bc2026e, client
              corrections Part 2, A4.1). */}
          <Sans style={styles.tax}>Inclusive of all taxes · EMI available</Sans>
          {soldOut ? <Text style={styles.soldOut}>Out of stock</Text> : null}
          {listingMadeToOrder || sizeMadeToOrder ? (
            <Text style={styles.madeToOrder}>
              Made to order{shipsInText ? ` · ${shipsInText}` : ''}
            </Text>
          ) : null}
          {!soldOut &&
          !listingMadeToOrder &&
          !sizeMadeToOrder &&
          stock > 0 &&
          stock <= 5 ? (
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
            {photoBoxes ? (
              <ColourBoxes
                options={colours}
                selected={color}
                thumbnails={thumbnails}
                swatches={swatches}
                unavailable={unavailableColours}
                onSelect={c => {
                  chooseColor(c);
                  setMissing(null);
                  setAdded(false);
                }}
              />
            ) : (
              <View style={styles.options}>
                {colours.map(c => (
                  <Touch
                    key={c}
                    haptic
                    onPress={() => {
                      chooseColor(c);
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
            )}
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
              {sizeOptions.map(sz => {
                const ok = sizeAvailable(sz);
                return (
                  <Touch
                    key={sz}
                    haptic
                    disabled={!ok}
                    onPress={() => {
                      chooseSize(sz);
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
            {madeToOrderNote}
            {stylist}
          </View>
        ) : (
          <View style={[styles.block, styles.noTop]}>
            {madeToOrderNote}
            {stylist}
          </View>
        )}
        {missing ? <Text style={styles.missing}>{missing}</Text> : null}

        {customisationSetup.customisable ? (
          <View style={styles.block}>
            {/* No "Total N days" here: that counted only the making days, so
                it clashed with "ships in N days" (making + courier + quality
                check) - "Adds 3 extra days" stays (website a4e8e67). */}
            <Customiser
              setup={customisationSetup}
              baseDays={null}
              basePrice={price}
              value={customiser}
              onChange={setCustomiser}
            />
          </View>
        ) : null}

        {/* Delivery & services */}
        <View style={[styles.block, { gap: 14 }]}>
          <Info
            icon={<Truck size={18} color={colors.gold} strokeWidth={1.6} />}
            // The website's "Free Delivery - On all orders" (customers never
            // pay delivery; client, 10 Nov 2026).
            text={
              product.made_to_order
                ? 'Free Delivery · Made to order, then quality-checked'
                : 'Free Delivery · On all orders'
            }
          />
          <Info
            icon={<RotateCcw size={18} color={colors.gold} strokeWidth={1.6} />}
            text={returnsTitle}
            sub={returnsText}
          />
          <Info
            icon={<Banknote size={18} color={colors.gold} strokeWidth={1.6} />}
            text={
              codAvailable && !sizeMadeToOrder
                ? 'Cash on Delivery available'
                : 'Cash on Delivery'
            }
            sub={
              sizeMadeToOrder
                ? 'Not available for made-to-order sizes - pay online'
                : codAvailable
                ? '+ COD fee 3% + GST'
                : 'Not available'
            }
          />
          <Info
            icon={<Earth size={18} color={colors.gold} strokeWidth={1.6} />}
            text="Country of origin"
            sub={product.country_of_origin || 'India'}
          />
          <Info
            icon={
              <ShieldCheck size={18} color={colors.gold} strokeWidth={1.6} />
            }
            text="Quality-checked"
            sub="Checked by AllBoutiqs before it ships"
          />
        </View>

        {soldOut ? (
          <View style={styles.block}>
            <NotifyMe productId={product.id} />
          </View>
        ) : null}

        {product.vendor_id ? (
          <View style={styles.block}>
            <Eyebrow style={{ color: colors.foreground, marginBottom: 10 }}>
              Delivery date
            </Eyebrow>
            <DeliveryCheck
              vendorId={product.vendor_id}
              productId={product.id}
              soldOutMadeToOrder={sizeMadeToOrder}
            />
            <Sans style={styles.datesNote}>
              {listingMadeToOrder || sizeMadeToOrder
                ? `Made for you after you order - these dates include making it and our quality check${
                    shipsInText ? ` (${shipsInText})` : ''
                  }.`
                : 'These dates include our quality check before it ships to you.'}
            </Sans>
          </View>
        ) : null}

        {/* Details */}
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
          {/* The chosen size / colour's own stock, not the whole product's
              (website 7a1decb); made to order says when it ships. */}
          <View style={styles.spec}>
            <Text style={styles.specLabel}>Availability</Text>
            <Text style={styles.specValue}>
              {listingMadeToOrder
                ? `Made to order${shipsInText ? ` - ${shipsInText}` : ''}`
                : sizeMadeToOrder
                ? `Sold out${size ? ` in size ${size}` : ''} - made to order${
                    shipsInText ? `, ${shipsInText}` : ''
                  }`
                : stock > 0
                ? `In stock (${stock} available${
                    [size, color].some(Boolean)
                      ? ` in ${[size, color].filter(Boolean).join(' / ')}`
                      : ''
                  })`
                : 'Out of stock'}
            </Text>
          </View>
        </View>

        <View style={styles.block}>
          <Accordion title="Product information">
            <InfoRow label="Product code">
              {product.sku || product.id.slice(0, 8)}
            </InfoRow>
            <InfoRow label="MRP">
              {formatINR(product.compare_at_price ?? price)} inclusive of all
              taxes
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

        {/* The boutique: its name, address and GSTIN (as on the website) */}
        {vendorInfo ? (
          <Touch
            style={[styles.block, styles.seller]}
            onPress={() => vendorInfo.slug && go(`/store/${vendorInfo.slug}`)}
            accessibilityRole="link"
            accessibilityLabel={`Sold by ${vendorInfo.name}`}
          >
            <View style={styles.sellerLogo}>
              {boutique?.logo_url ? (
                <Image
                  source={{ uri: boutique.logo_url }}
                  style={styles.sellerLogoImage}
                  resizeMode="cover"
                />
              ) : (
                <Serif style={styles.sellerInitial}>
                  {vendorInfo.name.charAt(0).toUpperCase()}
                </Serif>
              )}
            </View>
            <View style={styles.flex1}>
              <Eyebrow style={{ color: colors.mutedForeground }}>
                Sold by
              </Eyebrow>
              <Serif style={styles.sellerName}>{vendorInfo.name}</Serif>
              {boutique?.description ? (
                <Sans style={styles.sellerSmall} numberOfLines={2}>
                  {boutique.description}
                </Sans>
              ) : null}
              {vendorAddressLine(vendorInfo) ? (
                <Sans style={[styles.sellerSmall, styles.sellerAddress]}>
                  {vendorAddressLine(vendorInfo)}
                </Sans>
              ) : null}
              {vendorInfo.gst_number ? (
                <Sans style={styles.sellerSmall}>
                  GSTIN {vendorInfo.gst_number}
                </Sans>
              ) : null}
            </View>
            <ArrowRight size={16} color={colors.foreground} />
          </Touch>
        ) : null}

        <View style={styles.block}>
          <GrievanceOfficerNote />
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

      {/* Sticky actions: wishlist, Add to bag, Buy now */}
      <View style={[styles.bar, { paddingBottom: 10 + insets.bottom }]}>
        <Touch
          haptic
          style={styles.wishBtn}
          onPress={() => toggleWish(product.id)}
          accessibilityLabel={
            wished ? 'Remove from wishlist' : 'Add to wishlist'
          }
        >
          <Heart
            size={20}
            color={wished ? colors.primary : colors.foreground}
            fill={wished ? colors.primary : 'transparent'}
          />
        </Touch>
        <Button
          label={soldOut ? 'Out of stock' : added ? 'Go to bag' : 'Add to bag'}
          disabled={soldOut}
          variant="outline"
          style={styles.flexBtn}
          icon={
            added ? (
              <ArrowRight size={16} color={colors.foreground} />
            ) : (
              <ShoppingBag
                size={16}
                color={soldOut ? colors.mutedForeground : colors.foreground}
              />
            )
          }
          onPress={addToBag}
        />
        {!soldOut ? (
          <Button label="Buy now" style={styles.flexBtn} onPress={buyNow} />
        ) : null}
      </View>
      {viewer !== null ? (
        <PhotoViewer
          images={images}
          start={viewer}
          visible
          onClose={() => setViewer(null)}
        />
      ) : null}
      <Sheet
        visible={chooser}
        title={sizes.length ? 'Select size' : 'Select colour'}
        onClose={() => setChooser(false)}
      >
        {colours.length ? (
          <>
            <Text style={styles.chooserLabel}>Colour</Text>
            {photoBoxes ? (
              <ColourBoxes
                options={colours}
                selected={color}
                thumbnails={thumbnails}
                swatches={swatches}
                unavailable={unavailableColours}
                onSelect={c => {
                  chooseColor(c);
                  setMissing(null);
                }}
              />
            ) : (
              <View style={styles.chooserRow}>
                {colours.map(c => (
                  <Chip
                    key={c}
                    label={c}
                    active={color === c}
                    onPress={() => {
                      chooseColor(c);
                      setMissing(null);
                    }}
                  />
                ))}
              </View>
            )}
          </>
        ) : null}
        {sizes.length ? (
          <>
            <View style={styles.sizeHead}>
              <Text style={styles.chooserLabel}>Size</Text>
              <SizeGuideLink
                categoryId={product.category_id}
                vendorId={product.vendor_id}
              />
            </View>
            <View style={styles.chooserRow}>
              {sizeOptions.map(sz => {
                const ok = sizeAvailable(sz);
                return (
                  <Touch
                    key={sz}
                    haptic
                    disabled={!ok}
                    onPress={() => {
                      chooseSize(sz);
                      setMissing(null);
                    }}
                    style={[
                      styles.size,
                      size === sz && styles.optionActive,
                      !ok && { opacity: 0.4 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        size === sz && { color: colors.primary },
                      ]}
                    >
                      {sz}
                    </Text>
                  </Touch>
                );
              })}
            </View>
          </>
        ) : null}
        {missing ? <Text style={styles.chooserMissing}>{missing}</Text> : null}
        <Button
          label={chooserFor === 'buy' ? 'Buy now' : 'Add to bag'}
          onPress={chooserFor === 'buy' ? buyNow : addToBag}
          style={styles.chooserButton}
        />
      </Sheet>
    </View>
  );
}

// One line of the made-to-order note, with a bullet.
function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.mtoLine}>
      <Text style={styles.mtoText}>•</Text>
      <Text style={[styles.mtoText, styles.flex1]}>{children}</Text>
    </View>
  );
}

function Info({
  icon,
  text,
  sub,
}: {
  icon: React.ReactNode;
  text: string;
  // A second, smaller line (as the website's service boxes).
  sub?: string;
}) {
  return (
    <View style={[styles.info, sub ? styles.infoTop : null]}>
      {icon}
      <View style={styles.flex1}>
        <Sans style={{ color: colors.foreground }}>{text}</Sans>
        {sub ? <Sans style={styles.infoSub}>{sub}</Sans> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  noTop: { paddingTop: 0 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoTop: { alignItems: 'flex-start' },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sellerAddress: { marginTop: 6 },
  sellerLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.goldSoft,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sellerLogoImage: { width: '100%', height: '100%' },
  sellerInitial: { fontSize: 24, color: colors.primary },
  sellerName: { fontSize: 20, lineHeight: 25, marginTop: 4 },
  sellerSmall: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  datesNote: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.mutedForeground,
    marginTop: 10,
  },
  infoSub: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.mutedForeground,
    marginTop: 1,
  },
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
  customTotal: { fontFamily: fonts.sansSemi, color: colors.foreground },
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
  mtoNote: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.goldSoft,
    backgroundColor: colors.background,
    padding: 14,
    gap: 4,
  },
  mtoHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  mtoTitle: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.foreground,
  },
  mtoLine: { flexDirection: 'row', gap: 6 },
  mtoText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: colors.mutedForeground,
  },
  mtoStrong: { fontFamily: fonts.sansSemi, color: colors.foreground },
  sizeHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chooserLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.foreground,
    marginTop: 12,
    marginBottom: 10,
  },
  chooserRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chooserMissing: {
    fontFamily: fonts.sansMedium,
    color: colors.destructive,
    marginTop: 12,
  },
  chooserButton: { marginTop: 20 },
  wishBtn: {
    width: 50,
    height: 50,
    borderWidth: 1,
    borderColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexBtn: { flex: 1, paddingHorizontal: 8 },
  stylist: {
    height: 44,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(35,31,26,0.2)',
  },
  stylistText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: colors.foreground,
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
