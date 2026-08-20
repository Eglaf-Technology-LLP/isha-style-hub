import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface VendorCategoryStat {
  categoryId: string;
  categoryName: string;
  revenue: number;
  quantity: number;
}

export interface VendorPerformance {
  id: string;
  name: string;
  slug: string;
  status: string;
  isTrusted: boolean;
  rating: number;
  activeProductCount: number;
  pendingProductCount: number;
  paidOrderCount: number;
  pendingOrderCount: number;
  grossRevenue: number;
  commissionEarned: number;
  netPayable: number;
  topCategories: VendorCategoryStat[];
  lastOrderAt: string | null;
}

// Strategic per-vendor rollup for the super admin: revenue, commission, catalog
// activity and best-selling category per vendor, so vendors can be compared
// and ranked rather than only managed one at a time (VendorManagement.tsx).
export function useVendorPerformance(isAdmin: boolean = false) {
  const [vendors, setVendors] = useState<VendorPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      fetchPerformance();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  const fetchPerformance = async () => {
    setLoading(true);
    try {
      const [vendorsRes, vendorOrdersRes, orderItemsRes, productsRes, categoriesRes] =
        await Promise.all([
          supabase
            .from("vendors")
            .select("id, name, slug, status, is_trusted, rating"),
          supabase
            .from("vendor_orders")
            .select(
              "vendor_id, subtotal, shipping_cost, commission_amount, net_payable, created_at, order:orders(payment_status)"
            ),
          supabase
            .from("order_items")
            .select("vendor_id, product_id, quantity, price, order:orders(payment_status)")
            .not("vendor_id", "is", null),
          supabase.from("products").select("id, vendor_id, category_id, approval_status, is_active"),
          supabase.from("categories").select("id, name"),
        ]);

      if (vendorsRes.error) throw vendorsRes.error;
      if (vendorOrdersRes.error) throw vendorOrdersRes.error;
      if (orderItemsRes.error) throw orderItemsRes.error;
      if (productsRes.error) throw productsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      const categoryNameById = new Map(
        (categoriesRes.data || []).map((c) => [c.id, c.name])
      );
      const categoryIdByProductId = new Map(
        (productsRes.data || []).map((p) => [p.id, p.category_id])
      );

      const orderPaymentStatus = (order: unknown): string | undefined => {
        const o = Array.isArray(order) ? order[0] : order;
        return (o as { payment_status?: string } | null)?.payment_status;
      };

      const results: VendorPerformance[] = (vendorsRes.data || []).map((vendor) => {
        const ownVendorOrders = (vendorOrdersRes.data || []).filter(
          (vo) => vo.vendor_id === vendor.id
        );
        const paidVendorOrders = ownVendorOrders.filter(
          (vo) => orderPaymentStatus(vo.order) === "paid"
        );
        const pendingOrderCount = ownVendorOrders.filter(
          (vo) => orderPaymentStatus(vo.order) === "pending"
        ).length;

        const grossRevenue = paidVendorOrders.reduce(
          (sum, vo) => sum + Number(vo.subtotal || 0) + Number(vo.shipping_cost || 0),
          0
        );
        const commissionEarned = paidVendorOrders.reduce(
          (sum, vo) => sum + Number(vo.commission_amount || 0),
          0
        );
        const netPayable = paidVendorOrders.reduce(
          (sum, vo) => sum + Number(vo.net_payable || 0),
          0
        );
        const lastOrderAt = ownVendorOrders.reduce<string | null>((latest, vo) => {
          if (!vo.created_at) return latest;
          return !latest || vo.created_at > latest ? vo.created_at : latest;
        }, null);

        const ownProducts = (productsRes.data || []).filter(
          (p) => p.vendor_id === vendor.id
        );
        const activeProductCount = ownProducts.filter(
          (p) => p.is_active && p.approval_status === "approved"
        ).length;
        const pendingProductCount = ownProducts.filter(
          (p) => p.approval_status === "pending"
        ).length;

        const categoryTotals = new Map<string, VendorCategoryStat>();
        (orderItemsRes.data || [])
          .filter(
            (item) => item.vendor_id === vendor.id && orderPaymentStatus(item.order) === "paid"
          )
          .forEach((item) => {
            const categoryId = categoryIdByProductId.get(item.product_id) || "uncategorized";
            const categoryName = categoryNameById.get(categoryId) || "Uncategorized";
            const existing = categoryTotals.get(categoryId) || {
              categoryId,
              categoryName,
              revenue: 0,
              quantity: 0,
            };
            existing.revenue += Number(item.price || 0) * item.quantity;
            existing.quantity += item.quantity;
            categoryTotals.set(categoryId, existing);
          });
        const topCategories = Array.from(categoryTotals.values())
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 3);

        return {
          id: vendor.id,
          name: vendor.name,
          slug: vendor.slug,
          status: vendor.status,
          isTrusted: vendor.is_trusted,
          rating: Number(vendor.rating || 0),
          activeProductCount,
          pendingProductCount,
          paidOrderCount: paidVendorOrders.length,
          pendingOrderCount,
          grossRevenue,
          commissionEarned,
          netPayable,
          topCategories,
          lastOrderAt,
        };
      });

      results.sort((a, b) => b.grossRevenue - a.grossRevenue);
      setVendors(results);
    } catch (error: any) {
      console.error("Error fetching vendor performance:", error);
      toast.error("Failed to fetch vendor performance");
    } finally {
      setLoading(false);
    }
  };

  return { vendors, loading, refetch: fetchPerformance };
}
