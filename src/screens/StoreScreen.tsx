import { useParams } from '@/navigation';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'react-native';
import { BadgeCheck, RotateCcw, ShieldCheck, Truck } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Listing } from '@/components/Listing';
import { Eyebrow, Placeholder, Sans, Serif } from '@/components/ui';
import { useBoutiques, useCategories, useProducts } from '@/lib/catalog';
import { formatINR } from '@/lib/format';
import { emptyFilters } from '@/lib/listing';
import {
  returnWindowAdjective,
  useReturnWindowHours,
  useShippingCharged,
} from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';

// The boutique's shipping rates - only read (and shown) while customers are
// charged shipping at all.
function useStoreShipping(vendorId: string | undefined, charged: boolean) {
  return useQuery({
    queryKey: ['store-shipping', vendorId],
    enabled: !!vendorId && charged,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('vendors')
        .select('shipping_flat_rate, free_shipping_threshold')
        .eq('id', vendorId!)
        .maybeSingle();
      return data as {
        shipping_flat_rate: number | null;
        free_shipping_threshold: number | null;
      } | null;
    },
  });
}

// A boutique's own shop: banner, logo, story, then its pieces. Only the round
// logo overlaps the banner; the code line, name and description sit below.
export default function StoreScreen() {
  const { slug } = useParams<'Store'>();
  const { data: boutiques = [], isLoading } = useBoutiques();
  const products = useProducts();
  const b = boutiques.find(x => x.slug === slug);
  const { data: categories = [] } = useCategories();
  // One return window for every boutique, set by AllBoutiqs.
  const windowHours = useReturnWindowHours();
  const { data: shippingCharged = false } = useShippingCharged();
  const { data: shipping } = useStoreShipping(b?.id, shippingCharged);
  // Only this boutique's pieces; its categories can be ticked in Filter.
  const own = (products.data ?? []).filter(p => p.vendor_id === b?.id);
  const ownCategories = categories.filter(c =>
    own.some(p => p.category_id === c.id),
  );

  // The website's store promises. No "Free shipping on every order" line and
  // no boutique return note (client corrections, 15 Nov 2026): returns are set
  // per product with the Returnable switch.
  const promises = [
    ...(shippingCharged && shipping
      ? [
          {
            icon: Truck,
            text: `Shipping ${formatINR(shipping.shipping_flat_rate)}${
              shipping.free_shipping_threshold
                ? ` · free above ${formatINR(shipping.free_shipping_threshold)}`
                : ''
            }`,
          },
        ]
      : []),
    {
      icon: RotateCcw,
      text: `${returnWindowAdjective(
        windowHours,
      )} returns on returnable pieces`,
    },
    {
      icon: ShieldCheck,
      text: 'Quality-checked by AllBoutiqs before it ships',
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <AppHeader back title={b?.name ?? ''} />
      <Listing
        key={b?.id ?? 'loading'}
        products={own}
        loading={products.isLoading || isLoading}
        initial={emptyFilters()}
        categories={ownCategories}
        onRefresh={() => void products.refetch()}
        refreshing={products.isRefetching}
        header={
          b ? (
            <View>
              <View style={styles.banner}>
                {b.banner_url ? (
                  <Image
                    source={{ uri: b.banner_url }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                ) : (
                  <Placeholder label={b.name} dark />
                )}
              </View>
              <View style={styles.intro}>
                <View style={styles.logo}>
                  {b.logo_url ? (
                    <Image
                      source={{ uri: b.logo_url }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  ) : (
                    <Serif style={{ fontSize: 26, color: colors.primary }}>
                      {b.name.charAt(0)}
                    </Serif>
                  )}
                </View>
                {b.boutique_code ? (
                  <Eyebrow style={styles.code}>
                    Boutique · {b.boutique_code}
                  </Eyebrow>
                ) : null}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: b.boutique_code ? 4 : 10,
                  }}
                >
                  <Serif style={{ fontSize: 26, flexShrink: 1 }}>
                    {b.name}
                  </Serif>
                  {b.is_verified ? (
                    <BadgeCheck size={18} color={colors.gold} />
                  ) : null}
                </View>
                {b.description ? (
                  <Sans
                    style={{
                      color: colors.mutedForeground,
                      textAlign: 'center',
                      marginTop: 8,
                      lineHeight: 21,
                    }}
                  >
                    {b.description}
                  </Sans>
                ) : null}
                <View style={styles.promises}>
                  {promises.map(({ icon: Icon, text }) => (
                    <View key={text} style={styles.promise}>
                      <Icon size={16} color={colors.gold} strokeWidth={1.7} />
                      <Text style={styles.promiseText}>{text}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { height: 150, overflow: 'hidden' },
  intro: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 6,
    marginTop: -36,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.ivory,
    backgroundColor: colors.ivory,
    alignItems: 'center',
    justifyContent: 'center',
  },
  code: { marginTop: 12 },
  promises: { alignSelf: 'center', gap: 8, marginTop: 14 },
  promise: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  promiseText: {
    flexShrink: 1,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.mutedForeground,
  },
});
