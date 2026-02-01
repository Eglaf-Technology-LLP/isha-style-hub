import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useLowStockAlerts, LowStockProduct } from "@/hooks/useLowStockAlerts";
import { AlertTriangle, Package, PackageX, Edit2, Plus, RefreshCw } from "lucide-react";

export function InventoryAlerts() {
  const { 
    lowStockProducts, 
    outOfStockProducts, 
    loading, 
    updateThreshold, 
    updateStock,
    refetch 
  } = useLowStockAlerts();

  const [editingProduct, setEditingProduct] = useState<LowStockProduct | null>(null);
  const [newStock, setNewStock] = useState("");
  const [newThreshold, setNewThreshold] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateStock = async () => {
    if (!editingProduct || !newStock) return;
    
    setIsUpdating(true);
    await updateStock(editingProduct.id, parseInt(newStock));
    setIsUpdating(false);
    setEditingProduct(null);
    setNewStock("");
  };

  const handleUpdateThreshold = async () => {
    if (!editingProduct || !newThreshold) return;
    
    setIsUpdating(true);
    await updateThreshold(editingProduct.id, parseInt(newThreshold));
    setIsUpdating(false);
    setEditingProduct(null);
    setNewThreshold("");
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const totalAlerts = lowStockProducts.length + outOfStockProducts.length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className={outOfStockProducts.length > 0 ? "border-destructive" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
            <PackageX className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {outOfStockProducts.length}
            </div>
            <p className="text-xs text-muted-foreground">Products need immediate attention</p>
          </CardContent>
        </Card>

        <Card className={lowStockProducts.length > 0 ? "border-warning" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">
              {lowStockProducts.length}
            </div>
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

      {/* Out of Stock Products */}
      {outOfStockProducts.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <PackageX className="h-5 w-5" />
              Out of Stock Products
            </CardTitle>
            <CardDescription>These products have zero inventory and cannot be purchased</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-center">Stock</TableHead>
                  <TableHead className="text-center">Threshold</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outOfStockProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        {product.images[0] && (
                          <img 
                            src={product.images[0]} 
                            alt={product.name}
                            className="h-10 w-10 object-cover rounded"
                          />
                        )}
                        {product.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {product.sku || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="destructive">0</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {product.low_stock_threshold}
                    </TableCell>
                    <TableCell className="text-right">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setEditingProduct(product);
                              setNewStock("");
                              setNewThreshold(product.low_stock_threshold.toString());
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Stock
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Update Stock - {product.name}</DialogTitle>
                            <DialogDescription>
                              Add new inventory for this product
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="newStock">New Stock Quantity</Label>
                              <Input
                                id="newStock"
                                type="number"
                                min="0"
                                value={newStock}
                                onChange={(e) => setNewStock(e.target.value)}
                                placeholder="Enter quantity"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="threshold">Low Stock Threshold</Label>
                              <Input
                                id="threshold"
                                type="number"
                                min="1"
                                value={newThreshold}
                                onChange={(e) => setNewThreshold(e.target.value)}
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button 
                              onClick={handleUpdateStock} 
                              disabled={isUpdating || !newStock}
                            >
                              Update Stock
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Low Stock Products */}
      {lowStockProducts.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              Low Stock Products
            </CardTitle>
            <CardDescription>Products running low on inventory</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-center">Stock</TableHead>
                  <TableHead className="text-center">Threshold</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        {product.images[0] && (
                          <img 
                            src={product.images[0]} 
                            alt={product.name}
                            className="h-10 w-10 object-cover rounded"
                          />
                        )}
                        {product.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {product.sku || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">
                        {product.stock_quantity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {product.low_stock_threshold}
                    </TableCell>
                    <TableCell className="text-right">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setEditingProduct(product);
                              setNewStock(product.stock_quantity.toString());
                              setNewThreshold(product.low_stock_threshold.toString());
                            }}
                          >
                            <Edit2 className="h-4 w-4 mr-1" />
                            Update
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Update Stock - {product.name}</DialogTitle>
                            <DialogDescription>
                              Adjust inventory and threshold settings
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="updateStock">Stock Quantity</Label>
                              <Input
                                id="updateStock"
                                type="number"
                                min="0"
                                value={newStock}
                                onChange={(e) => setNewStock(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="updateThreshold">Low Stock Threshold</Label>
                              <Input
                                id="updateThreshold"
                                type="number"
                                min="1"
                                value={newThreshold}
                                onChange={(e) => setNewThreshold(e.target.value)}
                              />
                            </div>
                          </div>
                          <DialogFooter className="gap-2">
                            <Button 
                              variant="outline"
                              onClick={handleUpdateThreshold} 
                              disabled={isUpdating}
                            >
                              Update Threshold
                            </Button>
                            <Button 
                              onClick={handleUpdateStock} 
                              disabled={isUpdating || !newStock}
                            >
                              Update Stock
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
