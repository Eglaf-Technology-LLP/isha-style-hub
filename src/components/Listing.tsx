import { Check, SlidersHorizontal, X } from 'lucide-react-native';
import { ReactElement, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Category,
  filterProducts,
  ListingFilter,
  Product,
  SortKey,
} from '@/lib/catalog';
import { colors, fonts } from '@/theme';
import { ProductGrid } from './ProductLists';
import { Button, Serif, Touch } from './ui';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'featured', label: 'Featured' },
  { key: 'newest', label: 'Newest first' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
];
const PRICES = [999, 1999, 4999, 9999];

// A product listing with category chips and the Myntra-style sticky
// Sort | Filter bar - used by category pages and boutique pages.
export function Listing({
  products,
  loading,
  initial,
  initialSort = 'featured',
  categories,
  activeCategoryId,
  onCategory,
  header,
  onRefresh,
  refreshing,
}: {
  products: Product[];
  loading: boolean;
  initial: ListingFilter;
  initialSort?: SortKey;
  categories?: Category[];
  activeCategoryId?: string | null;
  onCategory?: (c: Category | null) => void;
  header?: ReactElement;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [filter, setFilter] = useState<ListingFilter>(initial);
  const [sheet, setSheet] = useState<'sort' | 'filter' | null>(null);
  const shown = useMemo(
    () => filterProducts(products, filter, sort),
    [products, filter, sort],
  );
  const active =
    (filter.sale ? 1 : 0) +
    (filter.max ? 1 : 0) +
    (filter.availability ? 1 : 0);

  return (
    <View style={{ flex: 1 }}>
      <ProductGrid
        products={shown}
        loading={loading}
        onRefresh={onRefresh}
        refreshing={refreshing}
        bottomInset={56 + insets.bottom}
        header={
          <View>
            {header}
            {categories && categories.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                <Chip
                  label="All"
                  active={!activeCategoryId}
                  onPress={() => onCategory?.(null)}
                />
                {categories.map(c => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    active={activeCategoryId === c.id}
                    onPress={() => onCategory?.(c)}
                  />
                ))}
              </ScrollView>
            ) : null}
            <Text style={styles.count}>
              {shown.length} {shown.length === 1 ? 'piece' : 'pieces'}
            </Text>
          </View>
        }
      />

      <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
        <Touch style={styles.barButton} onPress={() => setSheet('sort')}>
          <Text style={styles.barText}>Sort</Text>
        </Touch>
        <View style={styles.barDivider} />
        <Touch style={styles.barButton} onPress={() => setSheet('filter')}>
          <SlidersHorizontal
            size={16}
            color={colors.foreground}
            strokeWidth={1.6}
          />
          <Text style={styles.barText}>
            Filter
            {active ? (
              <Text style={{ color: colors.primary }}> ({active})</Text>
            ) : null}
          </Text>
        </Touch>
      </View>

      <Sheet
        visible={sheet === 'sort'}
        title="Sort by"
        onClose={() => setSheet(null)}
      >
        {SORTS.map(o => (
          <Touch
            key={o.key}
            style={styles.option}
            onPress={() => {
              setSort(o.key);
              setSheet(null);
            }}
          >
            <Text
              style={[
                styles.optionText,
                sort === o.key && {
                  color: colors.primary,
                  fontFamily: fonts.sansMedium,
                },
              ]}
            >
              {o.label}
            </Text>
            {sort === o.key ? <Check size={18} color={colors.primary} /> : null}
          </Touch>
        ))}
      </Sheet>

      <Sheet
        visible={sheet === 'filter'}
        title="Filters"
        onClose={() => setSheet(null)}
      >
        <Text style={styles.group}>Price</Text>
        <View style={styles.wrap}>
          {PRICES.map(p => (
            <Chip
              key={p}
              label={`Under ₹${p.toLocaleString('en-IN')}`}
              active={filter.max === p}
              onPress={() =>
                setFilter(f => ({ ...f, max: f.max === p ? null : p }))
              }
            />
          ))}
        </View>
        <Text style={styles.group}>Availability</Text>
        <View style={styles.wrap}>
          <Chip
            label="Ready to ship"
            active={filter.availability === 'ready'}
            onPress={() =>
              setFilter(f => ({
                ...f,
                availability: f.availability === 'ready' ? null : 'ready',
              }))
            }
          />
          <Chip
            label="Made to order"
            active={filter.availability === 'made-to-order'}
            onPress={() =>
              setFilter(f => ({
                ...f,
                availability:
                  f.availability === 'made-to-order' ? null : 'made-to-order',
              }))
            }
          />
        </View>
        <Text style={styles.group}>Offers</Text>
        <View style={styles.wrap}>
          <Chip
            label="On sale"
            active={!!filter.sale}
            onPress={() => setFilter(f => ({ ...f, sale: !f.sale }))}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
          <Button
            label="Clear all"
            variant="outline"
            style={{ flex: 1 }}
            onPress={() =>
              setFilter(f => ({
                ...f,
                sale: false,
                max: null,
                availability: null,
              }))
            }
          />
          <Button
            label={`Show ${shown.length}`}
            style={{ flex: 1 }}
            onPress={() => setSheet(null)}
          />
        </View>
      </Sheet>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Touch
      onPress={onPress}
      style={[
        styles.chip,
        active && {
          backgroundColor: colors.primary,
          borderColor: colors.primary,
        },
      ]}
      accessibilityState={{ selected: !!active }}
    >
      <Text
        style={[styles.chipText, active && { color: colors.primaryForeground }]}
      >
        {label}
      </Text>
    </Touch>
  );
}

// A bottom sheet (RN Modal) in the storefront style.
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityLabel="Close"
      />
      <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
        <View style={styles.sheetHead}>
          <Serif style={{ fontSize: 22 }}>{title}</Serif>
          <Touch hitSlop={10} onPress={onClose} accessibilityLabel="Close">
            <X size={22} color={colors.foreground} />
          </Touch>
        </View>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.foreground,
  },
  count: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.mutedForeground,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: colors.ivory,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  barButton: {
    flex: 1,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  barDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  barText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.foreground,
  },
  scrim: { flex: 1, backgroundColor: 'rgba(27,22,19,0.45)' },
  sheet: {
    backgroundColor: colors.ivory,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  option: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.foreground,
  },
  group: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.gold,
    marginTop: 18,
    marginBottom: 10,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
