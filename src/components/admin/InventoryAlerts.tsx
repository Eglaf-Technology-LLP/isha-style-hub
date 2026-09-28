import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLowStockAlerts, StockAlertRow, StockMovementRecord } from "@/hooks/useLowStockAlerts";
import { AlertTriangle, Package, PackageX, Edit2, RefreshCw, History, Layers } from "lucide-react";
import { format } from "date-fns";
import { VendorFilterSelect } from "./VendorFilterSelect";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/PaginationBar";

interface InventoryAlertsProps {
  vendorId?: string;
}

const rowKey = (r: Pick<StockAlertRow, "productId" | "variantId">) => `${r.productId}:${r.variantId ?? ""}`;

export function InventoryAlerts({ vendorId }: InventoryAlertsProps) {
  // A fixed vendorId prop means this is rendered from the vendor's own
  // dashboard - no filter shown, no override possible. With no prop (the
  // admin view), manage an internal filter so the super admin can isolate
  // one vendor's alerts.
  const [internalVendorFilter, setInternalVendorFilter] = useState<string | null>(null);
  const effectiveVendorId = vendorId ?? internalVendorFilter ?? undefined;

  const {
    outOfStockProducts,
    lowStockProducts,
    loading,
    adjustStock,
    setStockTo,
    bulkAdjust,
    updateThreshold,
    fetchHistory,
    refetch,
  } = useLowStockAlerts(effectiveVendorId);

  const [editingRow, setEditingRow] = useState<StockAlertRow | null>(null);
  const [newStock, setNewStock] = useState("");
  const [newThreshold, setNewThreshold] = useState("");
  const [reason, setReason] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDelta, setBulkDelta] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);

  const [historyRow, setHistoryRow] = useState<StockAlertRow | null>(null);
  const [history, setHistory] = useState<StockMovementRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const allRows = [...outOfStockProducts, ...lowStockProducts];
  const totalAlerts = allRows.length;

  // Hooks called unconditionally here (renderTable itself is only invoked
  // when a list is non-empty, so pagination state can't live inside it
  // without breaking the rules of hooks).
  const outOfStockPagination = usePagination(outOfStockProducts, 10);
  const lowStockPagination = usePagination(lowStockProducts, 10);

  const openEdit = (row: StockAlertRow) => {
    setEditingRow(row);
    setNewStock(String(row.stock));
    setNewThreshold(String(row.threshold));
    setReason("");
  };

  const handleUpdateStock = async () => {
    if (!editingRow || newStock === "" || !reason.trim()) return;
    setIsUpdating(true);
    await setStockTo(editingRow, parseInt(newStock, 10), reason.trim());
    setIsUpdating(false);
    setEditingRow(null);
  };

  const handleUpdateThreshold = async () => {
    if (!editingRow || newThreshold === "") return;
    setIsUpdating(true);
    await updateThreshold(editingRow, parseInt(newThreshold, 10));
    setIsUpdating(false);
    setEditingRow(null);
  };

  const toggleSelected = (row: StockAlertRow) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = rowKey(row);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedRows = allRows.filter((r) => selected.has(rowKey(r)));

  const handleBulkApply = async () => {
    if (!bulkDelta || !bulkReason.trim() || selectedRows.length === 0) return;
    setIsUpdating(true);
    await bulkAdjust(selectedRows, parseInt(bulkDelta, 10), bulkReason.trim());
    setIsUpdating(false);
    setSelected(new Set());
    setBulkDelta("");
    setBulkReason("");
    setBulkOpen(false);
  };

  const openHistory = async (row: StockAlertRow) => {
    setHistoryRow(row);
    setHistoryLoading(true);
    const records = await fetchHistory(row.productId, row.variantId);
    setHistory(records);
    setHistoryLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const renderTable = (
    title: string,
    rows: StockAlertRow[],
    destructive: boolean,
    pagination: ReturnType<typeof usePagination<StockAlertRow>>,
  ) => (
    <Card className={destructive ? "border-destructive/50" : "border-warning/50"}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${destructive ? "text-destructive" : "text-warning"}`}>
          {destructive ? <PackageX className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          {title}
        </CardTitle>
        <CardDescription>
          {destructive ? "These items have zero stock and cannot be purchased" : "Items running low on stock"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead className="w-12">#</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-center">Stock</TableHead>
              <TableHead className="text-center">Threshold</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedItems.map((row, idx) => (
              <TableRow key={rowKey(row)}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(rowKey(row))}
                    onCheckedChange={() => toggleSelected(row)}
                  />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {(pagination.page - 1) * pagination.pageSize + idx + 1}
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    {row.images[0] && (
                      <img src={row.images[0]} alt={row.productName} className="h-10 w-10 object-cover rounded" />
                    )}
                    <div>
                      <div>{row.productName}</div>
                      {row.variantName && (
                        <div className="text-xs text-muted-foreground">{row.variantName}</div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{row.sku || "-"}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={row.stock === 0 ? "destructive" : "secondary"}>{row.stock}</Badge>
                </TableCell>
                <TableCell className="text-center">{row.threshold}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => openHistory(row)} title="Stock history">
                      <History className="h-4 w-4" />
                    </Button>
                    <Dialog open={editingRow ? rowKey(editingRow) === rowKey(row) : false} onOpenChange={(o) => !o && setEditingRow(null)}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                          <Edit2 className="h-4 w-4 mr-1" />
                          Update
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>
                            Update Stock - {row.productName}{row.variantName ? ` (${row.variantName})` : ""}
                          </DialogTitle>
                          <DialogDescription>
                            Every change here is recorded in the stock history with the reason you give.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Stock Quantity</Label>
                            <Input type="number" min="0" value={newStock} onChange={(e) => setNewStock(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Reason *</Label>
                            <Textarea
                              placeholder="e.g. Restocked from supplier, damaged units removed..."
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              rows={2}
                            />
                          </div>
                          <div className="space-y-2 pt-2 border-t">
                            <Label>Low Stock Threshold</Label>
                            <div className="flex gap-2">
                              <Input type="number" min="1" value={newThreshold} onChange={(e) => setNewThreshold(e.target.value)} />
                              <Button variant="outline" onClick={handleUpdateThreshold} disabled={isUpdating}>
                                Save
                              </Button>
                            </div>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={handleUpdateStock} disabled={isUpdating || newStock === "" || !reason.trim()}>
                            Update Stock
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <PaginationBar
          page={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={pagination.setPage}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
        />
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {!vendorId && (
        <div className="flex items-center justify-end">
          <VendorFilterSelect value={internalVendorFilter} onChange={setInternalVendorFilter} />
        </div>
      )}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className={outOfStockProducts.length > 0 ? "border-destructive" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
            <PackageX className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{outOfStockProducts.length}</div>
            <p className="text-xs text-muted-foreground">Products need immediate attention</p>
          </CardContent>
        </Card>

        <Card className={lowStockProducts.length > 0 ? "border-warning" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{lowStockProducts.length}</div>
            <p className="text-xs text-muted-foreground">Below threshold</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAlerts}</div>
            <Button variant="ghost" size="sm" className="mt-2 p-0 h-auto" onClick={refetch}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
          </CardContent>
        </Card>
      </div>

      {selected.size > 0 && (
        <Card className="border-primary">
          <CardContent className="pt-6 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Layers className="h-4 w-4 text-primary" />
              {selected.size} item(s) selected
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">Bulk update</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Bulk update {selected.size} item(s)</DialogTitle>
                    <DialogDescription>
                      Applies the same change to every selected item, each logged individually in stock history.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Change in quantity</Label>
                      <Input
                        type="number"
                        placeholder="e.g. 20 to add stock, -5 to remove"
                        value={bulkDelta}
                        onChange={(e) => setBulkDelta(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Reason *</Label>
                      <Textarea
                        placeholder="e.g. New shipment received"
                        value={bulkReason}
                        onChange={(e) => setBulkReason(e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleBulkApply} disabled={isUpdating || !bulkDelta || !bulkReason.trim()}>
                      Apply to {selected.size} item(s)
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      )}

      {outOfStockProducts.length > 0 && renderTable("Out of Stock", outOfStockProducts, true, outOfStockPagination)}
      {lowStockProducts.length > 0 && renderTable("Low Stock", lowStockProducts, false, lowStockPagination)}

      {totalAlerts === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">All inventory levels are healthy!</p>
              <p className="text-sm">No products are currently out of stock or running low.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!historyRow} onOpenChange={(o) => !o && setHistoryRow(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Stock History - {historyRow?.productName}{historyRow?.variantName ? ` (${historyRow.variantName})` : ""}
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No recorded changes yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Change</TableHead>
                    <TableHead className="text-center">Resulting</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((m, idx) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(m.createdAt), "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{m.movementType.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell className={`text-center font-medium ${m.changeQuantity < 0 ? "text-destructive" : "text-green-600"}`}>
                        {m.changeQuantity > 0 ? `+${m.changeQuantity}` : m.changeQuantity}
                      </TableCell>
                      <TableCell className="text-center">{m.resultingQuantity}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.reason || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
