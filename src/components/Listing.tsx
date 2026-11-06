import { Check, SlidersHorizontal, X } from 'lucide-react-native';
import { ReactElement, ReactNode, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Boutique, Category, Product } from '@/lib/catalog';
import {
  BUDGETS,
  emptyFilters,
  ListingFilters,
  runListing,
  SORT_LABELS,
  SortKey,
  sortSizes,
} from '@/lib/listing';
import { colors, fonts } from '@/theme';
import { ProductGrid } from './ProductLists';
import { Button, Serif, Touch } from './ui';

// A product listing with category chips and the sticky Sort | Filter bar.
// Filters, counts and sorting are the website's (src/lib/listing.ts).
export function Listing({
  products,
  loading,
  initial,
  scopeCategoryId = null,
  categories,
  boutiques,
  onCategory,
  header,
  onRefresh,
  refreshing,
}: {
  products: Product[];
  loading: boolean;
  initial: ListingFilters;
  scopeCategoryId?: string | null;
  // Chips across the top (category pages) - tapping one opens that category.
  categories?: Category[];
  // Boutiques offered in the Boutique filter (left out on a boutique's own page).
  boutiques?: Boutique[];
  onCategory?: (c: Category | null) => void;
  header?: ReactElement;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [f, setF] = useState<ListingFilters>(initial);
  const [sheet, setSheet] = useState<'sort' | 'filter' | null>(null);
  const { results, facets, activeCount } = useMemo(
    () => runListing(products, f, scopeCategoryId),
    [products, f, scopeCategoryId],
  );
  const set = (next: Partial<ListingFilters>) =>
    setF(cur => ({ ...cur, ...next }));
  const toggle = (
    key: 'categories' | 'boutiques' | 'sizes' | 'colors',
    value: string,
  ) =>
    setF(cur => ({
      ...cur,
      [key]: cur[key].includes(value)
        ? cur[key].filter(v => v !== value)
        : [...cur[key], value],
    }));

  const sizeList = sortSizes([...facets.sizes.keys()]);
  const colorList = [...facets.colors.keys()].sort((a, b) =>
    a.localeCompare(b),
  );
  const boutiqueList = (boutiques ?? []).filter(
    b => facets.boutiques.has(b.id) || f.boutiques.includes(b.id),
  );
  const categoryList = (categories ?? []).filter(
    c =>
      c.id !== scopeCategoryId &&
      (facets.categories.has(c.id) || f.categories.includes(c.id)),
  );

  return (
    <View style={styles.flex}>
      <ProductGrid
        products={results}
        loading={loading}
        onRefresh={onRefresh}
        refreshing={refreshing}
        bottomInset={56 + insets.bottom}
        header={
          <View>
            {header}
            {categories && categories.length > 0 && onCategory ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                <Chip
                  label="All"
                  active={!scopeCategoryId}
                  onPress={() => onCategory(null)}
                />
                {categories.map(c => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    active={scopeCategoryId === c.id}
                    onPress={() => onCategory(c)}
                  />
                ))}
              </ScrollView>
            ) : null}
            <Text style={styles.count}>
              {results.length} {results.length === 1 ? 'piece' : 'pieces'}
              {f.search ? ` for "${f.search}"` : ''}
            </Text>
          </View>
        }
      />

      <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
        <Touch style={styles.barButton} onPress={() => setSheet('sort')}>
          <Text style={styles.barText}>Sort</Text>
          {f.sort !== 'featured' ? <View style={styles.dot} /> : null}
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
            {activeCount ? (
              <Text style={styles.primary}> ({activeCount})</Text>
            ) : null}
          </Text>
        </Touch>
      </View>

      <Sheet
        visible={sheet === 'sort'}
        title="Sort by"
        onClose={() => setSheet(null)}
      >
        {(Object.keys(SORT_LABELS) as SortKey[]).map(key => (
          <Touch
            key={key}
            style={styles.option}
            onPress={() => {
              set({ sort: key });
              setSheet(null);
            }}
          >
            <Text
              style={[styles.optionText, f.sort === key && styles.optionOn]}
            >
              {SORT_LABELS[key]}
            </Text>
            {f.sort === key ? <Check size={18} color={colors.primary} /> : null}
          </Touch>
        ))}
      </Sheet>

      <Sheet
        visible={sheet === 'filter'}
        title="Filters"
        onClose={() => setSheet(null)}
        scroll
        footer={
          <View style={styles.footer}>
            <Button
              label="Clear all"
              variant="outline"
              style={styles.flex}
              onPress={() =>
                setF(emptyFilters({ search: f.search, sort: f.sort }))
              }
            />
            <Button
              label={`Show ${results.length}`}
              style={styles.flex}
              onPress={() => setSheet(null)}
            />
          </View>
        }
      >
        {categoryList.length ? (
          <Group title={scopeCategoryId ? 'Add categories' : 'Category'}>
            {categoryList.map(c => (
              <CheckRow
                key={c.id}
                label={c.name}
                count={facets.categories.get(c.id) ?? 0}
                checked={f.categories.includes(c.id)}
                onPress={() => toggle('categories', c.id)}
              />
            ))}
          </Group>
        ) : null}
        {boutiqueList.length ? (
          <Group title="Boutique">
            {boutiqueList.map(b => (
              <CheckRow
                key={b.id}
                label={b.name}
                count={facets.boutiques.get(b.id) ?? 0}
                checked={f.boutiques.includes(b.id)}
                onPress={() => toggle('boutiques', b.id)}
              />
            ))}
          </Group>
        ) : null}
        <Group title="Price">
          <View style={styles.wrap}>
            {BUDGETS.map(b => {
              const on =
                (f.min ?? null) === (b.min ?? null) &&
                (f.max ?? null) === (b.max ?? null);
              return (
                <Chip
                  key={b.label}
                  label={b.label}
                  active={on}
                  onPress={() =>
                    set(
                      on
                        ? { min: null, max: null }
                        : { min: b.min ?? null, max: b.max ?? null },
                    )
                  }
                />
              );
            })}
          </View>
        </Group>
        {sizeList.length ? (
          <Group title="Size">
            <View style={styles.wrap}>
              {sizeList.map(s => (
                <Chip
                  key={s}
                  label={s}
                  active={f.sizes.includes(s)}
                  onPress={() => toggle('sizes', s)}
                />
              ))}
            </View>
          </Group>
        ) : null}
        {colorList.length ? (
          <Group title="Colour">
            {colorList.map(c => (
              <CheckRow
                key={c}
                label={c}
                count={facets.colors.get(c) ?? 0}
                checked={f.colors.includes(c)}
                onPress={() => toggle('colors', c)}
              />
            ))}
          </Group>
        ) : null}
        <Group title="Availability">
          <CheckRow
            label="Ready to ship"
            count={facets.ready}
            checked={f.availability === 'ready'}
            onPress={() =>
              set({
                availability: f.availability === 'ready' ? 'all' : 'ready',
              })
            }
          />
          <CheckRow
            label="Made to order"
            count={facets.madeToOrder}
            checked={f.availability === 'made-to-order'}
            onPress={() =>
              set({
                availability:
                  f.availability === 'made-to-order' ? 'all' : 'made-to-order',
              })
            }
          />
          <CheckRow
            label="In stock only"
            count={facets.inStock}
            checked={f.inStock}
            onPress={() => set({ inStock: !f.inStock })}
          />
        </Group>
        <Group title="Offers">
          <CheckRow
            label="On sale"
            count={facets.sale}
            checked={f.sale}
            onPress={() => set({ sale: !f.sale })}
          />
        </Group>
      </Sheet>
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Text style={styles.group}>{title}</Text>
      {children}
    </View>
  );
}

