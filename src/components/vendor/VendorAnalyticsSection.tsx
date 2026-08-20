import { useState } from "react";
import { useVendorAnalytics } from "@/hooks/useVendorAnalytics";
import { AnalyticsCharts, DateRange } from "@/components/admin/AnalyticsCharts";

interface Props {
  vendorId: string;
}

export function VendorAnalyticsSection({ vendorId }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const { data, loading } = useVendorAnalytics(vendorId, dateRange);

  return (
    <AnalyticsCharts
      title="Your Sales Analytics"
      revenueLabel="Your Revenue"
      data={data}
      loading={loading}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
    />
  );
}
