import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Package,
  Plus,
  Loader2,
  Upload,
  X,
  Edit,
  Trash2,
  Eye,
  Image as ImageIcon,
} from "lucide-react";
import { useProducts, Product, ProductFormData, ProductVariant } from "@/hooks/useProducts";
import { Category } from "@/hooks/useCategories";
import { Link } from "react-router-dom";
import { VariantManager } from "./VariantManager";
import { ProductSpecificationsEditor } from "./ProductSpecificationsEditor";
import { VariantStockDialog } from "./VariantStockDialog";
import { VendorFilterSelect } from "./VendorFilterSelect";

interface ProductManagementProps {
  categories: Category[];
}

export function ProductManagement({ categories }: ProductManagementProps) {
  const {
    products,
    loading,
    addProduct,
    updateProduct,
    deleteProduct,
    toggleProductStatus,
    removeProductImage,
  } = useProducts();

  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<ProductFormData>({
    name: "",
    description: "",
    category_id: null,
    price: 0,
    compare_at_price: null,
    sku: "",
    stock_quantity: 0,
    is_active: true,
    weight_grams: null,
    length_cm: null,
    breadth_cm: null,
    height_cm: null,
    specifications: [],
    country_of_origin: "India",
    net_quantity: "1 N",
  });
  const [productImages, setProductImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [productVariants, setProductVariants] = useState<ProductVariant[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setProductForm({
      name: "",
      description: "",
      category_id: null,
      price: 0,
      compare_at_price: null,
      sku: "",
      stock_quantity: 0,
      is_active: true,
      weight_grams: null,
      length_cm: null,
      breadth_cm: null,
      height_cm: null,
      specifications: [],
      country_of_origin: "India",
      net_quantity: "1 N",
    });
    setProductImages([]);
    setImagePreviews([]);
    setProductVariants([]);
    setEditingProduct(null);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setProductImages((prev) => [...prev, ...files]);

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeNewImage = (index: number) => {
    setProductImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddProduct = async () => {
    if (!productForm.name) return;

    setIsSubmitting(true);
    const result = await addProduct(productForm, productImages, productVariants);
    setIsSubmitting(false);

    if (result) {
      resetForm();
      setIsAddingProduct(false);
    }
  };

  const handleEditProduct = async () => {
    if (!editingProduct || !productForm.name) return;

    setIsSubmitting(true);
    const result = await updateProduct(
      editingProduct.id,
      productForm,
      productImages.length > 0 ? productImages : undefined,
      productVariants
    );
    setIsSubmitting(false);

    if (result) {
      resetForm();
      setEditingProduct(null);
    }
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      description: product.description || "",
      category_id: product.category_id,
      price: product.price,
      compare_at_price: product.compare_at_price,
      sku: product.sku || "",
      stock_quantity: product.stock_quantity,
      is_active: product.is_active,
      weight_grams: product.weight_grams,
      length_cm: product.length_cm,
      breadth_cm: product.breadth_cm,
      height_cm: product.height_cm,
      specifications: product.specifications || [],
      country_of_origin: product.country_of_origin || "India",
      net_quantity: product.net_quantity || "1 N",
    });
    setProductImages([]);
    setImagePreviews([]);
    setProductVariants(product.variants || []);
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "Uncategorized";
    const category = categories.find((c) => c.id === categoryId);
    return category?.name || "Unknown";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const renderFormFields = (isEdit: boolean = false) => (
    <div className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-2">
      <div className="space-y-2">
        <Label htmlFor={isEdit ? "edit-name" : "add-name"}>Product Name *</Label>
        <Input
          id={isEdit ? "edit-name" : "add-name"}
          placeholder="e.g., Cotton Summer Dress"
          value={productForm.name}
          onChange={(e) =>
            setProductForm((prev) => ({ ...prev, name: e.target.value }))
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={isEdit ? "edit-desc" : "add-desc"}>Description</Label>
        <Textarea
          id={isEdit ? "edit-desc" : "add-desc"}
          placeholder="Describe this product..."
          value={productForm.description}
          onChange={(e) =>
            setProductForm((prev) => ({ ...prev, description: e.target.value }))
          }
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={isEdit ? "edit-price" : "add-price"}>Price (₹) *</Label>
          <Input
            id={isEdit ? "edit-price" : "add-price"}
            type="number"
            min="0"
            step="0.01"
            placeholder="999"
            value={productForm.price || ""}
            onChange={(e) =>
              setProductForm((prev) => ({
                ...prev,
                price: parseFloat(e.target.value) || 0,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={isEdit ? "edit-compare" : "add-compare"}>
            Compare at Price (₹)
          </Label>
          <Input
            id={isEdit ? "edit-compare" : "add-compare"}
            type="number"
            min="0"
            step="0.01"
            placeholder="1499"
            value={productForm.compare_at_price || ""}
            onChange={(e) =>
              setProductForm((prev) => ({
                ...prev,
                compare_at_price: parseFloat(e.target.value) || null,
              }))
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={isEdit ? "edit-sku" : "add-sku"}>SKU</Label>
          <Input
            id={isEdit ? "edit-sku" : "add-sku"}
            placeholder="SKU-001"
            value={productForm.sku}
            onChange={(e) =>
              setProductForm((prev) => ({ ...prev, sku: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={isEdit ? "edit-stock" : "add-stock"}>
            Stock Quantity
          </Label>
          <Input
            id={isEdit ? "edit-stock" : "add-stock"}
            type="number"
            min="0"
            placeholder="100"
            value={productForm.stock_quantity || ""}
            onChange={(e) =>
              setProductForm((prev) => ({
                ...prev,
                stock_quantity: parseInt(e.target.value) || 0,
              }))
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Category</Label>
        <Select
          value={productForm.category_id || "none"}
          onValueChange={(value) =>
            setProductForm((prev) => ({
              ...prev,
              category_id: value === "none" ? null : value,
            }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Category</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label>Active</Label>
        <Switch
          checked={productForm.is_active}
          onCheckedChange={(checked) =>
            setProductForm((prev) => ({ ...prev, is_active: checked }))
          }
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <Label className="text-sm text-muted-foreground">
          Parcel weight &amp; size (optional - used for courier shipping, defaults apply if left blank)
        </Label>
        <div className="grid grid-cols-4 gap-2">
          <Input
            type="number"
            min="0"
            placeholder="Weight (g)"
            value={productForm.weight_grams ?? ""}
            onChange={(e) =>
              setProductForm((prev) => ({
                ...prev,
                weight_grams: e.target.value ? parseInt(e.target.value) : null,
              }))
            }
          />
          <Input
            type="number"
            min="0"
            placeholder="Length (cm)"
            value={productForm.length_cm ?? ""}
            onChange={(e) =>
              setProductForm((prev) => ({
                ...prev,
                length_cm: e.target.value ? parseFloat(e.target.value) : null,
              }))
            }
          />
          <Input
            type="number"
            min="0"
            placeholder="Breadth (cm)"
            value={productForm.breadth_cm ?? ""}
            onChange={(e) =>
              setProductForm((prev) => ({
                ...prev,
                breadth_cm: e.target.value ? parseFloat(e.target.value) : null,
              }))
            }
          />
          <Input
            type="number"
            min="0"
            placeholder="Height (cm)"
            value={productForm.height_cm ?? ""}
            onChange={(e) =>
              setProductForm((prev) => ({
                ...prev,
                height_cm: e.target.value ? parseFloat(e.target.value) : null,
              }))
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={isEdit ? "edit-origin" : "add-origin"}>Country of Origin</Label>
          <Input
            id={isEdit ? "edit-origin" : "add-origin"}
            value={productForm.country_of_origin ?? ""}
            onChange={(e) =>
              setProductForm((prev) => ({ ...prev, country_of_origin: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={isEdit ? "edit-netqty" : "add-netqty"}>Net Quantity</Label>
          <Input
            id={isEdit ? "edit-netqty" : "add-netqty"}
            placeholder="e.g. 1 N, 1 Set, 500 g"
            value={productForm.net_quantity ?? ""}
            onChange={(e) =>
              setProductForm((prev) => ({ ...prev, net_quantity: e.target.value }))
            }
          />
        </div>
      </div>

      <ProductSpecificationsEditor
        specifications={productForm.specifications ?? []}
        onChange={(specifications) => setProductForm((prev) => ({ ...prev, specifications }))}
      />

      {/* Variant Management */}
      <VariantManager
        variants={productVariants}
        onChange={setProductVariants}
        basePrice={productForm.price}
      />

      {isEdit && editingProduct && editingProduct.images.length > 0 && (
        <div className="space-y-2">
          <Label>Current Images</Label>
          <div className="grid grid-cols-4 gap-2">
            {editingProduct.images.map((img, idx) => (
              <div key={idx} className="relative">
                <img
                  src={img}
                  alt={`Product ${idx + 1}`}
                  className="w-full h-20 object-cover rounded-lg"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={() => removeProductImage(editingProduct.id, img)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>{isEdit ? "Add More Images" : "Product Images"}</Label>
        <input
          type="file"
          ref={imageInputRef}
          accept="image/*"
          multiple
          onChange={handleImageChange}
          className="hidden"
        />
        {imagePreviews.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mb-2">
            {imagePreviews.map((preview, idx) => (
              <div key={idx} className="relative">
                <img
                  src={preview}
                  alt={`Preview ${idx + 1}`}
                  className="w-full h-20 object-cover rounded-lg"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={() => removeNewImage(idx)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div
          onClick={() => imageInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
        >
          <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Click to upload images</p>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 sticky bottom-0 bg-background">
        <Button
          variant="outline"
          onClick={() => {
            resetForm();
            if (isEdit) {
              setEditingProduct(null);
            } else {
              setIsAddingProduct(false);
            }
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={isEdit ? handleEditProduct : handleAddProduct}
          disabled={isSubmitting || !productForm.name}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? "Update Product" : "Add Product"}
        </Button>
      </div>
    </div>
  );

  const visibleProducts = vendorFilter
    ? products.filter((p) => p.vendor_id === vendorFilter)
    : products;

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
        <Dialog open={isAddingProduct} onOpenChange={setIsAddingProduct}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Product</DialogTitle>
              <DialogDescription>
                Create a new product in your store
              </DialogDescription>
            </DialogHeader>
            {renderFormFields(false)}
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <CardContent className="p-6">
        {visibleProducts.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {products.length === 0 ? "No products yet" : "No products for this vendor"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {products.length === 0
                ? "Create your first product to start selling"
                : "Try selecting a different vendor"}
            </p>
            {products.length === 0 && (
              <Button onClick={() => setIsAddingProduct(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {visibleProducts.map((product) => (
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
                      {getCategoryName(product.category_id)} • ₹
                      {product.price.toFixed(0)}
                      {product.compare_at_price && (
                        <span className="line-through ml-2 text-muted-foreground">
                          ₹{product.compare_at_price.toFixed(0)}
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
                  <Badge variant={product.is_active ? "default" : "secondary"}>
                    {product.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Switch
                    checked={product.is_active}
                    onCheckedChange={(checked) =>
                      toggleProductStatus(product.id, checked)
                    }
                  />
                  <Dialog
                    open={editingProduct?.id === product.id}
                    onOpenChange={(open) => {
                      if (!open) {
                        resetForm();
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(product)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Edit Product</DialogTitle>
                        <DialogDescription>
                          Update product details
                        </DialogDescription>
                      </DialogHeader>
                      {renderFormFields(true)}
                    </DialogContent>
                  </Dialog>
                  <Link to={`/product/${product.id}`}>
                    <Button variant="ghost" size="icon">
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
      </CardContent>
    </Card>
  );
}
