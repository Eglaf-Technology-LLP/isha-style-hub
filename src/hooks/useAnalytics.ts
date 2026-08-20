import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, startOfWeek, startOfMonth, subDays, format, parseISO } from "date-fns";

interface DailySales {
  date: string;
  revenue: number;
  orders: number;
}

interface ProductSales {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
}

interface CategoryPerformance {
  categoryId: string;
  categoryName: string;
  revenue: number;
  orders: number;
}

interface AnalyticsData {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  dailySales: DailySales[];
  topProducts: ProductSales[];
  categoryPerformance: CategoryPerformance[];
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  revenueGrowth: number;
  ordersGrowth: number;
}

export function useAnalytics(dateRange: "7d" | "30d" | "90d" = "30d") {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const dateFilter = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case "7d":
        return subDays(now, 7);
      case "30d":
        return subDays(now, 30);
      case "90d":
        return subDays(now, 90);
      default:
        return subDays(now, 30);
    }
  }, [dateRange]);

  const previousPeriodStart = useMemo(() => {
    const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
    return subDays(dateFilter, days);
  }, [dateFilter, dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      // Fetch orders within date range
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .gte("created_at", dateFilter.toISOString());

      if (ordersError) throw ordersError;

      // Fetch previous period orders for growth calculation
      const { data: previousOrders, error: prevError } = await supabase
        .from("orders")
        .select("*")
        .gte("created_at", previousPeriodStart.toISOString())
        .lt("created_at", dateFilter.toISOString());

      if (prevError) throw prevError;

      // Fetch order items for top products
      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .gte("created_at", dateFilter.toISOString());

      if (itemsError) throw itemsError;

      // Fetch categories
      const { data: categories } = await supabase
        .from("categories")
        .select("id, name");

      // Fetch products for category mapping
      const { data: products } = await supabase
        .from("products")
        .select("id, name, category_id");

      // Calculate metrics. payment_status is 'pending'|'paid'|'failed'|'refunded' -
      // there is no 'completed' value in the DB constraint, so filtering on it
      // silently zeroed out revenue/dailySales/growth for all real data.
      const paidOrders = orders?.filter(o => o.payment_status === "paid") || [];
      const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total), 0);
      const totalOrders = orders?.length || 0;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Previous period metrics
      const prevPaidOrders = previousOrders?.filter(o => o.payment_status === "paid") || [];
      const prevRevenue = prevPaidOrders.reduce((sum, o) => sum + Number(o.total), 0);
      const prevTotalOrders = previousOrders?.length || 0;

      // Growth calculations
      const revenueGrowth = prevRevenue > 0 
        ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 
        : 0;
      const ordersGrowth = prevTotalOrders > 0 
        ? ((totalOrders - prevTotalOrders) / prevTotalOrders) * 100 
        : 0;

      // Daily sales aggregation
      const salesByDate: Record<string, DailySales> = {};
      paidOrders.forEach(order => {
        const date = format(parseISO(order.created_at), "yyyy-MM-dd");
        if (!salesByDate[date]) {
          salesByDate[date] = { date, revenue: 0, orders: 0 };
        }
        salesByDate[date].revenue += Number(order.total);
        salesByDate[date].orders += 1;
      });
      const dailySales = Object.values(salesByDate).sort((a, b) => a.date.localeCompare(b.date));

      // Top products
      const productSales: Record<string, ProductSales> = {};
      orderItems?.forEach(item => {
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

      // Category performance
      const categoryMap = new Map(categories?.map(c => [c.id, c.name]) || []);
      const productCategoryMap = new Map(products?.map(p => [p.id, p.category_id]) || []);
      
      const catPerf: Record<string, CategoryPerformance> = {};
      orderItems?.forEach(item => {
        const catId = productCategoryMap.get(item.product_id) || "uncategorized";
        const catName = categoryMap.get(catId) || "Uncategorized";
        if (!catPerf[catId]) {
          catPerf[catId] = {
            categoryId: catId,
            categoryName: catName,
            revenue: 0,
            orders: 0,
          };
        }
        catPerf[catId].revenue += Number(item.price) * item.quantity;
        catPerf[catId].orders += 1;
      });
      const categoryPerformance = Object.values(catPerf).sort((a, b) => b.revenue - a.revenue);

      // Order status counts
      const pendingOrders = orders?.filter(o => o.order_status === "pending").length || 0;
      const completedCount = orders?.filter(o => o.order_status === "delivered").length || 0;
      const cancelledOrders = orders?.filter(o => o.order_status === "cancelled").length || 0;

      setData({
        totalRevenue,
        totalOrders,
        averageOrderValue,
        dailySales,
        topProducts,
        categoryPerformance,
        pendingOrders,
        completedOrders: completedCount,
        cancelledOrders,
        revenueGrowth,
        ordersGrowth,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, refetch: fetchAnalytics };
}
