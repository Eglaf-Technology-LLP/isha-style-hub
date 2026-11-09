import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfDay, startOfWeek, startOfMonth, format, parseISO } from "date-fns";
import {
  AnalyticsData,
  AnalyticsGroupBy,
  DailySales,
  ProductSales,
  CategoryPerformance,
} from "@/hooks/useAnalytics";

// Same shape and computation as useAnalytics, scoped to one vendor's own
// vendor_orders/order_items instead of the whole store's orders - "revenue"
// here is this vendor's gross sales (subtotal + shipping), not the platform's.
export function useVendorAnalytics(
  vendorId: string | undefined,
  dateRange: "7d" | "30d" | "90d" = "30d",
  groupBy: AnalyticsGroupBy = "day",
) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const dateFilter = useMemo(() => {
    const now = new Date();
    const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
    return subDays(now, days);
  }, [dateRange]);

  const previousPeriodStart = useMemo(() => {
    const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
    return subDays(dateFilter, days);
  }, [dateFilter, dateRange]);

  useEffect(() => {
    if (vendorId) fetchAnalytics();
  }, [dateRange, groupBy, vendorId]);

  const fetchAnalytics = async () => {
    if (!vendorId) return;
    setLoading(true);
    try {
      const { data: vendorOrders, error: voError } = await supabase
        .from("vendor_orders")
        .select("subtotal, shipping_cost, status, created_at, order:orders(payment_status)")
        .eq("vendor_id", vendorId)
        .gte("created_at", dateFilter.toISOString());
      if (voError) throw voError;

      const { data: prevVendorOrders, error: prevError } = await supabase
        .from("vendor_orders")
        .select("subtotal, shipping_cost, status, order:orders(payment_status)")
        .eq("vendor_id", vendorId)
        .gte("created_at", previousPeriodStart.toISOString())
        .lt("created_at", dateFilter.toISOString());
      if (prevError) throw prevError;

      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .eq("vendor_id", vendorId)
        .gte("created_at", dateFilter.toISOString());
      if (itemsError) throw itemsError;

      const { data: categories } = await supabase.from("categories").select("id, name");
      const { data: products } = await supabase
        .from("products")
        .select("id, name, category_id")
        .eq("vendor_id", vendorId);

      const paymentStatusOf = (order: unknown) => {
        const o = Array.isArray(order) ? order[0] : order;
        return (o as { payment_status?: string } | null)?.payment_status;
      };

      // A cancelled vendor_order's subtotal must not keep counting as revenue -
      // the parent order's own payment_status alone can't catch this (a
      // partial cancellation on a multi-vendor order never moves
      // orders.payment_status off "paid").
      const paidOrders = (vendorOrders || []).filter(
        (vo) => paymentStatusOf(vo.order) === "paid" && vo.status !== "cancelled",
      );
      const orderRevenue = (vo: { subtotal: number; shipping_cost: number }) =>
        Number(vo.subtotal || 0) + Number(vo.shipping_cost || 0);

      const totalRevenue = paidOrders.reduce((sum, vo) => sum + orderRevenue(vo), 0);
      const totalOrders = vendorOrders?.length || 0;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      const prevPaidOrders = (prevVendorOrders || []).filter(
        (vo) => paymentStatusOf(vo.order) === "paid" && vo.status !== "cancelled",
      );
      const prevRevenue = prevPaidOrders.reduce((sum, vo) => sum + orderRevenue(vo), 0);
      const prevTotalOrders = prevVendorOrders?.length || 0;

      const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
      const ordersGrowth =
        prevTotalOrders > 0 ? ((totalOrders - prevTotalOrders) / prevTotalOrders) * 100 : 0;

      const bucketStart = (dateStr: string): Date => {
        const d = parseISO(dateStr);
        if (groupBy === "week") return startOfWeek(d);
        if (groupBy === "month") return startOfMonth(d);
        return startOfDay(d);
      };

      const salesByDate: Record<string, DailySales> = {};
      paidOrders.forEach((vo) => {
        const date = format(bucketStart(vo.created_at), "yyyy-MM-dd");
        if (!salesByDate[date]) salesByDate[date] = { date, revenue: 0, orders: 0 };
        salesByDate[date].revenue += orderRevenue(vo);
        salesByDate[date].orders += 1;
      });
      const dailySales = Object.values(salesByDate).sort((a, b) => a.date.localeCompare(b.date));

      const productSales: Record<string, ProductSales> = {};
      orderItems?.forEach((item) => {
        const key = item.product_id;
        if (!productSales[key]) {
          productSales[key] = {
            productId: item.product_id,
            productName: item.product_title,
            quantity: 0,
            revenue: 0,
          };
        }
        productSales[key].quantity += item.quantity;
        productSales[key].revenue += Number(item.price) * item.quantity;
      });
      const topProducts = Object.values(productSales)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      const categoryMap = new Map(categories?.map((c) => [c.id, c.name]) || []);
      const productCategoryMap = new Map(products?.map((p) => [p.id, p.category_id]) || []);

      const catPerf: Record<string, CategoryPerformance> = {};
      orderItems?.forEach((item) => {
        const catId = productCategoryMap.get(item.product_id) || "uncategorized";
        const catName = categoryMap.get(catId) || "Uncategorized";
        if (!catPerf[catId]) {
          catPerf[catId] = { categoryId: catId, categoryName: catName, revenue: 0, orders: 0 };
        }
        catPerf[catId].revenue += Number(item.price) * item.quantity;
        catPerf[catId].orders += 1;
      });
      const categoryPerformance = Object.values(catPerf).sort((a, b) => b.revenue - a.revenue);

      const pendingOrders = vendorOrders?.filter((vo) => vo.status === "pending").length || 0;
      const completedOrders = vendorOrders?.filter((vo) => vo.status === "delivered").length || 0;
      const cancelledOrders = vendorOrders?.filter((vo) => vo.status === "cancelled").length || 0;

      setData({
        totalRevenue,
        totalOrders,
        averageOrderValue,
        dailySales,
        topProducts,
        categoryPerformance,
        pendingOrders,
        completedOrders,
        cancelledOrders,
        revenueGrowth,
        ordersGrowth,
      });
    } catch (error) {
      console.error("Error fetching vendor analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, refetch: fetchAnalytics };
}
