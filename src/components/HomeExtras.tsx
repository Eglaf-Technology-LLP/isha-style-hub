import { useQuery } from '@tanstack/react-query';
import { Zap } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';
import { Eyebrow, Sans } from './ui';

// ---------- offers strip (the website's AnnouncementBar) ----------

function useShippingCharged() {
  return useQuery({
    queryKey: ['shipping-charged'],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('customer_shipping_enabled')
        .maybeSingle();
      return data?.customer_shipping_enabled === true;
    },
  });
}

// The website's messages (src/content/storefront.ts announcementMessages).
const messages = (shippingCharged: boolean) => [
  shippingCharged
    ? 'Free shipping on orders above ₹999'
    : 'Free shipping on every order',
  'Every piece quality-checked before it ships',
  'Use code ALLBOUTIQS10 for 10% off your first order',
];

export function OfferStrip() {
  const { data: charged = false } = useShippingCharged();
  const list = messages(charged);
  const [i, setI] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
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
