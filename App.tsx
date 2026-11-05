import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Heart, Home, LayoutGrid, Store, User } from 'lucide-react-native';
import { ColorValue, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { tap } from '@/lib/haptics';
import { linking, RootParams, TabParams } from '@/navigation';
import BagScreen from '@/screens/BagScreen';
import BoutiquesScreen from '@/screens/BoutiquesScreen';
import CategoriesScreen from '@/screens/CategoriesScreen';
import CategoryScreen from '@/screens/CategoryScreen';
import HomeScreen from '@/screens/HomeScreen';
import ProductScreen from '@/screens/ProductScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import SearchScreen from '@/screens/SearchScreen';
import StoreScreen from '@/screens/StoreScreen';
import WishlistScreen from '@/screens/WishlistScreen';
import { colors, fonts } from '@/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false } },
});

const Stack = createNativeStackNavigator<RootParams>();
const Tab = createBottomTabNavigator<TabParams>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.ivory,
    text: colors.foreground,
    border: colors.border,
  },
};

// Bottom tabs - the same five as the website's phone tab bar. Active tab:
// maroon, with a short antique-gold line on top.
const icon =
  (Icon: typeof Home, fillWhenActive = false) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) =>
    (
      <View style={styles.iconWrap}>
        {focused ? <View style={styles.marker} /> : null}
        <Icon
          size={22}
          color={color as string}
          strokeWidth={focused ? 2 : 1.6}
          fill={focused && fillWhenActive ? (color as string) : 'transparent'}
        />
      </View>
    );

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: 'rgba(35,31,26,0.6)',
        tabBarStyle: {
          backgroundColor: colors.ivory,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.sansMedium,
          fontSize: 11,
          letterSpacing: 0.3,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
      screenListeners={{ tabPress: () => tap() }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: icon(Home) }}
      />
      <Tab.Screen
        name="Categories"
        component={CategoriesScreen}
        options={{ tabBarIcon: icon(LayoutGrid) }}
      />
      <Tab.Screen
        name="Boutiques"
        component={BoutiquesScreen}
        options={{ tabBarIcon: icon(Store) }}
      />
      <Tab.Screen
        name="Wishlist"
        component={WishlistScreen}
        options={{ tabBarIcon: icon(Heart, true) }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: icon(User) }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <NavigationContainer theme={navTheme} linking={linking}>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="Product" component={ProductScreen} />
            <Stack.Screen name="Category" component={CategoryScreen} />
            <Stack.Screen name="Store" component={StoreScreen} />
            <Stack.Screen
              name="Search"
              component={SearchScreen}
              options={{ animation: 'fade_from_bottom' }}
            />
            <Stack.Screen
              name="Bag"
              component={BagScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: 'center' },
  marker: {
    position: 'absolute',
    top: -9,
    width: 28,
    height: 2,
    backgroundColor: colors.gold,
  },
});
