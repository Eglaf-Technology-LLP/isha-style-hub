// Shared by the boutique's and the admin's product pages.

// Every column the product form reads, for loading products to show or edit.
export const VENDOR_PRODUCT_COLUMNS =
  "id, vendor_id, name, price, product_value, compare_at_value, stock_quantity, is_active, approval_status, images, description, category_id, compare_at_price, sku, weight_grams, length_cm, breadth_cm, height_cm, specifications, country_of_origin, net_quantity, is_returnable, cod_available, prep_days, made_to_order, customisable, customisation_options, custom_size_price, customisation_days, ai_content_status, ai_original_photo_paths, video_url, video_is_primary, video_position, video_status, product_variants(*)";

export const listingReviewNote = (isTrusted: boolean) =>
  isTrusted
    ? "As a trusted partner your listings go live immediately."
    : "New and edited listings are reviewed by the marketplace team before going live.";
