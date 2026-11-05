import { useGo } from '@/navigation';
import { Heart } from 'lucide-react-native';
import { useMemo } from 'react';
import { View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { ProductGrid } from '@/components/ProductLists';
import { Button, Sans, Serif } from '@/components/ui';
import { useProducts } from '@/lib/catalog';
import { useWishlist } from '@/lib/stores';
import { colors } from '@/theme';

// Saved pieces, newest saved first. A piece no longer on sale drops out.
export default function Wishlist() {
  const go = useGo();
  const ids = useWishlist(st => st.ids);
  const { data: products = [], isLoading } = useProducts();
  const saved = useMemo(() => {
    const byId = new Map(products.map(p => [p.id, p]));
    return ids.map(id => byId.get(id)).filter(p => !!p);
  }, [ids, products]);

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        title={`Wishlist${saved.length ? ` (${saved.length})` : ''}`}
      />
      <ProductGrid
        products={saved}
        loading={isLoading && ids.length > 0}
        header={<View style={{ height: 16 }} />}
        empty={
          <View
            style={{
              alignItems: 'center',
              paddingHorizontal: 32,
              paddingTop: 64,
            }}
          >
            <View
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                borderWidth: 1,
                borderColor: colors.goldSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Heart size={30} color={colors.gold} strokeWidth={1.4} />
            </View>
            <Serif style={{ fontSize: 24, marginTop: 20 }}>
              Nothing saved yet
            </Serif>
            <Sans
              style={{
                color: colors.mutedForeground,
                marginTop: 8,
                textAlign: 'center',
              }}
            >
              Tap the heart on any piece to keep it here.
            </Sans>
            <Button
              label="Start shopping"
              onPress={() => go('/category/all')}
              style={{ marginTop: 24, alignSelf: 'stretch' }}
            />
          </View>
        }
      />
    </View>
  );
}
