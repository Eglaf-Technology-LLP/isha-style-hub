import { useGo, useParams } from '@/navigation';
import { View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Listing } from '@/components/Listing';
import { SortKey, useCategories, useProducts } from '@/lib/catalog';

// /category/<slug>?sort=newest&sale=1&max=1999&availability=ready - the same
// links as the website ("all" = every category).
export default function CategoryScreen() {
  const go = useGo();
  const { slug, sort, sale, max, availability } = useParams<'Category'>();
  const products = useProducts();
  const { data: categories = [] } = useCategories();
  const category = categories.find(c => c.slug === slug) ?? null;
  const live = categories.filter(c =>
    (products.data ?? []).some(p => p.category_id === c.id),
  );
  const title =
    slug === 'all' ? (sale ? 'Sale' : 'Shop all') : category?.name ?? '';

  return (
    <View style={{ flex: 1 }}>
      <AppHeader back title={title} />
      <Listing
        // Re-mount when the link's filters change, so they start fresh.
        key={`${slug}|${sale}|${max}|${availability}`}
        products={products.data ?? []}
        loading={
          products.isLoading ||
          (slug !== 'all' && !category && categories.length === 0)
        }
        initial={{
          categoryId: slug === 'all' ? null : category?.id ?? '__none__',
          sale: sale === '1',
          max: max ? Number(max) : null,
          availability:
            availability === 'ready' || availability === 'made-to-order'
              ? availability
              : null,
        }}
        initialSort={(sort as SortKey) || 'featured'}
        categories={live}
        activeCategoryId={category?.id ?? null}
        onCategory={c =>
          go(`/category/${c ? c.slug : 'all'}`, { replace: true })
        }
        onRefresh={() => void products.refetch()}
        refreshing={products.isRefetching}
      />
    </View>
  );
}
