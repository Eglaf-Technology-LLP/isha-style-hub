import { useState } from "react";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useVendorAnalytics } from "@/hooks/useVendorAnalytics";
import { AnalyticsCharts, DateRange } from "@/components/admin/AnalyticsCharts";
import { VendorFilterSelect } from "@/components/admin/VendorFilterSelect";

export function SalesAnalyticsDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);

  // "All Vendors" uses the store-wide hook; a specific vendor uses the
  // exact same hook the vendor's own dashboard uses - both return the
  // identical AnalyticsData shape, so AnalyticsCharts never needs to know
  // which one it's looking at.
  const storeAnalytics = useAnalytics(dateRange);
  const vendorAnalytics = useVendorAnalytics(vendorFilter ?? undefined, dateRange);
  const { data, loading } = vendorFilter ? vendorAnalytics : storeAnalytics;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <VendorFilterSelect value={vendorFilter} onChange={setVendorFilter} />
      </div>
      <AnalyticsCharts
        title="Sales Analytics"
        data={data}
        loading={loading}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      />
    </div>
  );
}
