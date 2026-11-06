import { useParams } from '@/navigation';
import { Image } from 'react-native';
import { BadgeCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Listing } from '@/components/Listing';
import { Placeholder, Sans, Serif } from '@/components/ui';
import { useBoutiques, useCategories, useProducts } from '@/lib/catalog';
import { emptyFilters } from '@/lib/listing';
import { colors } from '@/theme';

// A boutique's own shop: banner, logo, story, then its pieces.
export default function StoreScreen() {
  const { slug } = useParams<'Store'>();
  const { data: boutiques = [], isLoading } = useBoutiques();
  const products = useProducts();
  const b = boutiques.find(x => x.slug === slug);
  const { data: categories = [] } = useCategories();
  // Only this boutique's pieces; its categories can be ticked in Filter.
  const own = (products.data ?? []).filter(p => p.vendor_id === b?.id);
  const ownCategories = categories.filter(c =>
    own.some(p => p.category_id === c.id),
  );

  return (
    <View style={{ flex: 1 }}>
      <AppHeader back title={b?.name ?? ''} />
      <Listing
        key={b?.id ?? 'loading'}
        products={own}
        loading={products.isLoading || isLoading}
        initial={emptyFilters()}
        categories={ownCategories}
        onRefresh={() => void products.refetch()}
        refreshing={products.isRefetching}
        header={
          b ? (
            <View>
              <View style={styles.banner}>
                {b.banner_url ? (
                  <Image
                    source={{ uri: b.banner_url }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                ) : (
                  <Placeholder label={b.name} dark />
                )}
              </View>
              <View style={styles.intro}>
                <View style={styles.logo}>
                  {b.logo_url ? (
                    <Image
                      source={{ uri: b.logo_url }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  ) : (
                    <Serif style={{ fontSize: 26, color: colors.primary }}>
                      {b.name.charAt(0)}
                    </Serif>
                  )}
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 10,
                  }}
                >
                  <Serif style={{ fontSize: 26 }}>{b.name}</Serif>
                  {b.is_verified ? (
                    <BadgeCheck size={18} color={colors.gold} />
                  ) : null}
                </View>
                {b.description ? (
                  <Sans
                    style={{
                      color: colors.mutedForeground,
                      textAlign: 'center',
                      marginTop: 8,
                      lineHeight: 21,
                    }}
                  >
                    {b.description}
                  </Sans>
                ) : null}
              </View>
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { height: 150, overflow: 'hidden' },
  intro: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 6,
    marginTop: -36,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.ivory,
    backgroundColor: colors.ivory,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
