import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react-native';
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
import { tap } from '@/lib/haptics';
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

type Facet =
  | 'category'
  | 'boutique'
  | 'price'
  | 'size'
  | 'colour'
  | 'availability'
  | 'offers';

// A product listing in the Myntra / Ajio layout: category chips, quick
// filter chips, the grid, the sticky Sort | Filter bar, a sort sheet and a
// full-screen two-pane filter (facets left, options right, Apply at the
// bottom). Filters, counts and sorting are the website's (src/lib/listing.ts).
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
  const [sortOpen, setSortOpen] = useState(false);
  const [filterAt, setFilterAt] = useState<Facet | null>(null);
  const { results, activeCount } = useMemo(
    () => runListing(products, f, scopeCategoryId),
    [products, f, scopeCategoryId],
  );

  const quick: { facet: Facet; label: string; on: boolean }[] = [
    { facet: 'size', label: 'Size', on: f.sizes.length > 0 },
    { facet: 'price', label: 'Price', on: f.min != null || f.max != null },
    { facet: 'colour', label: 'Colour', on: f.colors.length > 0 },
    {
      facet: 'availability',
      label: 'Availability',
      on: f.availability !== 'all' || f.inStock,
    },
  ];

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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quick}
            >
              {quick.map(q => (
                <Touch
                  key={q.facet}
                  style={[styles.quickChip, q.on && styles.quickOn]}
                  onPress={() => setFilterAt(q.facet)}
                >
                  <Text style={[styles.quickText, q.on && styles.primary]}>
                    {q.label}
                  </Text>
                  <ChevronDown
                    size={13}
                    color={q.on ? colors.primary : colors.mutedForeground}
                  />
                </Touch>
              ))}
              <Touch
                style={[styles.quickChip, f.sale && styles.quickOn]}
                onPress={() => {
                  tap();
                  setF(cur => ({ ...cur, sale: !cur.sale }));
                }}
              >
                <Text style={[styles.quickText, f.sale && styles.primary]}>
                  On sale
                </Text>
              </Touch>
            </ScrollView>
            <Text style={styles.count}>
              {results.length} {results.length === 1 ? 'piece' : 'pieces'}
              {f.search ? ` for "${f.search}"` : ''}
            </Text>
          </View>
        }
      />

      <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
        <Touch style={styles.barButton} onPress={() => setSortOpen(true)}>
          <Text style={styles.barText}>Sort</Text>
          {f.sort !== 'featured' ? <View style={styles.dot} /> : null}
        </Touch>
        <View style={styles.barDivider} />
        <Touch style={styles.barButton} onPress={() => setFilterAt('price')}>
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
        visible={sortOpen}
        title="Sort by"
        onClose={() => setSortOpen(false)}
      >
        {(Object.keys(SORT_LABELS) as SortKey[]).map(key => (
          <Touch
            key={key}
            style={styles.option}
            onPress={() => {
              setF(cur => ({ ...cur, sort: key }));
              setSortOpen(false);
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

      <FilterScreen
        open={filterAt}
        applied={f}
        products={products}
        scopeCategoryId={scopeCategoryId}
        categories={categories}
        boutiques={boutiques}
        onClose={() => setFilterAt(null)}
        onApply={next => {
          setF(next);
          setFilterAt(null);
        }}
      />
    </View>
  );
}

// Full-screen filters: facets on the left, options on the right, live count
// on Apply. Choices are a draft until Apply (Close throws them away).
function FilterScreen({
  open,
  applied,
  products,
  scopeCategoryId,
  categories,
  boutiques,
  onClose,
  onApply,
}: {
  open: Facet | null;
  applied: ListingFilters;
  products: Product[];
  scopeCategoryId: string | null;
  categories?: Category[];
  boutiques?: Boutique[];
  onClose: () => void;
  onApply: (f: ListingFilters) => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ListingFilters>(applied);
  const [facet, setFacet] = useState<Facet>('price');
  const [lastOpen, setLastOpen] = useState<Facet | null>(null);
  if (open !== lastOpen) {
    // Each time it opens: start from what's applied, at the facet asked for.
    setLastOpen(open);
    if (open) {
      setDraft(applied);
      setFacet(open);
    }
  }

  const { results, facets } = useMemo(
    () => runListing(products, draft, scopeCategoryId),
    [products, draft, scopeCategoryId],
  );
  const set = (next: Partial<ListingFilters>) =>
    setDraft(cur => ({ ...cur, ...next }));
  const toggle = (
    key: 'categories' | 'boutiques' | 'sizes' | 'colors',
    value: string,
  ) =>
    setDraft(cur => ({
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
    b => facets.boutiques.has(b.id) || draft.boutiques.includes(b.id),
  );
  const categoryList = (categories ?? []).filter(
    c =>
      c.id !== scopeCategoryId &&
      (facets.categories.has(c.id) || draft.categories.includes(c.id)),
  );

  const facetList: {
    key: Facet;
    label: string;
    count: number;
    show: boolean;
  }[] = [
    {
      key: 'category',
      label: scopeCategoryId ? 'Add categories' : 'Category',
      count: draft.categories.length,
      show: categoryList.length > 0,
    },
    {
      key: 'boutique',
      label: 'Boutique',
      count: draft.boutiques.length,
      show: boutiqueList.length > 0,
    },
    {
      key: 'price',
      label: 'Price',
      count: draft.min != null || draft.max != null ? 1 : 0,
      show: true,
    },
    {
      key: 'size',
      label: 'Size',
      count: draft.sizes.length,
      show: sizeList.length > 0,
    },
    {
      key: 'colour',
      label: 'Colour',
      count: draft.colors.length,
      show: colorList.length > 0,
    },
    {
      key: 'availability',
      label: 'Availability',
      count: (draft.availability !== 'all' ? 1 : 0) + (draft.inStock ? 1 : 0),
      show: true,
    },
    { key: 'offers', label: 'Offers', count: draft.sale ? 1 : 0, show: true },
  ];
  const shown = facetList.filter(x => x.show);
  const current = shown.some(x => x.key === facet) ? facet : 'price';

  return (
    <Modal
      visible={!!open}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={[styles.fs, { paddingTop: insets.top }]}>
        <View style={styles.fsHead}>
          <Text style={styles.fsTitle}>Filters</Text>
          <Touch
            hitSlop={8}
            onPress={() =>
              setDraft(emptyFilters({ search: draft.search, sort: draft.sort }))
            }
          >
            <Text style={styles.clear}>Clear all</Text>
          </Touch>
        </View>
        <View style={styles.panes}>
          <ScrollView style={styles.left}>
            {shown.map(x => (
              <Touch
                key={x.key}
                style={[styles.facet, current === x.key && styles.facetOn]}
                onPress={() => setFacet(x.key)}
              >
                {current === x.key ? <View style={styles.facetBar} /> : null}
                <Text
                  style={[
                    styles.facetText,
                    current === x.key && styles.facetTextOn,
                  ]}
                >
                  {x.label}
                </Text>
                {x.count ? (
                  <Text style={styles.facetCount}>{x.count}</Text>
                ) : null}
              </Touch>
            ))}
          </ScrollView>
          <ScrollView
            style={styles.right}
            contentContainerStyle={styles.rightBody}
          >
            {current === 'category'
              ? categoryList.map(c => (
                  <CheckRow
                    key={c.id}
                    label={c.name}
                    count={facets.categories.get(c.id) ?? 0}
                    checked={draft.categories.includes(c.id)}
                    onPress={() => toggle('categories', c.id)}
                  />
                ))
              : null}
            {current === 'boutique'
              ? boutiqueList.map(b => (
                  <CheckRow
                    key={b.id}
                    label={b.name}
                    count={facets.boutiques.get(b.id) ?? 0}
                    checked={draft.boutiques.includes(b.id)}
                    onPress={() => toggle('boutiques', b.id)}
                  />
                ))
              : null}
            {current === 'price'
              ? BUDGETS.map(b => {
                  const on =
                    (draft.min ?? null) === (b.min ?? null) &&
                    (draft.max ?? null) === (b.max ?? null);
                  return (
                    <CheckRow
                      key={b.label}
                      label={b.label}
                      checked={on}
                      round
                      onPress={() =>
                        set(
                          on
                            ? { min: null, max: null }
                            : { min: b.min ?? null, max: b.max ?? null },
                        )
                      }
                    />
                  );
                })
              : null}
            {current === 'size' ? (
              <View style={styles.wrap}>
                {sizeList.map(s => (
                  <Chip
                    key={s}
                    label={s}
                    active={draft.sizes.includes(s)}
                    onPress={() => toggle('sizes', s)}
                  />
                ))}
              </View>
            ) : null}
            {current === 'colour'
              ? colorList.map(c => (
                  <CheckRow
                    key={c}
                    label={c}
                    count={facets.colors.get(c) ?? 0}
                    checked={draft.colors.includes(c)}
                    onPress={() => toggle('colors', c)}
                  />
                ))
              : null}
            {current === 'availability' ? (
              <>
                <CheckRow
                  label="Ready to ship"
                  count={facets.ready}
                  checked={draft.availability === 'ready'}
                  onPress={() =>
                    set({
                      availability:
                        draft.availability === 'ready' ? 'all' : 'ready',
                    })
                  }
                />
                <CheckRow
                  label="Made to order"
                  count={facets.madeToOrder}
                  checked={draft.availability === 'made-to-order'}
                  onPress={() =>
                    set({
                      availability:
                        draft.availability === 'made-to-order'
                          ? 'all'
                          : 'made-to-order',
                    })
                  }
                />
                <CheckRow
                  label="In stock only"
                  count={facets.inStock}
                  checked={draft.inStock}
                  onPress={() => set({ inStock: !draft.inStock })}
                />
              </>
            ) : null}
            {current === 'offers' ? (
              <CheckRow
                label="On sale"
                count={facets.sale}
                checked={draft.sale}
                onPress={() => set({ sale: !draft.sale })}
              />
            ) : null}
          </ScrollView>
        </View>
        <View style={[styles.fsFoot, { paddingBottom: 10 + insets.bottom }]}>
          <Button
            label="Close"
            variant="outline"
            style={styles.flex}
            onPress={onClose}
          />
          <Button
            label={`Apply (${results.length})`}
            style={styles.flex}
            onPress={() => onApply(draft)}
          />
        </View>
      </View>
    </Modal>
  );
}

function CheckRow({
  label,
  count,
  checked,
  onPress,
  round,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onPress: () => void;
  round?: boolean;
}) {
  return (
    <Touch
      onPress={onPress}
      style={styles.checkRow}
      accessibilityRole={round ? 'radio' : 'checkbox'}
      accessibilityState={{ checked }}
    >
      <View
        style={[styles.box, round && styles.boxRound, checked && styles.boxOn]}
      >
        {checked ? (
          <Check size={13} color={colors.primaryForeground} strokeWidth={3} />
        ) : null}
      </View>
      <Text style={[styles.checkLabel, checked && styles.primary]}>
        {label}
      </Text>
      {count != null ? <Text style={styles.checkCount}>{count}</Text> : null}
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
  quick: { gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  quickChip: {
    height: 32,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.ivory,
  },
  quickOn: { borderColor: colors.primary, backgroundColor: colors.accent },
  quickText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.foreground,
  },
  count: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.mutedForeground,
    paddingHorizontal: 16,
    paddingTop: 12,
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
  // full-screen filter
  fs: { flex: 1, backgroundColor: colors.ivory },
  fsHead: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  fsTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 14,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.foreground,
  },
  clear: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.primary },
  panes: { flex: 1, flexDirection: 'row' },
  left: { width: '38%', flexGrow: 0, backgroundColor: colors.background },
  facet: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 6,
  },
  facetOn: { backgroundColor: colors.ivory },
  facetBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    backgroundColor: colors.primary,
  },
  facetText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.foreground,
  },
  facetTextOn: { fontFamily: fonts.sansSemi, color: colors.primary },
  facetCount: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.primary,
  },
  right: { flex: 1 },
  rightBody: { padding: 16 },
  fsFoot: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  // sheets
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  box: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxRound: { borderRadius: 9 },
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
});
