import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ShieldCheck, Star, TrendingUp } from "lucide-react";
import { useVendorPerformance, VendorPerformance } from "@/hooks/useVendorPerformance";
import { format } from "date-fns";

export function VendorPerformanceAnalytics() {
  const { vendors, loading } = useVendorPerformance(true);
  const [detailVendor, setDetailVendor] = useState<VendorPerformance | null>(null);

  const statusBadge = (s: string) => {
    const variant =
      s === "approved" ? "secondary" : s === "rejected" || s === "suspended" ? "destructive" : "outline";
    return (
      <Badge variant={variant as any} className="capitalize">
        {s}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Vendor Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : vendors.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No vendors yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Gross Revenue</TableHead>
                  <TableHead>Commission Earned</TableHead>
                  <TableHead>Top Category</TableHead>
                  <TableHead>Last Order</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((v, idx) => (
                  <TableRow key={v.id}>
                    <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium flex items-center gap-1">
                        {v.name}
                        {v.isTrusted && (
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {statusBadge(v.status)}
                        {v.rating > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            {v.rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {v.activeProductCount} active
                      {v.pendingProductCount > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {v.pendingProductCount} pending approval
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {v.paidOrderCount} paid
                      {v.pendingOrderCount > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {v.pendingOrderCount} pending
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      ₹{v.grossRevenue.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-primary font-medium">
                      ₹{v.commissionEarned.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {v.topCategories[0] ? (
                        <Badge variant="outline">{v.topCategories[0].categoryName}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No sales yet</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {v.lastOrderAt ? format(new Date(v.lastOrderAt), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDetailVendor(v)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!detailVendor} onOpenChange={(o) => !o && setDetailVendor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailVendor?.name} - Performance Detail</DialogTitle>
          </DialogHeader>
          {detailVendor && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Gross Revenue</p>
                  <p className="text-lg font-bold">₹{detailVendor.grossRevenue.toFixed(2)}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Commission Earned</p>
                  <p className="text-lg font-bold text-primary">
                    ₹{detailVendor.commissionEarned.toFixed(2)}
                  </p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Net Payable to Vendor</p>
                  <p className="text-lg font-bold">₹{detailVendor.netPayable.toFixed(2)}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Paid / Pending Orders</p>
                  <p className="text-lg font-bold">
                    {detailVendor.paidOrderCount} / {detailVendor.pendingOrderCount}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Top categories by revenue</p>
                {detailVendor.topCategories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No paid sales yet.</p>
                ) : (
                  <div className="space-y-1">
                    {detailVendor.topCategories.map((c) => (
                      <div
                        key={c.categoryId}
                        className="flex justify-between text-sm p-2 rounded bg-muted/50"
                      >
                        <span>{c.categoryName}</span>
                        <span className="text-muted-foreground">
                          ₹{c.revenue.toFixed(2)} · {c.quantity} units
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
