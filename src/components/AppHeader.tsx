import { ArrowLeft, Heart, Search, ShoppingBag } from 'lucide-react-native';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useBack, useGo } from '@/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import logo from '../../assets/logo.png';
import { cartCount, useCart } from '@/lib/stores';
import { colors, fonts } from '@/theme';
import { Serif, Touch } from './ui';

// The app bar, Myntra-style: [back] logo (or a title) .... search, wishlist,
// bag. `searchBar` adds the full-width Ajio-style search field underneath.
export function AppHeader({
  back: showBack,
  title,
  searchBar,
}: {
  back?: boolean;
  title?: string;
  searchBar?: boolean;
}) {
  const go = useGo();
  const back = useBack();
  const insets = useSafeAreaInsets();
  const count = useCart(st => cartCount(st.items));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {showBack ? (
          <Touch
            hitSlop={10}
            onPress={back}
            accessibilityLabel="Back"
            style={styles.icon}
          >
            <ArrowLeft size={22} color={colors.foreground} strokeWidth={1.7} />
          </Touch>
        ) : null}
        {title ? (
          <Serif style={styles.title} numberOfLines={1}>
            {title}
          </Serif>
        ) : (
          <Touch
            onPress={() => go('/')}
            accessibilityLabel="AllBoutiqs home"
            style={{ flex: 1 }}
          >
            <Image source={logo} style={styles.logo} resizeMode="contain" />
          </Touch>
        )}
        <Touch
          hitSlop={8}
          style={styles.icon}
          onPress={() => go('/search')}
          accessibilityLabel="Search"
        >
          <Search size={22} color={colors.foreground} strokeWidth={1.7} />
        </Touch>
        <Touch
          hitSlop={8}
          style={styles.icon}
          onPress={() => go('/wishlist')}
          accessibilityLabel="Wishlist"
        >
          <Heart size={22} color={colors.foreground} strokeWidth={1.7} />
        </Touch>
        <Touch
          hitSlop={8}
          style={styles.icon}
          onPress={() => go('/bag')}
          accessibilityLabel={`Bag, ${count} items`}
        >
          <ShoppingBag size={22} color={colors.foreground} strokeWidth={1.7} />
          {count > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
            </View>
          ) : null}
        </Touch>
      </View>
      {searchBar ? (
        <Touch
          style={styles.search}
          onPress={() => go('/search')}
          accessibilityRole="search"
        >
          <Search size={17} color={colors.primary} strokeWidth={1.8} />
          <Text style={styles.searchText}>
            Search sarees, lehengas, boutiques
          </Text>
        </Touch>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.ivory,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  logo: { width: 132, height: 56, marginLeft: 4 },
  title: { flex: 1, fontSize: 20, marginLeft: 4 },
  icon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.primaryForeground,
    fontSize: 10,
    fontFamily: fonts.sansMedium,
  },
  search: {
    marginHorizontal: 16,
    marginBottom: 10,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  searchText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.mutedForeground,
  },
});
