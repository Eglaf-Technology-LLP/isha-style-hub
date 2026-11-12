import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Package, Plus, Loader2, Edit, Trash2, Eye, Image as ImageIcon } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { productMatchesQuery } from "@/lib/productSearch";
import { Category } from "@/hooks/useCategories";
import { ProductImportExportDialog } from "./ProductImportExportDialog";
import { VariantStockDialog } from "./VariantStockDialog";
import { VendorFilterSelect } from "./VendorFilterSelect";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/PaginationBar";
import { formatINR } from "@/lib/format";

interface ProductManagementProps {
  categories: Category[];
}

// The admin's product list. Adding and editing a product happen on their own
// page (pages/AdminProductEditor.tsx), the same form boutiques use.
export function ProductManagement({ categories }: ProductManagementProps) {
  const { products, loading, deleteProduct, toggleProductStatus, toggleProductCod, refetch } = useProducts();

  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "Uncategorized";
    const category = categories.find((c) => c.id === categoryId);
    return category?.name || "Unknown";
  };

  // Several independent dimensions at once (name/SKU text, category, stock
  // level, active status) - the point is finding one product fast out of a
  // large catalog, not any single filter doing all the work alone. Computed
  // (and paginated) before the loading early-return below, not after it -
  // usePagination calls hooks internally, which must never run only on some
  // renders (this exact ordering bug shipped once already and threw a real
  // "Rendered more hooks than during the previous render" error the moment
  // `loading` flipped from true to false).
  const visibleProducts = products.filter((p) => {
    if (vendorFilter && p.vendor_id !== vendorFilter) return false;
    if (categoryFilter !== "all" && p.category_id !== categoryFilter) return false;
    if (statusFilter !== "all" && p.is_active !== (statusFilter === "active")) return false;
    if (stockFilter === "out_of_stock" && p.stock_quantity > 0) return false;
    if (stockFilter === "low_stock" && (p.stock_quantity <= 0 || p.stock_quantity > 5)) return false;
    if (stockFilter === "in_stock" && p.stock_quantity <= 5) return false;
    if (searchQuery.trim() && !productMatchesQuery(p, searchQuery)) return false;
    return true;
  });
  const { page, setPage, totalPages, paginatedItems, totalItems, pageSize } = usePagination(visibleProducts, 10);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <div className="flex flex-row items-center justify-between p-6 border-b border-border flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold">Products</h3>
          <p className="text-sm text-muted-foreground">
            Manage your product catalog
          </p>
        </div>
        <div className="flex items-center gap-2">
          <VendorFilterSelect value={vendorFilter} onChange={setVendorFilter} />
          <ProductImportExportDialog products={products} categories={categories} onImported={refetch} />
          <Button asChild>
            <Link to="/admin/products/new">
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
        <Input
          placeholder="Search by name, SKU or variant..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xs"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as typeof stockFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any stock level</SelectItem>
            <SelectItem value="in_stock">In stock</SelectItem>
            <SelectItem value="low_stock">Low stock</SelectItem>
            <SelectItem value="out_of_stock">Out of stock</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {(searchQuery || categoryFilter !== "all" || stockFilter !== "all" || statusFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchQuery("");
              setCategoryFilter("all");
              setStockFilter("all");
              setStatusFilter("all");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <CardContent className="p-6">
        {visibleProducts.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {products.length === 0 ? "No products yet" : "No products match these filters"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {products.length === 0
                ? "Create your first product to start selling"
                : "Try a different search term or clearing a filter"}
            </p>
            {products.length === 0 && (
              <Button asChild>
                <Link to="/admin/products/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Product
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {paginatedItems.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between p-4 border border-border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  {product.images[0] ? (
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <h4 className="font-medium">{product.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {getCategoryName(product.category_id)} • MRP ₹
                      {product.price.toFixed(0)}
                      {product.product_value != null && (
                        <span className="ml-1">(value {formatINR(Number(product.product_value))} excl. GST)</span>
                      )}
                      {product.compare_at_price && (
                        <span className="line-through ml-2 text-muted-foreground">
                          {formatINR(product.compare_at_price)}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        Stock: {product.stock_quantity}
                      </p>
                      <VariantStockDialog productName={product.name} variants={product.variants} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label
                    className="flex items-center gap-1.5 text-xs text-muted-foreground mr-2 cursor-pointer"
                    title="Allow Cash on Delivery for this product"
                  >
                    COD
                    <Switch
                      checked={product.cod_available ?? true}
                      onCheckedChange={(checked) => toggleProductCod(product.id, checked)}
                      aria-label={`Cash on Delivery for ${product.name}`}
                    />
                  </label>
                  <Badge variant={product.is_active ? "default" : "secondary"}>
                    {product.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Switch
                    checked={product.is_active}
                    onCheckedChange={(checked) =>
                      toggleProductStatus(product.id, checked)
                    }
                  />
                  <Button asChild variant="ghost" size="icon" aria-label={`Edit ${product.name}`}>
                    <Link to={`/admin/products/${product.id}`}>
                      <Edit className="h-4 w-4" />
                    </Link>
                  </Button>
                  {/* A new tab: staff see the product on its own, with no header to come back by. */}
                  <Link to={`/product/${product.id}`} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon" aria-label="View product">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Product?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete "{product.name}". This
                          action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteProduct(product.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
        <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </CardContent>
    </Card>
  );
}