function CheckRow({
  label,
  count,
  checked,
  onPress,
}: {
  label: string;
  count: number;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Touch
      onPress={onPress}
      style={styles.checkRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? (
          <Check size={13} color={colors.primaryForeground} strokeWidth={3} />
        ) : null}
      </View>
      <Text style={[styles.checkLabel, checked && styles.primary]}>
        {label}
      </Text>
      <Text style={styles.checkCount}>{count}</Text>
    </Touch>
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
      style={[styles.chip, active && styles.chipOn]}
      accessibilityState={{ selected: !!active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]}>
        {label}
      </Text>
    </Touch>
  );
}

// A bottom sheet (RN Modal) in the storefront style. `scroll` for long
// content; `footer` stays pinned under it.
export function Sheet({
  visible,
  title,
  onClose,
  children,
  scroll,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
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
      <View
        style={[
          styles.sheet,
          { paddingBottom: 20 + insets.bottom, maxHeight: height * 0.88 },
        ]}
      >
        <View style={styles.sheetHead}>
          <Serif style={styles.sheetTitle}>{title}</Serif>
          <Touch hitSlop={10} onPress={onClose} accessibilityLabel="Close">
            <X size={22} color={colors.foreground} />
          </Touch>
        </View>
        {scroll ? (
          <ScrollView
            style={styles.flexShrink}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          children
        )}
        {footer}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  primary: { color: colors.primary },
  chips: { gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.foreground,
  },
  chipTextOn: { color: colors.primaryForeground },
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
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
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
  sheetTitle: { fontSize: 22 },
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
  optionOn: { color: colors.primary, fontFamily: fonts.sansMedium },
  group: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.gold,
    marginTop: 18,
    marginBottom: 8,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
  },
  box: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkLabel: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.foreground,
  },
  checkCount: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.mutedForeground,
  },
  footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
