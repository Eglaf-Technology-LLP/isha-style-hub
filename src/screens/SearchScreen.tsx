import { useBack, useGo } from '@/navigation';
import { ArrowLeft, Search as SearchIcon, X } from 'lucide-react-native';
import { useDeferredValue, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '@/components/Listing';
import { ProductGrid } from '@/components/ProductLists';
import { Eyebrow, Touch } from '@/components/ui';
import {
  filterProducts,
  useBoutiques,
  useCategories,
  useProducts,
} from '@/lib/catalog';
import { colors, fonts } from '@/theme';

// Search as you type over the catalogue already on the phone - names,
// boutiques and descriptions - plus category and boutique shortcuts.
export default function SearchScreen() {
  const go = useGo();
  const back = useBack();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const query = useDeferredValue(text.trim());
  const { data: products = [], isLoading } = useProducts();
  const { data: categories = [] } = useCategories();
  const { data: boutiques = [] } = useBoutiques();
  const results = useMemo(
    () => (query.length >= 2 ? filterProducts(products, { query }) : []),
    [products, query],
  );
  const q = query.toLowerCase();
  const catHits =
    q.length >= 2
      ? categories.filter(c => c.name.toLowerCase().includes(q))
      : categories;
  const shopHits =
    q.length >= 2
      ? boutiques.filter(b => b.name.toLowerCase().includes(q))
      : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <Touch hitSlop={10} onPress={() => back()} accessibilityLabel="Back">
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
      <ProductGrid
        products={results}
        loading={isLoading && query.length >= 2}
        header={
          <View style={{ paddingTop: 14 }}>
            {catHits.length > 0 ? (
              <>
                <Eyebrow style={styles.label}>Categories</Eyebrow>
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
              </>
            ) : null}
            {shopHits.length > 0 ? (
              <>
                <Eyebrow style={styles.label}>Boutiques</Eyebrow>
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
              </>
            ) : null}
            {query.length >= 2 ? (
              <Text style={styles.count}>
                {results.length} {results.length === 1 ? 'piece' : 'pieces'} for
                "{query}"
              </Text>
            ) : null}
          </View>
        }
        empty={query.length >= 2 ? undefined : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  label: { paddingHorizontal: 16, marginBottom: 10 },
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 18 },
  count: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.mutedForeground,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
});
