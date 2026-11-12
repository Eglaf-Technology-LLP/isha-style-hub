// Where a product's video sits among its photos, for shoppers.
// video_position = photos shown before the video (0 = video first, null =
// after the photos); older products only have video_is_primary.

export interface ProductVideoFields {
  video_url?: string | null;
  video_status?: string | null;
  video_is_primary?: boolean | null;
  video_position?: number | null;
}

export interface VideoSlot {
  url: string;
  position: number | null;
}

// The video shoppers may see (approved only), or null.
export function shopperVideo(p: ProductVideoFields | null | undefined): VideoSlot | null {
  if (!p?.video_url || p.video_status !== "approved") return null;
  return { url: p.video_url, position: p.video_position ?? (p.video_is_primary ? 0 : null) };
}

// "Show video first": the video leads, on the product page and on cards.
export const videoFirst = (p: ProductVideoFields | null | undefined) => shopperVideo(p)?.position === 0;
