import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StockAlertRow {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  sku: string | null;
  stock: number;
  threshold: number;
  images: string[];
}

export interface StockMovementRecord {
  id: string;
  changeQuantity: number;
  resultingQuantity: number;
  movementType: string;
  reason: string | null;
  referenceOrderId: string | null;
  createdAt: string;
}

// One row per product, or per variant when it has variants. Every size uses
// its product's threshold (1 by default, client 28 Nov 2026 - boutiques keep
// 1-5 pieces). Made to Order listings have no stock to run out of, so they
// never show here.
async function fetchStockAlertRows(vendorId: string | undefined): Promise<StockAlertRow[]> {
  let query = supabase
    .from("products")
    .select("id, name, sku, stock_quantity, low_stock_threshold, images, is_active, product_variants(id, name, sku, stock)")
    .eq("is_active", true)
    .eq("made_to_order", false);

  if (vendorId) {
    query = query.eq("vendor_id", vendorId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching stock alerts:", error);
    throw error;
  }

  const nextRows: StockAlertRow[] = [];
  (data || []).forEach((p) => {
    const images = (p.images as string[]) || [];
    if (p.product_variants && p.product_variants.length > 0) {
      p.product_variants.forEach((v) => {
        nextRows.push({
          productId: p.id,
          variantId: v.id,
          productName: p.name,
          variantName: v.name,
          sku: v.sku,
          stock: v.stock,
          threshold: p.low_stock_threshold,
          images,
        });
      });
    } else {
      nextRows.push({
        productId: p.id,
        variantId: null,
        productName: p.name,
        variantName: null,
        sku: p.sku,
        stock: p.stock_quantity,
        threshold: p.low_stock_threshold,
        images,
      });
    }
  });

  nextRows.sort((a, b) => a.stock - b.stock);
  return nextRows;
}

// Shared by the admin Inventory tab and the vendor dashboard (pass vendorId
// to scope to one vendor's own catalogue) - one implementation of "what's
// low/out of stock" rather than two drifting copies.
// The list is fetched once per scope and shared - the admin page's badge
// and the Inventory tab use the same copy - and kept for 5 minutes. Stock
// changes made here reload it at once. It used to be fetched again on every
// visit to the admin page (~1,250 times on 27 Nov 2026).
// enabled: false waits (e.g. until the boutique's id is known), rather than
// fetching every boutique's products first.
const STOCK_ALERTS_STALE_MS = 5 * 60_000;

export function useLowStockAlerts(vendorId?: string, options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: ["stock-alerts", vendorId ?? "all"],
    enabled: options.enabled ?? true,
    staleTime: STOCK_ALERTS_STALE_MS,
    queryFn: () => fetchStockAlertRows(vendorId),
  });
  const rows = query.data ?? [];
  const loading = query.isPending;
  const { refetch } = query;

  const fetchRows = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const outOfStockRows = rows.filter((r) => r.stock === 0);
  const lowStockRows = rows.filter((r) => r.stock > 0 && r.stock <= r.threshold);

  const adjustStock = async (
    row: Pick<StockAlertRow, "productId" | "variantId">,
    delta: number,
    reason: string,
    movementType: "manual_adjustment" | "restock" | "correction" = "manual_adjustment"
  ): Promise<boolean> => {
    try {
      const { error } = await supabase.rpc("adjust_stock", {
        _product_id: row.productId,
        _variant_id: row.variantId,
        _delta: delta,
        _movement_type: movementType,
        _reason: reason,
        _reference_order_id: null,
      } as any);
      if (error) throw error;
      await fetchRows();
      return true;
    } catch (error: any) {
      console.error("Error adjusting stock:", error);
      toast.error(error.message || "Failed to adjust stock");
      return false;
    }
  };

  const setStockTo = async (
    row: StockAlertRow,
    newQuantity: number,
    reason: string
  ): Promise<boolean> => {
    return adjustStock(row, newQuantity - row.stock, reason);
  };

  const bulkAdjust = async (
    targets: StockAlertRow[],
    delta: number,
    reason: string
  ): Promise<{ succeeded: number; failed: number }> => {
    let succeeded = 0;
    let failed = 0;
    for (const row of targets) {
      const { error } = await supabase.rpc("adjust_stock", {
        _product_id: row.productId,
        _variant_id: row.variantId,
        _delta: delta,
        _movement_type: "manual_adjustment",
        _reason: reason,
        _reference_order_id: null,
      } as any);
      if (error) {
        failed++;
        console.error(`Bulk adjust failed for ${row.productName}:`, error);
      } else {
        succeeded++;
      }
    }
    await fetchRows();
    if (succeeded > 0) toast.success(`Updated stock for ${succeeded} item(s)`);
    if (failed > 0) toast.error(`Failed to update ${failed} item(s) - see console`);
    return { succeeded, failed };
  };

  // Saved on the product, so it applies to all its sizes.
  const updateThreshold = async (row: Pick<StockAlertRow, "productId">, threshold: number): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("products")
        .update({ low_stock_threshold: threshold })
        .eq("id", row.productId);
      if (error) throw error;
      await fetchRows();
      toast.success("Threshold updated");
      return true;
    } catch (error: any) {
      console.error("Error updating threshold:", error);
      toast.error(error.message || "Failed to update threshold");
      return false;
    }
  };

  const fetchHistory = async (
    productId: string,
    variantId: string | null
  ): Promise<StockMovementRecord[]> => {
    try {
      let query = supabase
        .from("stock_movements")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      query = variantId ? query.eq("variant_id", variantId) : query.is("variant_id", null);

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((m) => ({
        id: m.id,
        changeQuantity: m.change_quantity,
        resultingQuantity: m.resulting_quantity,
        movementType: m.movement_type,
        reason: m.reason,
        referenceOrderId: m.reference_order_id,
        createdAt: m.created_at,
      }));
    } catch (error: any) {
      console.error("Error fetching stock history:", error);
      toast.error("Failed to fetch stock history");
      return [];
    }
  };

  return {
    rows,
    outOfStockProducts: outOfStockRows,
    lowStockProducts: lowStockRows,
    loading,
    adjustStock,
    setStockTo,
    bulkAdjust,
    updateThreshold,
    fetchHistory,
    refetch: fetchRows,
    totalAlerts: outOfStockRows.length + lowStockRows.length,
  };
}
