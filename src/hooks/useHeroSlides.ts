import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type { HeroSlide } from "@/content/storefront";

// Home page hero carousel, edited under Admin > Home Banner (table
// hero_slides). Shoppers only ever receive live slides - the RLS policy
// filters on is_active and the schedule - while admins see every slide.

export type HeroSlideRow = Tables<"hero_slides">;
export type HeroSlideInput = Omit<TablesInsert<"hero_slides">, "id" | "created_at" | "updated_at">;

const STOREFRONT_KEY = ["storefront", "hero-slides"] as const;
const ADMIN_KEY = ["admin", "hero-slides"] as const;

const clean = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : undefined;
};

export function toHeroSlide(row: HeroSlideRow): HeroSlide {
  const ctaHref = clean(row.cta_href);
  const secondaryLabel = clean(row.secondary_cta_label);
  const secondaryHref = clean(row.secondary_cta_href);
  return {
    id: row.id,
    eyebrow: clean(row.eyebrow),
    title: clean(row.title),
    titleAccent: clean(row.title_accent),
    subtitle: clean(row.subtitle),
    cta: ctaHref ? { label: clean(row.cta_label), href: ctaHref } : undefined,
    secondaryCta: secondaryLabel && secondaryHref ? { label: secondaryLabel, href: secondaryHref } : undefined,
    image: clean(row.image_url),
    mobileImage: clean(row.mobile_image_url),
    video: clean(row.video_url),
    align: row.align === "center" ? "center" : "left",
    overlay: row.show_overlay,
  };
}

async function fetchSlides(): Promise<HeroSlideRow[]> {
  const { data, error } = await supabase
    .from("hero_slides")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// What the home page shows. The database already drops hidden and
// out-of-schedule slides for shoppers; the check here also covers an admin
// browsing the shop, whose RLS lets every slide through.
export function useHeroSlides() {
  return useQuery({
    queryKey: STOREFRONT_KEY,
    staleTime: 5 * 60 * 1000,
    // One retry only: the hero is the first thing on the page, and on a
    // failure the built-in slides should show within a second or two, not
    // after react-query's default three back-off retries (~7s).
    retry: 1,
    queryFn: async () => (await fetchSlides()).filter(isLiveNow).map(toHeroSlide),
  });
}

export function isLiveNow(row: Pick<HeroSlideRow, "is_active" | "starts_at" | "ends_at">, now = Date.now()): boolean {
  if (!row.is_active) return false;
  if (row.starts_at && new Date(row.starts_at).getTime() > now) return false;
  if (row.ends_at && new Date(row.ends_at).getTime() <= now) return false;
  return true;
}

// Every slide, for the admin list.
export function useAdminHeroSlides() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ADMIN_KEY, queryFn: fetchSlides });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ADMIN_KEY }),
      qc.invalidateQueries({ queryKey: STOREFRONT_KEY }),
    ]);
  };

  const save = async (input: HeroSlideInput, id?: string) => {
    if (id) {
      const { error } = await supabase.from("hero_slides").update(input).eq("id", id);
      if (error) throw error;
    } else {
      const last = (query.data ?? []).reduce((m, s) => Math.max(m, s.position), 0);
      const { error } = await supabase.from("hero_slides").insert({ ...input, position: last + 1 });
      if (error) throw error;
    }
    await refresh();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("hero_slides").delete().eq("id", id);
    if (error) throw error;
    await refresh();
  };

  const setActive = async (id: string, isActive: boolean) => {
    const { error } = await supabase.from("hero_slides").update({ is_active: isActive }).eq("id", id);
    if (error) throw error;
    await refresh();
  };

  // Writes 1..n in the given order, so positions stay tidy however many
  // times slides are moved.
  const reorder = async (orderedIds: string[]) => {
    const results = await Promise.all(
      orderedIds.map((id, i) => supabase.from("hero_slides").update({ position: i + 1 }).eq("id", id)),
    );
    const failed = results.find((r) => r.error);
    await refresh();
    if (failed?.error) throw failed.error;
  };

  return { ...query, save, remove, setActive, reorder };
}
