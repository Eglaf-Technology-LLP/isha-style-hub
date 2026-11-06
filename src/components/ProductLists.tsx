import { ReactElement, useCallback } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Product } from '@/lib/catalog';
import { colors } from '@/theme';
import { ProductCard } from './ProductCard';
import { ProductCardSkeleton } from './Skeleton';
import { Sans, SectionHeader } from './ui';

const GAP = 12;
const SIDE = 16;

// Two-column product grid (listing, boutique, search, wishlist). FlatList
// renders only what is on screen, so a long catalogue stays smooth.
export function ProductGrid({
  products,
  loading,
  header,
  empty,
  onRefresh,
  refreshing,
  bottomInset = 0,
}: {
  products: Product[];
  loading?: boolean;
  header?: ReactElement;
  empty?: ReactElement | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  bottomInset?: number;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = (width - SIDE * 2 - GAP) / 2;
  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <ProductCard product={item} width={cardWidth} />
    ),
    [cardWidth],
  );

  return (
    <FlatList
      data={products}
      keyExtractor={p => p.id}
      numColumns={2}
      renderItem={renderItem}
      columnWrapperStyle={{ gap: GAP, paddingHorizontal: SIDE }}
      contentContainerStyle={{ gap: 18, paddingBottom: 24 + bottomInset }}
      ListHeaderComponent={header}
      ListEmptyComponent={
        loading ? (
          <View style={styles.skeletons}>
            {Array.from({ length: 6 }, (_, n) => (
              <ProductCardSkeleton key={n} width={cardWidth} />
            ))}
          </View>
        ) : (
          empty ?? (
            <Sans
              style={{
                textAlign: 'center',
                marginTop: 48,
                color: colors.mutedForeground,
              }}
            >
              Nothing here just yet.
            </Sans>
          )
        )
      }
      initialNumToRender={6}
      maxToRenderPerBatch={8}
      windowSize={7}
      removeClippedSubviews
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
    />
  );
}

// A swipeable row of products under a section heading (home page rails).
export function ProductRail({
  eyebrowText,
  loading,
  title,
  accent,
  products,
  action,
  onAction,
}: {
  eyebrowText?: string;
  title: string;
  accent?: string;
  products: Product[];
  action?: string;
  onAction?: () => void;
  // While the catalogue loads: the rail's shape, pulsing.
  loading?: boolean;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(200, width * 0.44);
  if (loading && products.length === 0) {
    return (
      <View style={styles.rail}>
        <SectionHeader
          eyebrowText={eyebrowText}
          title={title}
          accent={accent}
        />
        <View style={styles.railSkeleton}>
          {[0, 1, 2].map(n => (
            <ProductCardSkeleton key={n} width={cardWidth} />
          ))}
        </View>
      </View>
    );
  }
  if (products.length === 0) return null;
  return (
    <View style={styles.rail}>
      <SectionHeader
        eyebrowText={eyebrowText}
        title={title}
        accent={accent}
        action={action}
        onAction={onAction}
      />
      <FlatList
        horizontal
        data={products}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <ProductCard product={item} width={cardWidth} />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: GAP, paddingHorizontal: SIDE }}
        snapToInterval={cardWidth + GAP}
        decelerationRate="fast"
        initialNumToRender={3}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  skeletons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
  },
  railSkeleton: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  rail: { paddingVertical: 22 },
});
