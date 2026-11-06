import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Clock, Search as SearchIcon, X } from 'lucide-react-native';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '@/components/Listing';
import { ProductGrid } from '@/components/ProductLists';
import { Eyebrow, Touch } from '@/components/ui';
import { useBoutiques, useCategories, useProducts } from '@/lib/catalog';
import { emptyFilters, runListing } from '@/lib/listing';
import { useBack, useGo } from '@/navigation';
import { colors, fonts } from '@/theme';

// The website's search panel (Live-Vendor SearchPanel): results as you type
// (same word matching as the listing), recent searches (last 5, on the
// phone), popular searches, and "search" opens the full results page.
const POPULAR_SEARCHES = [
  'Lehenga',
  'Silk saree',
  'Kurti set',
  'Co-ord',
  'Banarasi',
  'Anarkali',
];
const RECENT_KEY = 'allboutiqs:recent-searches';

export default function SearchScreen() {
  const go = useGo();
  const back = useBack();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const query = useDeferredValue(text.trim());
  const { data: products = [], isLoading } = useProducts();
  const { data: categories = [] } = useCategories();
  const { data: boutiques = [] } = useBoutiques();

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then(v => setRecent(v ? JSON.parse(v) : []))
      .catch(() => undefined);
  }, []);
  const saveRecent = (term: string) => {
    const next = [
      term,
      ...recent.filter(r => r.toLowerCase() !== term.toLowerCase()),
    ].slice(0, 5);
    setRecent(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(
      () => undefined,
    );
  };
  const clearRecent = () => {
    setRecent([]);
    AsyncStorage.removeItem(RECENT_KEY).catch(() => undefined);
  };

  const submit = (term: string) => {
    const t = term.trim();
    if (!t) return;
    saveRecent(t);
    go(`/category/all?search=${encodeURIComponent(t)}`, { replace: true });
  };

  const results = useMemo(
    () =>
      query.length >= 2
        ? runListing(products, emptyFilters({ search: query }), null).results
        : [],
    [products, query],
  );
  const q = query.toLowerCase();
  const catHits =
    q.length >= 2
      ? categories.filter(c => c.name.toLowerCase().includes(q))
      : [];
  const shopHits =
    q.length >= 2
      ? boutiques.filter(b => b.name.toLowerCase().includes(q))
      : [];

  return (
    <View style={styles.flex}>
      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <Touch hitSlop={10} onPress={back} accessibilityLabel="Back">
          <ArrowLeft size={22} color={colors.foreground} strokeWidth={1.7} />
        </Touch>
        <View style={styles.field}>
          <SearchIcon size={17} color={colors.primary} strokeWidth={1.8} />
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            placeholder="Search sarees, lehengas, boutiques"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
            onSubmitEditing={() => submit(text)}
          />
          {text ? (
            <Touch
              hitSlop={10}
              onPress={() => setText('')}
              accessibilityLabel="Clear"
            >
              <X size={18} color={colors.mutedForeground} />
            </Touch>
          ) : null}
        </View>
      </View>

      {query.length < 2 ? (
        <ScrollView
          contentContainerStyle={styles.idle}
          keyboardShouldPersistTaps="handled"
        >
          {recent.length ? (
            <>
              <View style={styles.rowBetween}>
                <Eyebrow>Recent</Eyebrow>
                <Touch hitSlop={8} onPress={clearRecent}>
                  <Text style={styles.clear}>Clear</Text>
                </Touch>
              </View>
              {recent.map(r => (
                <Touch key={r} style={styles.recent} onPress={() => submit(r)}>
                  <Clock size={15} color={colors.mutedForeground} />
                  <Text style={styles.recentText}>{r}</Text>
                </Touch>
              ))}
            </>
          ) : null}
          <Eyebrow style={styles.popularHead}>Popular searches</Eyebrow>
          <View style={styles.wrap}>
            {POPULAR_SEARCHES.map(t => (
              <Chip key={t} label={t} onPress={() => submit(t)} />
            ))}
          </View>
          {categories.length ? (
            <>
              <Eyebrow style={styles.popularHead}>Categories</Eyebrow>
              <View style={styles.wrap}>
                {categories.map(c => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    onPress={() => go(`/category/${c.slug}`, { replace: true })}
                  />
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      ) : (
        <ProductGrid
          products={results}
          loading={isLoading}
          header={
            <View style={styles.resultsHead}>
              {catHits.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}
                  keyboardShouldPersistTaps="handled"
                >
                  {catHits.map(c => (
                    <Chip
                      key={c.id}
                      label={c.name}
                      onPress={() => go(`/category/${c.slug}`)}
                    />
                  ))}
                </ScrollView>
              ) : null}
              {shopHits.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}
                  keyboardShouldPersistTaps="handled"
                >
                  {shopHits.map(b => (
                    <Chip
                      key={b.id}
                      label={b.name}
                      onPress={() => go(`/store/${b.slug}`)}
                    />
                  ))}
                </ScrollView>
              ) : null}
              <Touch style={styles.seeAll} onPress={() => submit(query)}>
                <Text style={styles.count}>
                  {results.length} {results.length === 1 ? 'piece' : 'pieces'}{' '}
                  for "{query}"
                </Text>
                <Text style={styles.clear}>See all with filters</Text>
              </Touch>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: colors.ivory,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  field: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.foreground,
    paddingVertical: 0,
  },
  idle: { padding: 16 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  clear: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.primary },
  recent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  recentText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.foreground,
  },
  popularHead: { marginTop: 22, marginBottom: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resultsHead: { paddingTop: 12 },
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  seeAll: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  count: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.mutedForeground,
  },
});
