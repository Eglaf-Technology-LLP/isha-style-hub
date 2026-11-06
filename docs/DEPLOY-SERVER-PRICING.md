# Deploy: server-side order prices (needed for app checkout)

**Why:** today the website (Live-Vendor) sends every amount itself - item prices, coupon, shipping, COD charge, total and the Razorpay amount - and nothing checks them. A tampered request can pay Rs 1 for a Rs 10,000 order online, or set the COD amount the courier collects. The Android/iOS app uses the same tables, so it must not go live with that hole.

**What it does:** the database re-prices every order from its items (`price_order`), re-checks the coupon, works out shipping per boutique, accepts the COD charge only if it matches a real Shiprocket quote, and `create-razorpay-order` charges the saved order's amount. Only `verify-razorpay-payment` (unchanged) marks an order paid, and only for the Razorpay order id the server stored. Website checkout and app checkout both use this.

**Origin:** commit `e757db1` "Order amounts worked out by the server, not the browser" on `feature/storefront-redesign`. It applies cleanly on `Live-Vendor` - checked: local branch **`live-vendor-server-pricing`** = `Live-Vendor` + that one commit (`0691277`).

## What to deploy (live project `whycxtnjhdbewgyugfax`)

| # | Item | File (on `live-vendor-server-pricing`, also on `storefront-mobile-app`) |
|---|---|---|
| 1 | SQL migration | `supabase/migrations/20261103150000_server_side_order_prices.sql` |
| 2 | Edge function | `supabase/functions/create-razorpay-order/index.ts` (body is now `{ orderId }`, returns `{ razorpayOrderId, amount, currency, keyId }`) |
| 3 | Edge function | `supabase/functions/shiprocket-cod-charge/index.ts` (now records every quote in `cod_charge_quotes`) |
| 4 | Website | `src/pages/Checkout.tsx` from `live-vendor-server-pricing` (calls `create-razorpay-order` with `{ orderId }`, checks the database's total before charging) |

Items 2-4 change the contract between the website and the backend: **deploy 1-4 in one short window.** Between deploying the functions and the website, the old live website's *online* payment fails (COD keeps working). Pick a quiet hour.

Dependencies already on live (checked in Live-Vendor's migrations): `compute_vendor_order_fees`, `enforce_order_item_customisation`, `guard_new_order_payment` / `guard_new_payment` triggers (20261102100000_customer_wallet), `cancel_pending_order`, `apply_wallet_to_order`, `increment_discount_usage`, `pg_cron`, vendor shipping / commission columns, `platform_settings.customer_shipping_enabled`.

## Steps

1. **Back up** the database (Supabase dashboard > Database > Backups, or `pg_dump`).
2. **SQL:** run `supabase/migrations/20261103150000_server_side_order_prices.sql` in the SQL editor, or from branch `live-vendor-server-pricing`:
   ```sh
   supabase link --project-ref whycxtnjhdbewgyugfax
   supabase db push
   ```
   (`db push` also applies any other migration the live database hasn't got - check its list before confirming.)
3. **Functions** (from `live-vendor-server-pricing`):
   ```sh
   supabase functions deploy create-razorpay-order shiprocket-cod-charge --project-ref whycxtnjhdbewgyugfax
   ```
   No new secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, Shiprocket and Supabase secrets are already set.
4. **Website:** merge `live-vendor-server-pricing` into `Live-Vendor` and let Netlify deploy (or deploy that branch).
5. **Smoke test on live** (small, real orders, then cancel them from the order page):
   - COD order with one item: placed, total = items + shipping + COD charge shown at checkout.
   - Online order: Razorpay opens with the same amount; after paying, the order shows Paid.
   - Online order, close the Razorpay window: no order is left (released), stock back.
   - Coupon order: discount matches the checkout screen.
   - Wallet (if a test account has balance): part-wallet online order.
   - In the SQL editor: `select count(*) from cod_charge_quotes;` grows after a COD checkout.

## If something goes wrong

Run `docs/rollback_server_side_order_prices.sql` (drops the new triggers and functions, restores the two guard functions exactly as in 20261102100000_customer_wallet.sql), redeploy `create-razorpay-order` and `shiprocket-cod-charge` from `Live-Vendor`, and redeploy the previous website build. Orders placed meanwhile keep their amounts.

## After this is live

- App checkout (branch `storefront-mobile-app`, `src/lib/checkout.ts`) works against it as is - COD, online (UPI / cards / netbanking via `react-native-razorpay`), wallet, coupons, Buy now.
- Rebuild the app (`npm run apk`): `react-native-razorpay` is a new native module.
- Later hardening (separate change): once no old website build can be running, `create-razorpay-order` is already order-based; consider removing the browser's direct INSERT rights on `orders` / `vendor_orders` / `order_items` in favour of one `place-order` function.

Owner of steps 1-5: whoever has Supabase + Netlify access for the live project. Questions on the code: see the commit message of `e757db1`.
