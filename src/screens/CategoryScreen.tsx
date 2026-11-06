import { View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Listing } from '@/components/Listing';
import { useBoutiques, useCategories, useProducts } from '@/lib/catalog';
import { readFilters } from '@/lib/listing';
import { useGo, useParams } from '@/navigation';

// /category/<slug>?sort=&min=&max=&cat=&boutique=&size=&color=&availability=&stock=1&sale=1&search=
// - the website's links ("all" = every category).
export default function CategoryScreen() {
  const go = useGo();
  const params = useParams<'Category'>();
  const { slug } = params;
  const products = useProducts();
  const { data: categories = [] } = useCategories();
  const { data: boutiques = [] } = useBoutiques();
  const category = categories.find(c => c.slug === slug) ?? null;
  const all = products.data ?? [];
  const live = categories.filter(c => all.some(p => p.category_id === c.id));
  const liveBoutiques = boutiques.filter(b =>
    all.some(p => p.vendor_id === b.id),
  );
  const initial = readFilters(params);
  const title = initial.search
    ? `"${initial.search}"`
    : slug === 'all'
    ? initial.sale
      ? 'Sale'
      : 'Shop all'
    : category?.name ?? '';

  return (
    <View style={{ flex: 1 }}>
      <AppHeader back title={title} />
      <Listing
        // A new link (category or filters) starts fresh.
        key={JSON.stringify(params)}
        products={all}
        loading={
          products.isLoading || (slug !== 'all' && categories.length === 0)
        }
        initial={initial}
        scopeCategoryId={slug === 'all' ? null : category?.id ?? '__none__'}
        categories={live}
        boutiques={liveBoutiques}
        onCategory={c =>
          go(`/category/${c ? c.slug : 'all'}`, { replace: true })
        }
        onRefresh={() => void products.refetch()}
        refreshing={products.isRefetching}
      />
    </View>
  );
}
