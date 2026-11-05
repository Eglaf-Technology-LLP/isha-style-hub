import { Image } from 'react-native';
import { useGo } from '@/navigation';
import { BadgeCheck } from 'lucide-react-native';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Eyebrow, Placeholder, Sans, Serif, Touch } from '@/components/ui';
import { useBoutiques, useProducts } from '@/lib/catalog';
import { colors, fonts } from '@/theme';

// Every approved boutique with a cover photo and its live piece count,
// busiest first - the website's /boutiques page.
export default function Boutiques() {
  const go = useGo();
  const { data: boutiques = [], isLoading } = useBoutiques();
  const { data: products = [] } = useProducts();

  const cards = useMemo(
    () =>
      boutiques
        .map(b => ({
          b,
          pieces: products.filter(p => p.vendor_id === b.id).length,
          cover:
            b.banner_url ||
            products.find(p => p.vendor_id === b.id && p.images[0])
              ?.images[0] ||
            null,
        }))
        .sort((x, y) => y.pieces - x.pieces),
    [boutiques, products],
  );

  return (
    <View style={{ flex: 1 }}>
      <AppHeader />
      <FlatList
        data={cards}
        keyExtractor={c => c.b.id}
        contentContainerStyle={{ padding: 16, gap: 16 }}
        ListHeaderComponent={
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <Eyebrow>The boutiques</Eyebrow>
            <Serif style={{ fontSize: 28, marginTop: 6, textAlign: 'center' }}>
              Independent labels,{'\n'}
              <Text
                style={{ fontFamily: fonts.serifItalic, color: colors.primary }}
              >
                one address
              </Text>
            </Serif>
          </View>
        }
        ListEmptyComponent={
          isLoading ? undefined : (
            <Sans
              style={{ textAlign: 'center', color: colors.mutedForeground }}
            >
              Boutiques are joining soon.
            </Sans>
          )
        }
        renderItem={({ item: { b, pieces, cover } }) => (
          <Touch style={styles.card} onPress={() => go(`/store/${b.slug}`)}>
            <View style={styles.cover}>
              {cover ? (
                <Image
                  source={{ uri: cover }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              ) : (
                <Placeholder label={b.name} dark />
              )}
            </View>
            <View style={styles.body}>
              <View style={styles.logo}>
                {b.logo_url ? (
                  <Image
                    source={{ uri: b.logo_url }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                ) : (
                  <Serif style={{ fontSize: 20, color: colors.primary }}>
                    {b.name.charAt(0)}
                  </Serif>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Serif style={{ fontSize: 19 }} numberOfLines={1}>
                    {b.name}
                  </Serif>
                  {b.is_verified ? (
                    <BadgeCheck size={15} color={colors.gold} />
                  ) : null}
                </View>
                <Text style={styles.pieces}>
                  {pieces} {pieces === 1 ? 'piece' : 'pieces'}
                </Text>
              </View>
            </View>
          </Touch>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.ivory,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cover: { height: 170, overflow: 'hidden' },
  body: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  pieces: {
    fontFamily: fonts.sans,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.mutedForeground,
    marginTop: 3,
  },
});
