import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  TrendingUp,
  Tag,
  Zap,
  Gift,
  Percent,
  DollarSign,
  Users,
  Target,
} from "lucide-react";
import { useDiscounts } from "@/hooks/useDiscounts";
import { useFlashSales } from "@/hooks/useFlashSales";
import { useGiftCards } from "@/hooks/useGiftCards";
import { useOrders } from "@/hooks/useOrders";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function PromotionAnalytics() {
  const { discounts } = useDiscounts();
  const { flashSales, activeFlashSales } = useFlashSales(true);
  const { myGiftCards } = useGiftCards();
  const { orders } = useOrders(true);

  // Calculate discount metrics
  const discountMetrics = useMemo(() => {
    const activeDiscounts = discounts.filter((d) => d.is_active);
    const totalUsage = discounts.reduce((sum, d) => sum + d.used_count, 0);
    const avgUsage = discounts.length > 0 ? totalUsage / discounts.length : 0;
    
    // Estimate revenue impact (discount value * usage)
    const estimatedSavings = discounts.reduce((sum, d) => {
      if (d.discount_type === "percentage") {
        // Assume average order value of ₹2000 for percentage discounts
        return sum + (d.used_count * 2000 * d.discount_value) / 100;
      }
      return sum + d.used_count * d.discount_value;
    }, 0);

    return {
      total: discounts.length,
      active: activeDiscounts.length,
      totalUsage,
      avgUsage: avgUsage.toFixed(1),
      estimatedSavings,
    };
  }, [discounts]);

  // Calculate flash sale metrics
  const flashSaleMetrics = useMemo(() => {
    const totalProducts = flashSales.reduce(
      (sum, sale) => sum + (sale.product_ids?.length || 0),
      0
    );
    const avgDiscount =
      flashSales.length > 0
        ? flashSales.reduce((sum, sale) => sum + sale.discount_percentage, 0) /
          flashSales.length
        : 0;

    return {
      total: flashSales.length,
      active: activeFlashSales.length,
      totalProducts,
      avgDiscount: avgDiscount.toFixed(0),
    };
  }, [flashSales, activeFlashSales]);

  // Calculate gift card metrics
  const giftCardMetrics = useMemo(() => {
    const totalBalance = myGiftCards.reduce(
      (sum, gc) => sum + gc.initial_balance,
      0
    );
    const usedBalance = myGiftCards.reduce(
      (sum, gc) => sum + (gc.initial_balance - gc.current_balance),
      0
    );
    const activeCards = myGiftCards.filter((gc) => gc.is_active && gc.current_balance > 0);

    return {
      total: myGiftCards.length,
      active: activeCards.length,
      totalValue: totalBalance,
      usedValue: usedBalance,
      redemptionRate: totalBalance > 0 ? ((usedBalance / totalBalance) * 100).toFixed(1) : 0,
    };
  }, [myGiftCards]);

  // Discount usage chart data
  const discountUsageData = useMemo(() => {
    return discounts
      .filter((d) => d.used_count > 0)
      .sort((a, b) => b.used_count - a.used_count)
      .slice(0, 8)
      .map((d) => ({
        name: d.code.length > 10 ? d.code.slice(0, 10) + "..." : d.code,
        uses: d.used_count,
        type: d.discount_type,
      }));
  }, [discounts]);

  // Promotion type distribution
  const promotionTypeData = useMemo(() => {
    const percentageDiscounts = discounts.filter(
      (d) => d.discount_type === "percentage"
    ).length;
    const fixedDiscounts = discounts.filter(
      (d) => d.discount_type === "fixed_amount"
    ).length;

    return [
      { name: "Percentage Off", value: percentageDiscounts, type: "percentage" },
      { name: "Fixed Amount", value: fixedDiscounts, type: "fixed" },
      { name: "Flash Sales", value: flashSales.length, type: "flash" },
      { name: "Gift Cards", value: myGiftCards.length, type: "gift" },
    ].filter((item) => item.value > 0);
  }, [discounts, flashSales, myGiftCards]);

  // Order conversion data
  const orderMetrics = useMemo(() => {
    const totalOrders = orders.length;
    // Rough estimate - orders with discounts would have lower totals
    const avgOrderValue = orders.length > 0
      ? orders.reduce((sum, o) => sum + o.total, 0) / orders.length
      : 0;

    return {
      totalOrders,
      avgOrderValue: avgOrderValue.toFixed(0),
    };
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Tag className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{discountMetrics.total}</p>
                <p className="text-sm text-muted-foreground">Total Discounts</p>
              </div>
            </div>
            <div className="mt-2">
              <Badge variant="outline" className="text-xs">
                {discountMetrics.active} active
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <Zap className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{flashSaleMetrics.total}</p>
                <p className="text-sm text-muted-foreground">Flash Sales</p>
              </div>
            </div>
            <div className="mt-2">
              <Badge variant="outline" className="text-xs">
                {flashSaleMetrics.active} running
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-chart-3/10 rounded-lg">
                <Gift className="h-5 w-5 text-chart-3" />
              </div>
              <div>
                <p className="text-2xl font-bold">{giftCardMetrics.total}</p>
                <p className="text-sm text-muted-foreground">Gift Cards</p>
              </div>
            </div>
            <div className="mt-2">
              <Badge variant="outline" className="text-xs">
                ₹{giftCardMetrics.totalValue.toLocaleString()} issued
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-chart-4/10 rounded-lg">
                <Users className="h-5 w-5 text-chart-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{discountMetrics.totalUsage}</p>
                <p className="text-sm text-muted-foreground">Total Redemptions</p>
              </div>
            </div>
            <div className="mt-2">
              <Badge variant="outline" className="text-xs">
                ~{discountMetrics.avgUsage} avg/discount
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Impact */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="h-6 w-6 text-primary" />
              <CardTitle className="text-lg">Estimated Savings Given</CardTitle>
            </div>
            <p className="text-3xl font-bold text-primary">
              ₹{discountMetrics.estimatedSavings.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Total discount value redeemed by customers
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-chart-2/5 to-chart-2/10 border-chart-2/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="h-6 w-6 text-chart-2" />
              <CardTitle className="text-lg">Avg Order Value</CardTitle>
            </div>
            <p className="text-3xl font-bold text-chart-2">
              ₹{orderMetrics.avgOrderValue}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Across {orderMetrics.totalOrders} total orders
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-chart-3/5 to-chart-3/10 border-chart-3/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <Percent className="h-6 w-6 text-chart-3" />
              <CardTitle className="text-lg">Avg Flash Sale Discount</CardTitle>
            </div>
            <p className="text-3xl font-bold text-chart-3">
              {flashSaleMetrics.avgDiscount}%
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {flashSaleMetrics.totalProducts} products in sales
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Discount Usage Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Top Discount Codes by Usage
            </CardTitle>
            <CardDescription>
              Most redeemed discount codes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {discountUsageData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={discountUsageData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={80}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar
                    dataKey="uses"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No discount usage data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Promotion Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Promotion Type Distribution
            </CardTitle>
            <CardDescription>
              Breakdown of all promotion types
            </CardDescription>
          </CardHeader>
          <CardContent>
            {promotionTypeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={promotionTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {promotionTypeData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No promotions created yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Active Promotions Overview</CardTitle>
          <CardDescription>Currently running promotions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {discounts.filter((d) => d.is_active).length === 0 &&
              activeFlashSales.length === 0 && (
                <p className="text-muted-foreground text-center py-8">
                  No active promotions at the moment
                </p>
              )}

            {discounts
              .filter((d) => d.is_active)
              .slice(0, 5)
              .map((discount) => (
                <div
                  key={discount.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Tag className="h-4 w-4 text-primary" />
                    <div>
                      <p className="font-medium">{discount.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Code: {discount.code}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary">
                      {discount.discount_type === "percentage"
                        ? `${discount.discount_value}% OFF`
                        : `₹${discount.discount_value} OFF`}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {discount.used_count} uses
                    </p>
                  </div>
                </div>
              ))}

            {activeFlashSales.slice(0, 3).map((sale) => (
              <div
                key={sale.id}
                className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg border border-destructive/20"
              >
                <div className="flex items-center gap-3">
                  <Zap className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="font-medium">{sale.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {sale.product_ids?.length || 0} products
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="destructive">
                    {sale.discount_percentage}% OFF
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ends: {new Date(sale.ends_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
