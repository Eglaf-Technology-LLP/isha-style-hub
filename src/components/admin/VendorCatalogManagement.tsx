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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Pencil, Trash2, Store } from "lucide-react";
import { toast } from "sonner";
import { Link, useSearchParams } from "react-router-dom";
import type { VendorProductRow } from "@/components/product-editor/ProductEditorForm";
import { VariantStockDialog } from "./VariantStockDialog";
import { mapDbVariant } from "@/hooks/useProducts";
import { productMatchesQuery } from "@/lib/productSearch";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/PaginationBar";
import { formatINR } from "@/lib/format";
import { useProductSelection, type ProductBulkPatch } from "@/lib/productBulk";
import { ProductBulkBar } from "@/components/product-editor/ProductBulkBar";

interface VendorOption {
  id: string;
  name: string;
  is_trusted: boolean;
}

// Lets the super admin manage any vendor's catalogue on their behalf. Add
// and edit open the admin's product page (pages/AdminProductEditor.tsx) -
// the same form vendors use themselves - which comes back here, to the same
// boutique (?vendor=).
export function VendorCatalogManagement() {
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorId, setVendorId] = useState<string>("");
  const [products, setProducts] = useState<VendorProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [params, setParams] = useSearchParams();
  const vendorParam = params.get("vendor");

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
        const back = vendorParam && data?.find((v) => v.id === vendorParam);
        if (back) setVendorId(back.id);
        else if (data && data.length > 0) setVendorId(data[0].id);
      });
    // Once: ?vendor= only picks the boutique on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          "id, name, price, product_value, compare_at_value, stock_quantity, is_active, approval_status, cod_available, images, description, category_id, compare_at_price, sku, weight_grams, length_cm, breadth_cm, height_cm, specifications, country_of_origin, net_quantity, product_variants(*)"
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
  // Ticked rows for the bulk actions - everything the search shows, on any page.
  const selection = useProductSelection(visibleProducts.map((p) => p.id));
  const applyBulkUpdate = (ids: string[], patch: ProductBulkPatch) => {
    const changed = new Set(ids);
    setProducts((prev) => prev.map((p) => (changed.has(p.id) ? { ...p, ...patch } : p)));
  };
  const applyBulkDelete = (ids: string[]) => {
    const gone = new Set(ids);
    setProducts((prev) => prev.filter((p) => !gone.has(p.id)));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 flex-wrap gap-3">
        <CardTitle className="flex items-center gap-2">
          <Store className="h-5 w-5" /> Manage a vendor's catalogue
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select
            value={vendorId}
            onValueChange={(v) => {
              setVendorId(v);
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("vendor", v);
                  return next;
                },
                { replace: true },
              );
            }}
          >
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
          <Button size="sm" asChild disabled={!vendorId}>
            <Link to={`/admin/products/new?from=catalog&vendor=${vendorId}`}>
              <Plus className="h-4 w-4 mr-2" /> Add product
            </Link>
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
            <ProductBulkBar
              totalCount={visibleProducts.length}
              selection={selection}
              wording="listing"
              onUpdated={applyBulkUpdate}
              onDeleted={applyBulkDelete}
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Product Value (excl. GST)</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Visible</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((p, idx) => (
                  <TableRow key={p.id} data-state={selection.isSelected(p.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selection.isSelected(p.id)}
                        onCheckedChange={(v) => selection.toggle(p.id, v === true)}
                        aria-label={`Select ${p.name}`}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{(page - 1) * pageSize + idx + 1}</TableCell>
                    <TableCell className="font-medium">
                      {p.name}
                      {p.cod_available === false && (
                        <Badge variant="outline" className="ml-2 text-[10px] font-normal" title="Cash on Delivery is off for this product">
                          No COD
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {formatINR(Number(p.product_value ?? p.price))}
                      <div className="text-xs text-muted-foreground">MRP {formatINR(Number(p.price))}</div>
                    </TableCell>
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
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={`/admin/products/${p.id}?from=catalog`} aria-label={`Edit ${p.name}`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
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

    </Card>
  );
}
