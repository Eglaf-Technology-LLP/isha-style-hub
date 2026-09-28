import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Pencil, Trash2, Store } from "lucide-react";
import { toast } from "sonner";
import { VendorProductDialog, VendorProductRow } from "@/components/vendor/VendorProductDialog";
import { VariantStockDialog } from "./VariantStockDialog";
import { mapDbVariant } from "@/hooks/useProducts";
import { productMatchesQuery } from "@/lib/productSearch";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/PaginationBar";

interface VendorOption {
  id: string;
  name: string;
  is_trusted: boolean;
}

// Lets the super admin manage any vendor's catalogue on their behalf -
// same form vendors use themselves (VendorProductDialog), just with a
// vendor picker instead of the vendor's own session deciding the vendor_id.
export function VendorCatalogManagement() {
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorId, setVendorId] = useState<string>("");
  const [products, setProducts] = useState<VendorProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<VendorProductRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    supabase
      .from("vendors")
      .select("id, name, is_trusted")
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          toast.error("Failed to load vendors");
          return;
        }
        setVendors((data || []) as VendorOption[]);
        if (data && data.length > 0) setVendorId(data[0].id);
      });
  }, []);

  useEffect(() => {
    if (vendorId) fetchProducts();
  }, [vendorId]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, price, stock_quantity, is_active, approval_status, images, description, category_id, compare_at_price, sku, weight_grams, length_cm, breadth_cm, height_cm, specifications, country_of_origin, net_quantity, product_variants(*)"
        )
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setProducts(
        (data || []).map((p: any) => ({
          ...p,
          variants: (p.product_variants || []).map(mapDbVariant),
        }))
      );
    } catch (e: any) {
      toast.error(e.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  const deleteProduct = async (p: VendorProductRow) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) throw error;
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
      toast.success("Product deleted");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete product");
    }
  };

  const selectedVendor = vendors.find((v) => v.id === vendorId);

  const visibleProducts = searchQuery.trim()
    ? products.filter((p) => productMatchesQuery(p, searchQuery))
    : products;
  const { page, setPage, totalPages, paginatedItems, totalItems, pageSize } = usePagination(visibleProducts, 10);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 flex-wrap gap-3">
        <CardTitle className="flex items-center gap-2">
          <Store className="h-5 w-5" /> Manage a vendor's catalogue
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="w-56 h-9">
              <SelectValue placeholder="Select a vendor" />
            </SelectTrigger>
            <SelectContent>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => {
              setEditingProduct(null);
              setDialogOpen(true);
            }}
            disabled={!vendorId}
          >
            <Plus className="h-4 w-4 mr-2" /> Add product
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!loading && products.length > 0 && (
          <Input
            placeholder="Search by name, SKU or variant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-xs mb-4"
          />
        )}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : products.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {selectedVendor ? `${selectedVendor.name} has no products yet.` : "Select a vendor."}
          </p>
        ) : visibleProducts.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No products match "{searchQuery}".</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Visible</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((p, idx) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm text-muted-foreground">{(page - 1) * pageSize + idx + 1}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>₹{Number(p.price).toFixed(0)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {p.stock_quantity}
                        <VariantStockDialog productName={p.name} variants={p.variants} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {p.approval_status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.is_active ? "Listed" : "Hidden"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingProduct(p);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteProduct(p)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </CardContent>

      {vendorId && (
        <VendorProductDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          vendorId={vendorId}
          isTrusted={selectedVendor?.is_trusted ?? false}
          product={editingProduct}
          onSaved={fetchProducts}
        />
      )}
    </Card>
  );
}
