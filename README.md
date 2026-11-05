# AllBoutiqs app (React Native CLI)

The shopper app for Android and iOS. Plain React Native 0.88 (`@react-native-community/cli`, no Expo), React Navigation, Supabase. Same Supabase data, rules and design (maroon, ivory, antique gold; Jost and Playfair Display) as the AllBoutiqs website. The website and the Supabase backend (migrations, edge functions) live on the other branches (`main`, `Live-Vendor`); this branch holds only the app.

## Run

```sh
npm install
npm start                    # Metro, in its own terminal
npm run android              # npx react-native run-android: debug build on an emulator or USB phone
npm run ios                  # Mac only: cd ios && bundle install && bundle exec pod install first
```

Release builds (JS is bundled by Gradle, no Metro needed):

```sh
npm run apk                  # android/app/build/outputs/apk/release/app-release.apk
npm run aab                  # android/app/build/outputs/bundle/release/app-release.aab (Play Store)
```

Needs JDK 21 (`JAVA_HOME` = Android Studio's `jbr` folder works) and the Android SDK.

Release signing: the template signs release builds with the debug key. Before the Play Store, create an upload key once, keep it out of git, set it in `android/app/build.gradle` (`signingConfigs.release`) and never lose it.

### Windows: "Filename longer than 260 characters"

The native C++ build creates very long paths. Once per machine:

1. Windows long paths on: registry `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled = 1` (admin).
2. A CMake whose `ninja` is 1.12 or newer (the SDK's CMake 3.22.1 ships ninja 1.10.2, which fails). Android Studio: SDK Manager > SDK Tools > Show Package Details > CMake, install the newest; check `<sdk>\cmake\<version>\bin\ninja.exe --version`; then in `android/local.properties`:
   ```
   cmake.dir=C\:/Users/<you>/AppData/Local/Android/Sdk/cmake/<version>
   ```

A short repo path (for example `C:\ab`) also helps.

## Settings

`src/config.ts`: Supabase project (live by default), website URL, WhatsApp link. These are public values, the same ones the website ships.

Fonts are in `assets/fonts` (file name = PostScript name, so `fontFamily: 'Jost-Regular'` works on both platforms). After adding one: `npm run link-assets`.

## Code map

| What | Where |
|---|---|
| Navigation: tabs, stack, deep links (`https://allboutiqs.com/product/<id>` opens the app) | `App.tsx`, `src/navigation.tsx` |
| Home, Categories, Boutiques, Wishlist, Profile tabs | `src/screens/*Screen.tsx` |
| Category listing with Sort and Filter, boutique shop | `src/screens/CategoryScreen.tsx`, `StoreScreen.tsx`, `src/components/Listing.tsx` |
| Product page, Search, Bag | `src/screens/ProductScreen.tsx`, `SearchScreen.tsx`, `BagScreen.tsx` |
| Catalogue queries (same as the website's `src/hooks/useStorefront.ts`) | `src/lib/catalog.ts` |
| Bag (on the phone) and wishlist (phone + account `wishlists` table when signed in) | `src/lib/stores.ts` |
| Sign in / Create account: email code (`auth-email-otp` function), mobile code (Supabase SMS), password; customers only | `src/lib/auth.ts`, `src/screens/SignInScreen.tsx` |
| Terms consent at sign-up, or once after sign-in (`accept_terms` RPC) | `src/components/ConsentGate.tsx` |
| My orders and order detail | `src/lib/orders.ts`, `src/screens/OrdersScreen.tsx`, `OrderScreen.tsx` |
| Supabase backend: migrations and edge functions (copied from `Live-Vendor`) | `supabase/` |
| Colours, fonts | `src/theme.ts` |
| App icon, launch screen, deep link filters | `android/app/src/main/res`, `AndroidManifest.xml` |

Screens open by website path: `go('/category/all?sale=1')` from `useGo()` in `src/navigation.tsx`.

## Customers only

The app is for shoppers. A boutique (vendor) or admin account that signs in is signed out straight away with a note to use the website: admins are found with the `has_role` RPC, boutique members in `vendor_members`. There are no seller or admin screens in the app.

## Backend (`supabase/`)

Copied from the `Live-Vendor` branch, which runs on the live project (`allboutiqs-marketplace-live`). It is shared with the website and the seller/admin areas. Deploy backend changes from **one** branch only (today: `Live-Vendor`) and copy them here, so the two copies don't drift. Never run `supabase db push` from this branch against live without checking it matches `Live-Vendor`.

The app uses: `auth-email-otp` (email codes), `accept_terms`, `has_role`, and the `products`, `categories`, `vendors`, `wishlists`, `orders`, `order_items`, `vendor_orders` tables under their row-level security.

## Not built yet

- Checkout with Razorpay (`react-native-razorpay`) using the website's `create-razorpay-order` / `verify-razorpay-payment` functions and server-side prices. Signed out, "Place order" opens Sign in; signed in it says checkout is coming.
- Cancel and return requests in the app (the order page has WhatsApp help for now).
- Set or change password, add a mobile number or email to the account.
- Saved addresses, wallet, push notifications.
- Terms and Privacy open on the website.
- iOS app icon and launch screen (do on a Mac in Xcode).
