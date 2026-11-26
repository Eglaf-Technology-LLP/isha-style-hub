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

`src/config.ts`: Supabase project, website URL, WhatsApp link. `APP_ENV` picks the database: `live` (keep this in git and in Play Store builds) or `stage` (the stage website's project, for testing orders and Razorpay). These are public values, the same ones the websites ship.

Fonts are in `assets/fonts` (file name = PostScript name, so `fontFamily: 'Jost-Regular'` works on both platforms). After adding one: `npm run link-assets`.

## Code map

| What | Where |
|---|---|
| Navigation: tabs, stack, deep links (`https://allboutiqs.com/product/<id>` opens the app) | `App.tsx`, `src/navigation.tsx` |
| Home, Categories, Boutiques, Wishlist, Profile tabs | `src/screens/*Screen.tsx` |
| Category listing with Sort and Filter, boutique shop | `src/screens/CategoryScreen.tsx`, `StoreScreen.tsx`, `src/components/Listing.tsx` |
| Product page, Search, Bag | `src/screens/ProductScreen.tsx`, `SearchScreen.tsx`, `BagScreen.tsx` |
| Catalogue queries (same as the website's `src/hooks/useStorefront.ts`), Home banner slides (`hero_slides`) | `src/lib/catalog.ts` |
| Home banner, boutique boards, top strip | `src/components/HeroBanner.tsx`, `HomeExtras.tsx` |
| Policy and info pages (Terms, Privacy, Shipping, Return & Refund, About us, Contact us, FAQ) and company details, generated from the website by `npm run legal:sync` | `src/content/legal.ts`, `src/content/company.ts`, `src/screens/LegalScreen.tsx` |
| Complaint form (`submit-complaint` function, ticket number); the website footer's details at the bottom of Profile | `src/screens/ComplaintScreen.tsx`, `src/components/CompanyFooter.tsx` |
| Admin settings the wording follows (return window, shipping charged) | `src/lib/settings.ts` |
| Bag (on the phone) and wishlist (phone + account `wishlists` table when signed in); a customised piece is its own bag line (`lineId`) | `src/lib/stores.ts` |
| Bag line: change the size, colour / customisation / SKU shown | `src/screens/BagScreen.tsx`, `src/lib/cartVariants.ts` |
| Customise this piece: the product's % of the piece's price, measurements and a note (server re-prices it) | `src/lib/customisation.ts`, `src/components/Customiser.tsx` |
| Sold-out size made to order ("When a size sells out": extra ₹ or %, extra days, no COD) or hidden; "ships in N days" from the server's ship date | `src/lib/soldOutMadeToOrder.ts`, `src/lib/shipsBy.ts`, `src/components/MadeToOrderNote.tsx` |
| Bag and checkout re-check today's prices and stock: a line turns made to order or back, pieces no longer for sale are removed | `src/lib/syncCartPrices.ts` |
| Checkout: server-priced order, Free Delivery, COD fee 3% + GST per boutique part (`shiprocket-cod-charge`), Product value / Customisation charge / GST lines, each piece's rules and the terms note above Pay, no online payment above Rs 5,00,000, late-payment refunds | `src/lib/checkout.ts`, `src/lib/orderAmounts.ts`, `src/lib/gst.ts`, `src/screens/CheckoutScreen.tsx`, `src/components/CheckoutNotes.tsx` |
| Addresses: one form for Saved addresses and "Deliver to", address line 1 at least 10 characters, the first one starts from the profile | `src/components/Form.tsx`, `src/lib/addressLine1.ts`, `src/screens/AddressesScreen.tsx`, `src/components/DeliverTo.tsx` |
| Sign in / Create account: email code (`auth-email-otp` function), mobile code (Supabase SMS), password; customers only | `src/lib/auth.ts`, `src/screens/SignInScreen.tsx` |
| Password: optional field on Create account (saved once the code is right), Forgot password (code, then new password), Set/Change in Profile; min 8 characters, codes keep working | `src/screens/SignInScreen.tsx`, `PasswordScreen.tsx` |
| My profile: name; the email/mobile the account was registered with is locked, the other one is added or changed with a code sent to it and then signs in too (`contact_taken`) | `src/screens/MyProfileScreen.tsx`, `src/lib/auth.ts` |
| Terms consent at sign-up, or once after sign-in (`accept_terms` RPC) | `src/components/ConsentGate.tsx` |
| My orders and order detail: cancel within 24 hours of ordering ("Refund ₹X (no cancellation fee)"), returns until `return_window_ends_at` (24 hours after delivery), refund charge 5% + GST only on a COD bank refund, "Paid by UPI / Card / ..." | `src/lib/orders.ts`, `src/lib/returns.ts`, `src/lib/paymentMode.ts`, `src/screens/OrdersScreen.tsx`, `OrderScreen.tsx`, `src/components/OrderActions.tsx`, `ReturnSheet.tsx` |
| Order tracker: "Waiting for boutique confirmation", then every step with date and time; one per boutique part on direct orders | `src/lib/orderStatus.ts`, `src/components/OrderStatusTimeline.tsx` |
| Tax invoice ("Lehnga – XS – Black" lines, the CA-approved footer) and credit notes | `src/screens/InvoiceScreen.tsx`, `src/lib/invoiceLine.ts`, `src/components/CreditNoteSheet.tsx` |
| Dates in words, India time, by hand (Hermes' Intl varies by device): "6 Jan 2027", "17 Nov 2026, 10:13 PM IST" | `src/lib/dates.ts` |
| Supabase backend: migrations and edge functions (copied from `Live-Vendor`) | `supabase/` |
| Colours, fonts | `src/theme.ts` |
| App icon, launch screen, deep link filters | `android/app/src/main/res`, `AndroidManifest.xml` |

Screens open by website path: `go('/category/all?sale=1')` from `useGo()` in `src/navigation.tsx`.

## Customers only

The app is for shoppers. A boutique (vendor) or admin account that signs in is signed out straight away with a note to use the website: admins are found with the `has_role` RPC, boutique members in `vendor_members`. There are no seller or admin screens in the app.

## Keeping up with the website

Shopper-side changes on `Live-Vendor` are ported here by hand (the website is React for the browser, the app React Native). Last brought up to date with `Live-Vendor` **4783174 (24 Nov 2026)**: to find what's new since, run `git log 4783174..origin/Live-Vendor` and port what a shopper sees (seller, admin, warehouse and GST-report changes don't apply). Copy `supabase/` over at the same time.

## Backend (`supabase/`)

Copied from the `Live-Vendor` branch, which runs on the live project (`allboutiqs-marketplace-live`). It is shared with the website and the seller/admin areas. Deploy backend changes from **one** branch only (today: `Live-Vendor`) and copy them here, so the two copies don't drift. Never run `supabase db push` from this branch against live without checking it matches `Live-Vendor`.

The app uses: `auth-email-otp` (email codes, adding an email), `submit-complaint`, `accept_terms`, `has_role`, `auth_account_exists`, `contact_taken`, and the `products`, `categories`, `vendors`, `hero_slides`, `platform_settings`, `wishlists`, `orders`, `order_items`, `vendor_orders`, `shipments`, `credit_notes`, `credit_note_lines` tables under their row-level security, and `shiprocket-estimate-delivery` for ship and delivery dates.

## Not built yet

- Product videos (product page, cards, Home banner background): the app has no video player yet (a native dependency); the photos show instead.
- "Recently viewed" and "Complete the look" rails, newsletter sign-up.
- Profile photo upload; adding photos to a review (both possible now that the image picker is in).
- Printing / saving the tax invoice as PDF (the app shows it; the website prints it).
- "Watch & shop" video reels on Home (needs the video player above).
