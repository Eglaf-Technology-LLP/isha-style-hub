// Parts of the site hidden at the client's request (2026-11-09). Nothing is
// deleted: set a switch to true to bring that part back.

// Header: only Boutiques opens a menu on hover; the category links just go
// to their page.
export const CATEGORY_HOVER_MENUS_ENABLED = false;
// Header (desktop and phone menu): the "New In" and "Sale" links.
export const NEW_IN_AND_SALE_LINKS_ENABLED = false;

// Admin > Home Banner: the "When it shows" dates. While hidden, a slide is on
// the home page whenever it's switched on, and saving a slide clears any
// dates it had.
export const BANNER_SCHEDULE_ENABLED = false;

// Admin > Returns: the "Return settings" card.
export const RETURN_SETTINGS_ENABLED = false;

// Admin > E-way bills: the Settings tab.
export const EWAY_BILL_SETTINGS_ENABLED = false;

// Admin > Promotions: the "Shipping charge to customers" card and the Flash
// Sales and Gift Cards tabs.
export const SHIPPING_CHARGE_CARD_ENABLED = false;
export const FLASH_SALES_TAB_ENABLED = false;
export const GIFT_CARDS_TAB_ENABLED = false;

// Admin > Disputes tab.
export const DISPUTES_TAB_ENABLED = false;

// Admin > Payouts: the "Fees, taxes & payout timing" card.
export const PAYOUT_RATES_CARD_ENABLED = false;

// Warehouse > Settings: the Rules, Holidays and Warehouse staff cards (the
// warehouse address stays).
export const WAREHOUSE_EXTRA_SETTINGS_ENABLED = false;

// Boutique's add / edit product page: the "Returnable" switch (the product's
// return policy). New products are returnable, edits keep what the product
// has; admins still set it in Vendors > Manage Catalogue.
export const VENDOR_RETURNABLE_SWITCH_ENABLED = false;
