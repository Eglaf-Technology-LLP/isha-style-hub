import {
  CommonActions,
  LinkingOptions,
  NavigatorScreenParams,
  StackActions,
  useNavigation,
  useRoute,
  RouteProp,
} from '@react-navigation/native';
import { useCallback } from 'react';
import { CONFIG } from '@/config';

// Every screen and its parameters. Tabs live inside the root stack, so
// product, listing, search and bag open on top of the tab bar (Myntra-style).
export type TabParams = {
  Home: undefined;
  Categories: undefined;
  Boutiques: undefined;
  Wishlist: undefined;
  Profile: undefined;
};

export type RootParams = {
  Tabs: NavigatorScreenParams<TabParams> | undefined;
  Product: { id: string };
  // slug plus the website's listing parameters (sort, min, max, cat, boutique,
  // size, color, availability, stock, sale, search).
  Category: { slug: string } & Record<string, string | undefined>;
  Store: { slug: string };
  Search: undefined;
  Bag: undefined;
  SignIn: { mode?: string } | undefined;
  Orders: undefined;
  Order: { id: string };
  Password: undefined;
  MyProfile: undefined;
  Addresses: undefined;
  Wallet: undefined;
  Invoice: { id: string };
  Notifications: undefined;
  Legal: { doc: 'terms' | 'privacy' };
  Checkout: { buyNow?: string } | undefined;
  OrderPlaced: { id: string };
};

// https://allboutiqs.com/product/<id> (and allboutiqs://...) open the same
// screen in the app - the website's own URLs.
export const linking: LinkingOptions<RootParams> = {
  prefixes: [
    CONFIG.siteUrl,
    CONFIG.siteUrl.replace('https://', 'https://www.'),
    'allboutiqs://',
  ],
  config: {
    screens: {
      Tabs: {
        screens: {
          Home: '',
          Categories: 'categories',
          Boutiques: 'boutiques',
          Wishlist: 'wishlist',
          Profile: 'account',
        },
      },
      Product: 'product/:id',
      Category: 'category/:slug',
      Store: 'store/:slug',
      Search: 'search',
      Bag: 'bag',
      SignIn: 'signin',
      Orders: 'orders',
      Order: 'order/:id',
      Password: 'password',
      MyProfile: 'account/profile',
      Addresses: 'account/addresses',
      Wallet: 'account/wallet',
      Invoice: 'invoice/:id',
      Notifications: 'notifications',
      Checkout: 'checkout',
      OrderPlaced: 'order-placed/:id',
      Legal: {
        path: 'legal/:doc',
      },
    },
  },
};

const TAB_PATHS: Record<string, keyof TabParams> = {
  '/': 'Home',
  '/categories': 'Categories',
  '/boutiques': 'Boutiques',
  '/wishlist': 'Wishlist',
  '/account': 'Profile',
  '/profile': 'Profile',
};

// go("/category/all?sale=1") - open a screen by its website path, so screens
// can keep using the same links as the website. { replace: true } swaps the
// current screen instead of stacking a new one.
export function useGo() {
  const navigation = useNavigation();
  return useCallback(
    (href: string, opts: { replace?: boolean } = {}) => {
      const [path, query = ''] = href.split('?');
      const params: Record<string, string> = {};
      for (const pair of query.split('&').filter(Boolean)) {
        const [k, v = ''] = pair.split('=');
        params[decodeURIComponent(k)] = decodeURIComponent(v);
      }
      const tab = TAB_PATHS[path];
      if (tab) {
        if (navigation.canGoBack())
          navigation.dispatch(StackActions.popToTop());
        navigation.dispatch(
          CommonActions.navigate({ name: 'Tabs', params: { screen: tab } }),
        );
        return;
      }
      const [, section, id] = path.split('/');
      // /account/profile, /account/addresses, /account/wallet
      const ACCOUNT: Record<string, keyof RootParams> = {
        profile: 'MyProfile',
        addresses: 'Addresses',
        wallet: 'Wallet',
      };
      if (section === 'account' && id && ACCOUNT[id]) {
        navigation.dispatch(StackActions.push(ACCOUNT[id]));
        return;
      }
      let name: keyof RootParams | null = null;
      let routeParams: object | undefined;
      if (section === 'product' && id)
        [name, routeParams] = ['Product', { id }];
      else if (section === 'category' && id)
        [name, routeParams] = ['Category', { slug: id, ...params }];
      else if (section === 'store' && id)
        [name, routeParams] = ['Store', { slug: id }];
      else if (section === 'search') name = 'Search';
      else if (section === 'bag') name = 'Bag';
      else if (section === 'notifications') name = 'Notifications';
      else if (section === 'checkout')
        [name, routeParams] = ['Checkout', params];
      else if (section === 'order-placed' && id)
        [name, routeParams] = ['OrderPlaced', { id }];
      else if (section === 'terms')
        [name, routeParams] = ['Legal', { doc: 'terms' }];
      else if (section === 'privacy-policy')
        [name, routeParams] = ['Legal', { doc: 'privacy' }];
      else if (section === 'signin') [name, routeParams] = ['SignIn', params];
      else if (section === 'orders') name = 'Orders';
      else if (section === 'order' && id)
        [name, routeParams] = ['Order', { id }];
      else if (section === 'invoice' && id)
        [name, routeParams] = ['Invoice', { id }];
      else if (section === 'password')
        [name, routeParams] = ['Password', params];
      if (!name) return;
      navigation.dispatch(
        opts.replace
          ? StackActions.replace(name, routeParams)
          : StackActions.push(name, routeParams),
      );
    },
    [navigation],
  );
}

export function useBack() {
  const navigation = useNavigation();
  const go = useGo();
  return useCallback(
    () => (navigation.canGoBack() ? navigation.goBack() : go('/')),
    [navigation, go],
  );
}

export function useParams<K extends keyof RootParams>() {
  return useRoute<RouteProp<RootParams, K>>().params as NonNullable<
    RootParams[K]
  >;
}
