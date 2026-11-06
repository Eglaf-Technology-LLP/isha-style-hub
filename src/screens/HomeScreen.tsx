import { Image } from 'react-native';
import { useGo } from '@/navigation';
import {
  BadgeCheck,
  RotateCcw,
  ShieldCheck,
  Tag,
  Truck,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import heroFashion from '../../assets/hero-fashion.jpg';
import { AppHeader } from '@/components/AppHeader';
import { budgetHref, BUDGETS } from '@/lib/listing';
import { FlashSales, OfferStrip } from '@/components/HomeExtras';
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
  Boutique,
  categoryCover,
  onSale,
  useBoutiques,
  useCategories,
  useProducts,
} from '@/lib/catalog';
import { colors, fonts } from '@/theme';

// Same slides as the website (src/content/storefront.ts HERO_SLIDES).
const SLIDES = [
  {
    id: 'wedding',
    eyebrow: 'The Wedding Edit',
    title: 'Heirlooms in the making,',
    accent: 'for your big day',
    cta: 'Shop the edit',
    href: '/category/lehenga',
    image: heroFashion,
  },
  {
    id: 'boutiques',
    eyebrow: 'One address',
    title: "India's boutiques,",
    accent: 'under one roof',
    cta: 'Meet the boutiques',
    href: '/boutiques',
  },
  {
    id: 'made-to-order',
    eyebrow: 'Made for you',
    title: 'Crafted to order,',
    accent: 'finished by hand',
    cta: 'Shop made to order',
    href: '/category/all?availability=made-to-order',
  },
];

export default function Home() {
  const go = useGo();
  const { width } = useWindowDimensions();
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
  const liveBoutiques = boutiques.filter(b =>
    all.some(p => p.vendor_id === b.id),
  );
  const liveCategories = categories.filter(c =>
    all.some(p => p.category_id === c.id),
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

        {/* Category circles */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.circles}
          style={styles.circleBand}
        >
          {all.some(onSale) ? (
            <Touch
              style={styles.circleItem}
              onPress={() => go('/category/all?sale=1')}
            >
              <View
                style={[
                  styles.circle,
                  {
                    backgroundColor: colors.primary,
                    borderColor: colors.gold,
                    borderWidth: 2,
                  },
                ]}
              >
                <Tag
                  size={24}
                  color={colors.primaryForeground}
                  strokeWidth={1.6}
                />
              </View>
              <Text style={[styles.circleLabel, { color: colors.primary }]}>
                Sale
              </Text>
            </Touch>
          ) : null}
          {liveCategories.map(c => {
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

        <Hero width={width} onOpen={go} />

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

        {liveBoutiques.length > 0 ? (
          <BoutiqueRow boutiques={liveBoutiques} onOpen={go} />
        ) : null}

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

function Hero({
  width,
  onOpen,
}: {
  width: number;
  onOpen: (href: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const held = useRef(false);
  // Moves on by itself (as the website's carousel does), not while touched.
  useEffect(() => {
    const t = setInterval(() => {
      if (held.current) return;
      setIndex(i => {
        const next = (i + 1) % SLIDES.length;
        listRef.current?.scrollToOffset({
          offset: next * width,
          animated: true,
        });
        return next;
      });
    }, 4500);
    return () => clearInterval(t);
  }, [width]);
  const height = Math.round(width * 1.05);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  return (
    <View>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={s => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => {
          held.current = true;
        }}
        onMomentumScrollEnd={e => {
          held.current = false;
          onScroll(e);
        }}
        renderItem={({ item }) => (
          <Touch style={{ width, height }} onPress={() => onOpen(item.href)}>
            {item.image ? (
              <>
                <Image
                  source={item.image}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
                <View style={[StyleSheet.absoluteFill, styles.heroShade]} />
              </>
            ) : (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: colors.maroonDeep },
                ]}
              >
                <View style={styles.heroFrame} />
              </View>
            )}
            <View style={styles.heroText}>
              <Eyebrow>{item.eyebrow}</Eyebrow>
              <Serif style={styles.heroTitle}>{item.title}</Serif>
              <Text
                style={[styles.heroTitle, { fontFamily: fonts.serifItalic }]}
              >
                {item.accent}
              </Text>
              <View style={styles.heroCta}>
                <Text style={styles.heroCtaText}>{item.cta}</Text>
              </View>
            </View>
          </Touch>
        )}
      />
      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View
            key={s.id}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

function BoutiqueRow({
  boutiques,
  onOpen,
}: {
  boutiques: Boutique[];
  onOpen: (href: string) => void;
}) {
  return (
    <View style={{ paddingVertical: 20, backgroundColor: colors.ivory }}>
      <SectionHeader
        eyebrowText="The boutiques"
        title="Shop by"
        accent="boutique"
        action="View all"
        onAction={() => onOpen('/boutiques')}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 16, paddingHorizontal: 16 }}
      >
        {boutiques.slice(0, 12).map(b => (
          <Touch
            key={b.id}
            style={{ width: 76, alignItems: 'center' }}
            onPress={() => onOpen(`/store/${b.slug}`)}
          >
            <View
              style={[
                styles.circle,
                { width: 68, height: 68, borderRadius: 34 },
              ]}
            >
              {b.logo_url ? (
                <Image
                  source={{ uri: b.logo_url }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              ) : (
                <Placeholder label={b.name.charAt(0)} />
              )}
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 2,
                marginTop: 6,
              }}
            >
              <Text
                style={[styles.circleLabel, { marginTop: 0 }]}
                numberOfLines={1}
              >
                {b.name}
              </Text>
              {b.is_verified ? (
                <BadgeCheck size={11} color={colors.gold} />
              ) : null}
            </View>
          </Touch>
        ))}
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
  heroShade: { backgroundColor: 'rgba(27,22,19,0.42)' },
  heroText: { position: 'absolute', left: 20, right: 20, bottom: 36 },
  heroTitle: {
    fontFamily: fonts.serif,
    fontSize: 34,
    lineHeight: 40,
    color: colors.ivory,
  },
  heroFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 14,
    borderWidth: 1,
    borderColor: colors.goldSoft,
  },
  heroCta: {
    alignSelf: 'flex-start',
    marginTop: 18,
    backgroundColor: colors.ivory,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  heroCtaText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  dots: {
    position: 'absolute',
    bottom: 14,
    left: 20,
    flexDirection: 'row',
    gap: 6,
  },
  dot: { width: 18, height: 2, backgroundColor: 'rgba(252,251,248,0.45)' },
  dotActive: { width: 32, backgroundColor: colors.ivory },
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
