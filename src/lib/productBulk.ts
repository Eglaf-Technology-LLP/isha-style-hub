import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Bulk actions on product lists (the boutique's own list, Admin > Products,
// Admin > Vendors > Manage Catalogue). Each is the same change the row's own
// switch or delete button makes, applied to many products at once - the
// database's own rules (RLS) still decide which rows a person may change.

export type ProductBulkPatch = { is_active?: boolean; cod_available?: boolean };

export interface ProductBulkResult {
  done: string[];
  failed: number;
  error: string | null;
}

// Long id lists are sent in batches so the request URL stays short.
const BATCH = 100;

async function inBatches(
  ids: string[],
  run: (batch: string[]) => PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>,
): Promise<ProductBulkResult> {
  const done: string[] = [];
  let error: string | null = null;
  for (let i = 0; i < ids.length; i += BATCH) {
    const { data, error: err } = await run(ids.slice(i, i + BATCH));
    if (err) error ??= err.message;
    for (const row of data ?? []) done.push(row.id);
  }
  // A row RLS hides comes back as neither changed nor an error.
  return { done, failed: ids.length - done.length, error };
}

export function updateProducts(ids: string[], patch: ProductBulkPatch): Promise<ProductBulkResult> {
  return inBatches(ids, (batch) => supabase.from("products").update(patch).in("id", batch).select("id"));
}

export function deleteProducts(ids: string[]): Promise<ProductBulkResult> {
  return inBatches(ids, (batch) => supabase.from("products").delete().in("id", batch).select("id"));
}

// Ticked rows of a list. Only rows still shown can stay ticked, so a new
// search or filter never leaves hidden products in the selection.
export function useProductSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const idsKey = visibleIds.join(",");

  useEffect(() => {
    const visible = new Set(idsKey ? idsKey.split(",") : []);
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [idsKey]);

  return useMemo(
    () => ({
      selectedIds: [...selected],
      isSelected: (id: string) => selected.has(id),
      toggle: (id: string, on: boolean) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (on) next.add(id);
          else next.delete(id);
          return next;
        }),
      selectAll: (on: boolean) => setSelected(on ? new Set(idsKey ? idsKey.split(",") : []) : new Set()),
      clear: () => setSelected(new Set()),
    }),
    [selected, idsKey],
  );
}
