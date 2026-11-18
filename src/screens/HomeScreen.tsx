import { Image } from 'react-native';
import { useGo } from '@/navigation';
import { RotateCcw, ShieldCheck, Truck } from 'lucide-react-native';
import { useMemo } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { HeroBanner } from '@/components/HeroBanner';
import { budgetHref, BUDGETS } from '@/lib/listing';
import {
  BoutiqueBoards,
  FlashSales,
  OfferStrip,
} from '@/components/HomeExtras';
import { ProductRail } from '@/components/ProductLists';
import {
  Eyebrow,
  Placeholder,
  Sans,
  Serif,
  SectionHeader,
  Touch,
} from '@/components/ui';
import {
  categoryCover,
  onSale,
  useBoutiques,
  useCategories,
  useProducts,
} from '@/lib/catalog';
import { colors, fonts } from '@/theme';

export default function Home() {
  const go = useGo();
  const products = useProducts();
  const { data: categories = [] } = useCategories();
  const { data: boutiques = [] } = useBoutiques();
  const all = useMemo(() => products.data ?? [], [products.data]);

  const newest = all.slice(0, 12);
  // A fresh mix each time the catalogue loads, not on every render.
  const handpicked = useMemo(() => {
    const pool = all.length > 18 ? all.slice(12) : all;
    return [...pool].sort(() => Math.random() - 0.5).slice(0, 12);
  }, [all]);
  const sale = all.filter(onSale).slice(0, 12);
  // The categories the admin picked for the home page (Admin > Categories),
  // as the website's "Shop by category" tiles - here only those with pieces.
  const homeCategories = categories.filter(
    c => c.show_on_home !== false && all.some(p => p.category_id === c.id),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader searchBar />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={products.isRefetching}
            onRefresh={() => void products.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <OfferStrip />

        {/* Category circles. No "Sale" circle: the website took its "New In"
            and "Sale" menu links away (44e7959); the sale rail stays. */}
        {homeCategories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.circles}
            style={styles.circleBand}
          >
            {homeCategories.map(c => {
              const src = c.image_url || categoryCover(c.id, all);
              return (
                <Touch
                  key={c.id}
                  style={styles.circleItem}
                  onPress={() => go(`/category/${c.slug}`)}
                >
                  <View style={styles.circle}>
                    {src ? (
                      <Image
                        source={{ uri: src }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                    ) : (
                      <Placeholder label={c.name.charAt(0)} />
                    )}
                  </View>
                  <Text style={styles.circleLabel} numberOfLines={1}>
                    {c.name}
                  </Text>
                </Touch>
              );
            })}
          </ScrollView>
        ) : null}

        <HeroBanner />

        {/* The boutique boards are the first section under the banner
            (website, client corrections 15 Nov 2026, 2.1.3). */}
        <BoutiqueBoards boutiques={boutiques} products={all} />

        <FlashSales />

        {/* Promise strip */}
        <View style={styles.promises}>
          {[
            { icon: Truck, text: 'Free shipping' },
            { icon: ShieldCheck, text: 'Quality checked' },
            { icon: RotateCcw, text: 'Easy returns' },
          ].map(({ icon: Icon, text }) => (
            <View key={text} style={styles.promise}>
              <Icon size={18} color={colors.gold} strokeWidth={1.6} />
              <Text style={styles.promiseText}>{text}</Text>
            </View>
          ))}
        </View>

        <ProductRail
          eyebrowText="Just landed"
          title="New"
          accent="arrivals"
          products={newest}
          loading={products.isLoading}
          action="View all"
          onAction={() => go('/category/all?sort=newest')}
        />

        {/* Budget tiles */}
        <View style={{ paddingVertical: 10 }}>
          <SectionHeader
            eyebrowText="Shop by budget"
            title="Great finds,"
            accent="every budget"
          />
          <View style={styles.budgets}>
            {BUDGETS.map(b => (
              <Touch
                key={b.label}
                style={styles.budget}
                onPress={() => go(budgetHref(b))}
              >
                <Eyebrow style={{ color: colors.gold, fontSize: 10 }}>
                  {b.note}
                </Eyebrow>
                <Serif
                  style={{ color: colors.ivory, fontSize: 19, marginTop: 6 }}
                >
                  {b.label}
                </Serif>
              </Touch>
            ))}
          </View>
        </View>

        <ProductRail
          eyebrowText="Curated for you"
          title="Handpicked"
          accent="pieces"
          products={handpicked}
          loading={products.isLoading}
          action="Shop all"
          onAction={() => go('/category/all')}
        />

        {sale.length >= 4 ? (
          <ProductRail
            eyebrowText="Limited time"
            title="On"
            accent="sale"
            products={sale}
            action="Shop the sale"
            onAction={() => go('/category/all?sale=1')}
          />
        ) : null}

        {products.isError ? (
          <Sans style={styles.error}>
            Couldn't load the shop. Pull down to try again.
          </Sans>
        ) : null}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  circleBand: {
    backgroundColor: colors.ivory,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  circles: { gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  circleItem: { width: 66, alignItems: 'center' },
  circle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ivory,
  },
  circleLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
    marginTop: 6,
    color: colors.foreground,
    maxWidth: 70,
  },
  promises: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 14,
    backgroundColor: colors.ivory,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  promise: { alignItems: 'center', gap: 4 },
  promiseText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.mutedForeground,
  },
  // The website's four budget buckets, two per row.
  budgets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
  },
  budget: {
    width: '48%',
    flexGrow: 1,
    height: 92,
    paddingHorizontal: 8,
    backgroundColor: colors.maroonDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { textAlign: 'center', color: colors.destructive, padding: 16 },
});
