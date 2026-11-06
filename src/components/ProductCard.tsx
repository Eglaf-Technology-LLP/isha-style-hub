import { Image } from 'react-native';
import { useGo } from '@/navigation';
import { Heart, Star } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { inStock, isNewArrival, Product, useRatings } from '@/lib/catalog';
import { discountPercent, formatINR } from '@/lib/format';
import { useWishlist } from '@/lib/stores';
import { colors, fonts } from '@/theme';
import { Placeholder, Touch } from './ui';

// The product tile: 3:4 photo, NEW / SOLD OUT tag, wishlist heart, boutique
// in small capitals, name, price with MRP struck through and % off.
export const ProductCard = memo(function ProductCard({
  product,
  width,
}: {
  product: Product;
  width: number;
}) {
  const go = useGo();
  const wished = useWishlist(st => st.ids.includes(product.id));
  const toggle = useWishlist(st => st.toggle);
  const off = discountPercent(product.price, product.compare_at_price);
  const soldOut = !product.made_to_order && !inStock(product);
  const rating = useRatings().data?.get(product.id);

  return (
    <Touch
      style={{ width }}
      onPress={() => go(`/product/${product.id}`)}
      accessibilityLabel={`${product.name}, ${formatINR(product.price)}`}
    >
      <View style={[styles.photo, { width, height: (width * 4) / 3 }]}>
        {product.images[0] ? (
          <Image
            source={{ uri: product.images[0] }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <Placeholder label={product.name.charAt(0)} />
        )}
        {soldOut ? (
          <Text style={[styles.tag, { color: colors.mutedForeground }]}>
            Sold out
          </Text>
        ) : isNewArrival(product) ? (
          <Text style={styles.tag}>New</Text>
        ) : null}
        {rating ? (
          <View style={styles.rating}>
            <Text style={styles.ratingText}>{rating.avg.toFixed(1)}</Text>
            <Star size={10} color={colors.gold} fill={colors.gold} />
            <Text style={styles.ratingCount}>| {rating.count}</Text>
          </View>
        ) : null}
        <Touch
          haptic
          hitSlop={8}
          onPress={() => toggle(product.id)}
          style={styles.heart}
          accessibilityLabel={
            wished ? 'Remove from wishlist' : 'Add to wishlist'
          }
        >
          <Heart
            size={17}
            color={wished ? colors.primary : colors.foreground}
            fill={wished ? colors.primary : 'transparent'}
            strokeWidth={1.7}
          />
        </Touch>
      </View>
      <View style={styles.info}>
        {product.vendor?.name ? (
          <Text style={styles.brand} numberOfLines={1}>
            {product.vendor.name}
          </Text>
        ) : null}
        <Text style={styles.name} numberOfLines={1}>
          {product.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatINR(product.price)}</Text>
          {off ? (
            <>
              <Text style={styles.mrp}>
                {formatINR(product.compare_at_price)}
              </Text>
              <Text style={styles.off}>{off}% off</Text>
            </>
          ) : null}
        </View>
      </View>
    </Touch>
  );
});

const styles = StyleSheet.create({
  rating: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(252,251,248,0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ratingText: {
    fontFamily: fonts.sansSemi,
    fontSize: 11,
    color: colors.foreground,
  },
  ratingCount: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.mutedForeground,
  },
  photo: { backgroundColor: colors.ivory, overflow: 'hidden' },
  tag: {
    position: 'absolute',
    top: 8,
    left: 0,
    backgroundColor: colors.ivory,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  heart: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(252,251,248,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { paddingTop: 8, paddingHorizontal: 2, paddingBottom: 4 },
  brand: {
    fontFamily: fonts.sansSemi,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.foreground,
  },
  name: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  price: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.foreground },
  mrp: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.mutedForeground,
    textDecorationLine: 'line-through',
  },
  off: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.gold },
});
