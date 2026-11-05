import { Image } from 'react-native';
import { useGo } from '@/navigation';
import {
  ChevronRight,
  Package,
  Sparkles,
  Tag,
  Truck,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Eyebrow, Placeholder, Serif, Touch } from '@/components/ui';
import { categoryCover, useCategories, useProducts } from '@/lib/catalog';
import { colors, fonts } from '@/theme';

const QUICK = [
  { href: '/category/all?sort=newest', label: 'New in', icon: Sparkles },
  { href: '/category/all?sale=1', label: 'Sale', icon: Tag },
  { href: '/category/all?max=1999', label: 'Under ₹1,999', icon: Package },
  {
    href: '/category/all?availability=ready',
    label: 'Ready to ship',
    icon: Truck,
  },
];

// Every category as a banner row - the Myntra/Ajio category screen in the
// AllBoutiqs maroon, ivory and gold.
export default function Categories() {
  const go = useGo();
  const { data: categories = [], isLoading } = useCategories();
  const { data: products = [] } = useProducts();
  const count = (id: string) =>
    products.filter(p => p.category_id === id).length;

  return (
    <View style={{ flex: 1 }}>
      <AppHeader searchBar />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View style={styles.quick}>
          {QUICK.map(({ href, label, icon: Icon }) => (
            <Touch key={href} style={styles.quickItem} onPress={() => go(href)}>
              <Icon size={20} color={colors.primary} strokeWidth={1.6} />
              <Text style={styles.quickText}>{label}</Text>
            </Touch>
          ))}
        </View>

        <Eyebrow style={{ marginTop: 28, marginBottom: 12 }}>
          Shop by category
        </Eyebrow>
        {isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        <View style={{ gap: 12 }}>
          {categories.map(c => {
            const src = c.image_url || categoryCover(c.id, products);
            const n = count(c.id);
            return (
              <Touch
                key={c.id}
                style={styles.row}
                onPress={() => go(`/category/${c.slug}`)}
              >
                <View style={styles.rowText}>
                  <Serif style={{ fontSize: 24 }}>{c.name}</Serif>
                  <Text style={styles.count}>
                    {n} {n === 1 ? 'piece' : 'pieces'}
                  </Text>
                </View>
                <View style={styles.rowImage}>
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
              </Touch>
            );
          })}
          <Touch style={styles.all} onPress={() => go('/category/all')}>
            <Serif style={{ color: colors.ivory, fontSize: 20 }}>
              Shop everything
            </Serif>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text
                style={[styles.count, { color: colors.gold, marginTop: 0 }]}
              >
                {products.length} pieces
              </Text>
              <ChevronRight size={16} color={colors.gold} />
            </View>
          </Touch>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', gap: 8 },
  quickItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderWidth: 1,
    borderColor: colors.goldSoft,
    backgroundColor: colors.ivory,
  },
  quickText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    textAlign: 'center',
    color: colors.foreground,
  },
  row: {
    height: 112,
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
    overflow: 'hidden',
  },
  rowText: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  rowImage: { width: '42%' },
  count: {
    fontFamily: fonts.sans,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.mutedForeground,
    marginTop: 6,
  },
  all: {
    height: 64,
    paddingHorizontal: 20,
    backgroundColor: colors.maroonDeep,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
