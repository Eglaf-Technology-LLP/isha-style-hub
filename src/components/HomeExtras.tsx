import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, Zap } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Boutique, Product } from '@/lib/catalog';
import { supabase } from '@/lib/supabase';
import { useGo } from '@/navigation';
import { colors, fonts } from '@/theme';
import { Eyebrow, Placeholder, Sans, SectionHeader, Serif, Touch } from './ui';

// ---------- offers strip (the website's AnnouncementBar) ----------

// The website's messages (src/content/storefront.ts announcementMessages):
// only the quality line (client corrections, 15 Nov 2026, 2.1 point 1).
const MESSAGES = ['Every piece quality-checked before it ships'];

export function OfferStrip() {
  const list = MESSAGES;
  const [i, setI] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  // Rotates when there is more than one message.
  useEffect(() => {
    if (list.length < 2) return;
    const t = setInterval(() => {
      Animated.timing(fade, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setI(n => (n + 1) % list.length);
        Animated.timing(fade, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }).start();
      });
    }, 4500);
    return () => clearInterval(t);
  }, [fade, list.length]);

  return (
    <View style={styles.strip} accessibilityRole="text">
      <Animated.Text
        style={[styles.stripText, { opacity: fade }]}
        numberOfLines={1}
      >
        {list[i]}
      </Animated.Text>
    </View>
  );
}

// ---------- boutique boards (the website's BoutiqueSpotlight) ----------

