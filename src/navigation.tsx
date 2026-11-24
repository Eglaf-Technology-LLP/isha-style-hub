import {
  CommonActions,
  getStateFromPath,
  LinkingOptions,
  NavigatorScreenParams,
  StackActions,
  useNavigation,
  useRoute,
  RouteProp,
} from '@react-navigation/native';
import { useCallback } from 'react';
import { CONFIG } from '@/config';
import { LEGAL_DOCS, LEGAL_PATHS, LegalDocKey } from '@/content/legal';

// The website's path of each policy / info page the app has ("/faq" -> "faq").
export const LEGAL_DOC_BY_PATH: Record<string, LegalDocKey> =
  Object.fromEntries(
    (Object.keys(LEGAL_DOCS) as LegalDocKey[]).map(k => [LEGAL_PATHS[k], k]),
  );

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
  Legal: { doc: LegalDocKey };
  // The complaint form (a pop-up on the website, no page of its own).
  Complaint: undefined;
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
  // The website's own policy paths (allboutiqs.com/terms, /faq, ...) open
  // the same page in the app.
  getStateFromPath: (path, options) => {
    const page = path.replace(/^\/+/, '').split(/[?#]/)[0];
    const doc = LEGAL_DOC_BY_PATH[`/${page}`];
    return getStateFromPath(doc ? `legal/${doc}` : path, options);
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

// The screens the header opens from every page (bag, notifications, search)
// are kept once in the stack: tapping the icon again on that screen does
// nothing, and from a screen above it goes back to it instead of stacking
// another copy - so one Back always closes it.
const SINGLE_SCREENS: ReadonlySet<keyof RootParams> = new Set([
  'Bag',
  'Notifications',
  'Search',
]);

// go("/category/all?sale=1") - open a screen by its website path, so screens
// can keep using the same links as the website. { replace: true } swaps the
// current screen instead of stacking a new one. Returns false when the app
// has no screen for that path (the caller can open it on the website).
export function useGo() {
  const navigation = useNavigation();
  return useCallback(
    (href: string, opts: { replace?: boolean } = {}): boolean => {
      const [path, query = ''] = href.split('#')[0].split('?');
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
        return true;
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
        return true;
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
      else if (section === 'complaint') name = 'Complaint';
      else if (section === 'checkout')
        [name, routeParams] = ['Checkout', params];
      else if (section === 'order-placed' && id)
        [name, routeParams] = ['OrderPlaced', { id }];
      else if (LEGAL_DOC_BY_PATH[path])
        [name, routeParams] = ['Legal', { doc: LEGAL_DOC_BY_PATH[path] }];
      else if (section === 'signin') [name, routeParams] = ['SignIn', params];
      else if (section === 'orders') name = 'Orders';
      else if (section === 'order' && id)
        [name, routeParams] = ['Order', { id }];
      else if (section === 'invoice' && id)
        [name, routeParams] = ['Invoice', { id }];
      else if (section === 'password')
        [name, routeParams] = ['Password', params];
      if (!name) return false;
      if (!opts.replace && SINGLE_SCREENS.has(name)) {
        // The root stack: from a tab screen, useNavigation gives the tabs.
        const stack =
          navigation.getState()?.type === 'stack'
            ? navigation
            : navigation.getParent();
        const routes = stack?.getState()?.routes ?? [];
        if (stack && routes.some(r => r.name === name)) {
          if (routes[routes.length - 1].name !== name)
            stack.dispatch(StackActions.popTo(name, routeParams));
          return true;
        }
      }
      navigation.dispatch(
        opts.replace
          ? StackActions.replace(name, routeParams)
          : StackActions.push(name, routeParams),
      );
      return true;
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
