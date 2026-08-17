# Multi-Vendor Marketplace for Isha Fashion Hub

Turn the current single-store app into a marketplace where independent vendors register, run their own store back-office, and publish products to one shared storefront — with a super admin who oversees and can act on behalf of any vendor.

## Roles

| Role | Scope |
| --- | --- |
| Super Admin | Everything: all vendors, all products, orders, categories, payouts. Can impersonate/act on behalf of a vendor. |
| Vendor Owner | Full control of their own store: products, inventory, orders, analytics, profile, payouts. |
| Vendor Staff (optional, phase 2) | Same store, limited to products + orders. |
| Customer | Shops across all vendors. |

Roles stay in the existing `user_roles` table (extended with `vendor_admin`, `vendor_staff`), plus a `vendor_members` table linking a user to a vendor. No role data ever lives on profiles.

## Data model additions

- **vendors** — store name, slug, logo, banner, description, contact, GST/PAN, address, status (`pending` / `approved` / `suspended` / `rejected`), `is_trusted` flag, commission rate, shipping rules (flat rate, free-shipping threshold), return window + policy text, payout account status, rating, approved_by, approved_at.
- **vendor_members** — user_id, vendor_id, role (owner/staff). Determines "which store am I in".
- **vendor_payouts** — vendor_id, period, gross sales, commission, net payable, status, paid_at.
- **vendor_applications** (or reuse `vendors.status = pending`) — registration submissions the super admin reviews.

- **products** — add `vendor_id`, `approval_status` (`draft` / `pending_review` / `approved` / `rejected`), `rejection_reason`.
- **orders** — customers can buy from several vendors in one checkout, so orders split: keep `orders` as the customer-facing order, add **vendor_orders** (order_id, vendor_id, subtotal, shipping, commission, status, tracking). Each vendor sees and fulfils only their portion.
- **order_items** — add `vendor_id` and `vendor_order_id`.
- Existing rows: all current products/orders get assigned to a seed "Isha Fashion Hub" vendor so nothing breaks.

## Access rules (RLS)

- A security-definer helper `is_vendor_member(user_id, vendor_id)` plus the existing `has_role()` avoid recursive policy errors.
- Vendors read/write only rows where `vendor_id` is one of their memberships.
- Super admin bypasses via `has_role(auth.uid(), 'admin')` on every vendor-scoped table — this is what lets them act on a vendor's behalf.
- Public storefront reads only `is_active = true AND approval_status = 'approved' AND vendor.status = 'approved'`.
- Every new table gets explicit grants alongside its policies.

## Screens

**Vendor onboarding**
- `/sell-with-us` — marketing page + application form (store details, category, documents).
- `/vendor/pending` — status screen while under review.

**Vendor dashboard** `/vendor` — same infrastructure as today's admin, scoped to one store:
- Products (CRUD, variants, images, stock) with approval status badges
- Orders (their vendor_orders only, status + tracking updates)
- Inventory & low-stock alerts
- Promotions (discounts/flash sales limited to their own products)
- Analytics (their revenue, top products, category performance)
- Returns for their items
- Store profile & payout summary

**Super admin** — the existing `/admin`, extended:
- Vendors tab: approve/reject/suspend applications, edit any store, set commission
- "Manage as vendor" — opens the vendor dashboard in the context of that store, so the super admin can add products or fix anything for a vendor
- Product moderation queue across all vendors
- Global categories (only super admin creates categories; vendors pick from them)
- Marketplace-wide analytics + payouts report

**Storefront**
- Vendor name/link on product cards and product pages
- `/store/:slug` vendor storefront page (branding, their catalog, rating)
- Filter by vendor; cart and checkout group items by vendor
- Order confirmation and account order history show per-vendor shipments

## Build order

1. Schema + roles + RLS + backfill existing data into a seed vendor.
2. Vendor registration flow and super admin approval queue.
3. Vendor dashboard: products and inventory (reuse existing admin components, scoped by vendor).
4. Order splitting: checkout writes vendor_orders; vendor order management screens.
5. Storefront vendor surfacing: vendor badge, store pages, vendor filter.
6. Super admin: cross-vendor moderation, "manage as vendor", marketplace analytics.
7. Commissions and payout reporting.
8. Emails: application approved/rejected, new order to vendor, payout statement.

## Technical notes

- Reuse the existing admin components rather than duplicating them: they take a `vendorId` prop, resolved from the current user's membership or, for the super admin, from the store they're managing.
- A `useVendorContext` hook resolves the active vendor and whether the viewer is acting as super admin.
- Checkout, cart totals, shipping thresholds and discounts need vendor-aware recalculation (free shipping and promotions apply per vendor, not per cart).
- Commission is stored per vendor and snapshotted onto `vendor_orders` at order time so later rate changes don't rewrite history.

## Decisions

**Payments — split per vendor at checkout**
- Each vendor connects their own payout account; funds go to the vendor at purchase time, with the platform commission taken as an application fee.
- A multi-vendor cart creates one payment per vendor portion, grouped under a single customer order, so a failure in one vendor's leg doesn't block the others.
- COD stays available and is settled per vendor in the payout report.
- Vendors that haven't finished payment onboarding can't publish products.

**Shipping & returns — vendor-controlled**
- Each vendor sets their own shipping rules (flat rate, free-shipping threshold, per-region charges) and their own return window and policy text.
- Cart and checkout calculate shipping per vendor group and show a per-vendor breakdown before the grand total.
- Product pages show that vendor's delivery and returns terms instead of the fixed "₹999 free delivery / 7-day returns" block.
- Return requests route to the owning vendor; the super admin can override any decision.

**Product approval — trusted-partner toggle**
- `vendors.is_trusted` flag, controlled only by the super admin.
- Trusted vendor: products publish immediately on save.
- Untrusted vendor: products go to `pending_review` and appear in the super admin moderation queue, where they're approved or rejected with a reason.
- Toggling a vendor to trusted auto-approves their pending items; toggling off applies only to future products.