// "Meet the boutiques": every boutique with live pieces, busiest first, as a
// row of tall boards - banner (or a product photo), logo, the name big and
// the boutique code small under it. The first section under the banner.
export function BoutiqueBoards({
  boutiques,
  products,
}: {
  boutiques: Boutique[];
  products: Product[];
}) {
  const go = useGo();
  const { width } = useWindowDimensions();
  const live = useMemo(
    () =>
      boutiques
        .map(b => ({
          b,
          pieces: products.filter(p => p.vendor_id === b.id).length,
          cover:
            products.find(p => p.vendor_id === b.id && p.images[0])
              ?.images[0] ?? null,
        }))
        .filter(x => x.pieces > 0)
        .sort((x, y) => y.pieces - x.pieces),
    [boutiques, products],
  );
  if (live.length === 0) return null;
  const cardWidth = Math.round(width * 0.78);

  return (
    <View style={styles.boards}>
      <SectionHeader
        eyebrowText="Meet the boutiques"
        title="Independent labels,"
        accent="one address"
        action="All boutiques"
        onAction={() => go('/boutiques')}
      />
      <Sans style={styles.boardsIntro}>
        Every boutique on AllBoutiqs is verified - shop their full collections
        in one place.
      </Sans>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardWidth + 12}
        contentContainerStyle={styles.boardsRow}
      >
        {live.map(({ b, pieces, cover }) => (
          <BoutiqueBoard
            key={b.id}
            boutique={b}
            pieces={pieces}
            cover={b.banner_url || cover}
            width={cardWidth}
            onPress={() => go(`/store/${b.slug}`)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function BoutiqueBoard({
  boutique: b,
  pieces,
  cover,
  width,
  onPress,
}: {
  boutique: Boutique;
  pieces: number;
  cover: string | null;
  width: number;
  onPress: () => void;
}) {
  return (
    <Touch
      style={[styles.board, { width, height: Math.round(width * 1.25) }]}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={b.name}
    >
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <Placeholder label={b.name} dark style={StyleSheet.absoluteFill} />
      )}
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`board-${b.id}`} x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={colors.ink} stopOpacity={0.8} />
            <Stop offset="0.5" stopColor={colors.ink} stopOpacity={0.1} />
            <Stop offset="1" stopColor={colors.ink} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#board-${b.id})`} />
      </Svg>
      <View style={styles.boardText}>
        <View style={styles.boardLogo}>
          {b.logo_url ? (
            <Image
              source={{ uri: b.logo_url }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <Serif style={styles.boardInitial}>
              {b.name.charAt(0).toUpperCase()}
            </Serif>
          )}
        </View>
        {/* Name in big text, the boutique code small just below it. */}
        <View style={styles.boardNameRow}>
          <Serif style={styles.boardName} numberOfLines={2}>
            {b.name}
          </Serif>
          {b.is_verified ? (
            <BadgeCheck
              size={20}
              color={colors.gold}
              accessibilityLabel="Verified boutique"
            />
          ) : null}
        </View>
        {b.boutique_code ? (
          <Text style={styles.boardCode}>{b.boutique_code}</Text>
        ) : null}
        <View style={styles.boardFoot}>
          <Text style={styles.boardMeta}>
            {pieces} {pieces === 1 ? 'piece' : 'pieces'}
            {b.is_founding ? ' · Founding boutique' : ''}
          </Text>
          <View style={styles.boardExplore}>
            <Text style={[styles.boardMeta, styles.boardExploreText]}>
              Explore
            </Text>
            <ArrowRight size={14} color={colors.ivory} />
          </View>
        </View>
      </View>
    </Touch>
  );
}

// ---------- flash sales (the website's ActiveFlashSales / FlashSaleBanner) ----------

interface FlashSale {
  id: string;
  name: string;
  description: string | null;
  discount_percentage: number;
  starts_at: string;
  ends_at: string;
}

function useActiveFlashSales() {
  return useQuery({
    queryKey: ['flash-sales'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FlashSale[]> => {
      const { data } = await supabase
        .from('flash_sales')
        .select('*')
        .order('starts_at', { ascending: false });
      const now = Date.now();
      return ((data ?? []) as (FlashSale & { is_active: boolean })[]).filter(
        s =>
          s.is_active &&
          Date.parse(s.starts_at) <= now &&
          Date.parse(s.ends_at) > now,
      );
    },
  });
}

// Up to two live sales, each with its own countdown; nothing when none run.
export function FlashSales() {
  const { data = [] } = useActiveFlashSales();
  if (!data.length) return null;
  return (
    <View style={styles.sales}>
      {data.slice(0, 2).map(s => (
        <FlashSaleBanner key={s.id} sale={s} />
      ))}
    </View>
  );
}

function FlashSaleBanner({ sale }: { sale: FlashSale }) {
  const [left, setLeft] = useState(Date.parse(sale.ends_at) - Date.now());
  useEffect(() => {
    const t = setInterval(
      () => setLeft(Date.parse(sale.ends_at) - Date.now()),
      1000,
    );
    return () => clearInterval(t);
  }, [sale.ends_at]);
  if (left <= 0) return null;
  const secs = Math.floor(left / 1000);
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const sec = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={styles.sale}>
      <View style={styles.saleHead}>
        <View style={styles.saleTitleRow}>
          <Zap size={16} color={colors.gold} fill={colors.gold} />
          <Eyebrow style={styles.saleEyebrow}>Flash sale</Eyebrow>
        </View>
        <Text style={styles.saleOff}>{sale.discount_percentage}% OFF</Text>
      </View>
      <Text style={styles.saleName}>{sale.name}</Text>
      {sale.description ? (
        <Sans style={styles.saleDesc}>{sale.description}</Sans>
      ) : null}
      <View style={styles.timer}>
        <Text style={styles.endsIn}>Ends in</Text>
        {d > 0 ? <TimeBox value={String(d)} unit="d" /> : null}
        <TimeBox value={pad(h)} unit="h" />
        <TimeBox value={pad(m)} unit="m" />
        <TimeBox value={pad(sec)} unit="s" />
      </View>
    </View>
  );
}

function TimeBox({ value, unit }: { value: string; unit: string }) {
  return (
    <View style={styles.timeBox}>
      <Text style={styles.timeValue}>{value}</Text>
      <Text style={styles.timeUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  boards: { paddingTop: 28, paddingBottom: 8 },
  boardsIntro: {
    color: colors.mutedForeground,
    lineHeight: 21,
    paddingHorizontal: 16,
    marginTop: -6,
    marginBottom: 16,
  },
  boardsRow: { gap: 12, paddingHorizontal: 16 },
  board: { overflow: 'hidden', backgroundColor: colors.maroonDeep },
  boardText: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
  },
  boardLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(252,251,248,0.4)',
    backgroundColor: colors.ivory,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  boardInitial: { fontSize: 24, color: colors.primary },
  boardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  boardName: {
    flexShrink: 1,
    fontSize: 30,
    lineHeight: 36,
    color: colors.ivory,
  },
  boardCode: {
    fontFamily: fonts.sans,
    fontSize: 12,
    letterSpacing: 2.2,
    color: 'rgba(252,251,248,0.8)',
    marginTop: 4,
  },
  boardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  boardMeta: {
    flexShrink: 1,
    fontFamily: fonts.sans,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(252,251,248,0.75)',
  },
  boardExplore: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  boardExploreText: { color: colors.ivory },
  strip: {
    backgroundColor: colors.maroonDeep,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  stripText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ivory,
  },
  sales: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  sale: {
    backgroundColor: colors.maroonDeep,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.goldSoft,
  },
  saleHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  saleEyebrow: { color: colors.gold },
  saleOff: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.gold },
  saleName: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ivory,
    marginTop: 8,
  },
  saleDesc: { color: 'rgba(252,251,248,0.75)', marginTop: 4, fontSize: 13 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  endsIn: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: 'rgba(252,251,248,0.75)',
    marginRight: 4,
  },
  timeBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.ivory,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  timeValue: {
    fontFamily: fonts.sansSemi,
    fontSize: 14,
    color: colors.maroonDeep,
  },
  timeUnit: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.mutedForeground,
    marginLeft: 1,
  },
});
