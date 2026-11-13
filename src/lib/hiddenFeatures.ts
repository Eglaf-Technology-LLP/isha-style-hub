// Switches for parts of the site the client asked to hide (2026-11-09).
// true = shown, false = hidden; nothing is deleted either way. On
// 2026-11-13 the client hid another batch in one go (banner dates, e-way bill
// settings, flash sales, gift cards, disputes, the payouts note and fees &
// rates, the warehouse Settings tab, the boutique's detailed GST reports) -
// set those back to true to show them again.
//
// Hiding only changes what's on screen: saved values stay as they are and
// keep working. A super admin (user_roles 'super_admin', next to 'admin')
// sees every hidden admin, warehouse and report screen anyway - see
// useShown in src/hooks/useSuperAdmin.ts. The shop's own switches (header
// links, product customisation) are the same for everyone.

// Header: only Boutiques opens a menu on hover; the category links just go
// to their page.
export const CATEGORY_HOVER_MENUS_ENABLED = false;
// Header (desktop and phone menu): the "New In" and "Sale" links.
export const NEW_IN_AND_SALE_LINKS_ENABLED = false;

// Admin > Home Banner: the "When it shows" dates. While false, a slide is on
// the home page whenever it's switched on, and saving a slide clears any
// dates it had.
export const BANNER_SCHEDULE_ENABLED = false;

// Admin > Returns: the "Return settings" card.
export const RETURN_SETTINGS_ENABLED = true;

// Admin > E-way bills: the Settings tab.
export const EWAY_BILL_SETTINGS_ENABLED = false;

// Admin > Promotions: the "Shipping charge to customers" card and the Flash
// Sales and Gift Cards tabs. The shipping card is off (client, 13 Nov 2026):
// delivery is free for customers and the boutique pays a fixed courier charge
// per piece, so the boutiques' flat shipping / free-over rates are gone from
// every form - turning the charge back on would bill rates nobody can edit.
export const SHIPPING_CHARGE_CARD_ENABLED = false;
export const FLASH_SALES_TAB_ENABLED = false;
export const GIFT_CARDS_TAB_ENABLED = false;

// Admin > Disputes tab.
export const DISPUTES_TAB_ENABLED = false;

// Admin > Payouts: the "Fees & rates" sub-tab.
export const PAYOUT_RATES_CARD_ENABLED = false;

// Admin > Payouts > Boutique payouts: the "Every Wednesday at 9:30 AM..."
// explanation and the "Online payments reach AllBoutiqs after N working days"
// setting under the heading. While false the saved value stays as it is.
export const PAYOUT_SCHEDULE_NOTE_ENABLED = false;

// Warehouse: the whole Settings tab (admins only). While false a link to it
// opens Incoming, and the saved settings stay as they are.
export const WAREHOUSE_SETTINGS_TAB_ENABLED = false;
// Warehouse > Settings: the Rules, Holidays and Warehouse staff cards (the
// warehouse address always shows).
export const WAREHOUSE_EXTRA_SETTINGS_ENABLED = true;

// Boutique's add / edit product page: the "Returnable" switch (the product's
// return policy). While false: new products are returnable, edits keep what
// the product has; admins still set it in Vendors > Manage Catalogue.
export const VENDOR_RETURNABLE_SWITCH_ENABLED = true;

// Boutique's Store settings: the whole "Shipping & returns" box (flat
// shipping, free over, return window, ready to ship in, return policy, Cash
// on Delivery, accept returns). While false, saving the store leaves those
// as they are.
export const STORE_SHIPPING_RETURNS_ENABLED = true;

// Product customisation (client, 2026-11-13): the "Other customisations,
// each with its own price" list in the product forms, and the shopper's
// "Reference photo" upload on the product page. While false: the forms keep
// any options a product already has without showing them, and shoppers see
// neither the options nor the photo upload - custom size and the note stay.
export const CUSTOMISATION_EXTRA_OPTIONS_ENABLED = false;
export const CUSTOMISATION_REFERENCE_PHOTO_ENABLED = false;

// Boutique's Reports (statement): these GST reports. Admins still see them all.
// While false a boutique gets neither the sections nor their sheets in the
// "all" Excel, nor the "checks don't match" line that points at Checks.
export const VENDOR_GST_DETAIL_REPORTS_ENABLED = false;
export const VENDOR_GST_DETAIL_REPORTS = ["b2cs", "b2cl", "cdnur", "hsn", "docsIssued", "eco", "tcsDocs", "checks"];
