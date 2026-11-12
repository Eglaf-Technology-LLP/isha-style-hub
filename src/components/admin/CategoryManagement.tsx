import { useState, useRef } from "react";
import { SizeChartTemplateButton } from "@/components/admin/SizeChartTemplateDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
  FolderOpen,
  Plus,
  Loader2,
  Upload,
  X,
  Edit,
  Trash2,
} from "lucide-react";
import { useCategories, Category } from "@/hooks/useCategories";
import { describeGst, useHsnCodes } from "@/hooks/useHsnCodes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryImportExportDialog } from "./CategoryImportExportDialog";
import { HEADER_CATEGORY_LIMIT } from "@/hooks/useStorefront";
import { SIZE_CHART_STANDARD_ONLY } from "@/lib/sizeCharts";

export function CategoryManagement() {
  const {
    categories,
    loading,
    addCategory,
    updateCategory,
    setPlacement,
    deleteCategory,
  } = useCategories();

  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const { hsnCodes } = useHsnCodes();
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    hsn_code_id: "",
    show_in_header: false,
    show_on_home: false,
  });
  const [categoryImage, setCategoryImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setCategoryForm({ name: "", description: "", hsn_code_id: "", show_in_header: false, show_on_home: false });
    setCategoryImage(null);
    setImagePreview(null);
    setEditingCategory(null);
  };

  const applyImageFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setCategoryImage(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyImageFile(e.target.files?.[0]);
  };

  const [imageDragActive, setImageDragActive] = useState(false);

  const handleAddCategory = async () => {
    if (!categoryForm.name) return;

    setIsSubmitting(true);
    const result = await addCategory(
      categoryForm.name,
      categoryForm.description,
      categoryImage || undefined,
      undefined,
      categoryForm.hsn_code_id || null,
      { show_in_header: categoryForm.show_in_header, show_on_home: categoryForm.show_on_home }
    );
    setIsSubmitting(false);

    if (result) {
      resetForm();
      setIsAddingCategory(false);
    }
  };

  const handleEditCategory = async () => {
    if (!editingCategory || !categoryForm.name) return;

    setIsSubmitting(true);
    const result = await updateCategory(
      editingCategory.id,
      {
        name: categoryForm.name,
        description: categoryForm.description,
        hsn_code_id: categoryForm.hsn_code_id || null,
        show_in_header: categoryForm.show_in_header,
        show_on_home: categoryForm.show_on_home,
      },
      categoryImage || undefined
    );
    setIsSubmitting(false);

    if (result) {
      resetForm();
      setEditingCategory(null);
    }
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description || "",
      hsn_code_id: category.hsn_code_id || "",
      show_in_header: category.show_in_header ?? true,
      show_on_home: category.show_on_home ?? true,
    });
    setCategoryImage(null);
    setImagePreview(category.image_url || null);
  };

  const handleDeleteCategory = async (id: string) => {
    await deleteCategory(id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const renderFormFields = (isEdit: boolean = false) => (
    <div className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label htmlFor={isEdit ? "edit-name" : "add-name"}>Category Name *</Label>
        <Input
          id={isEdit ? "edit-name" : "add-name"}
          placeholder="e.g., Summer Collection"
          value={categoryForm.name}
          onChange={(e) =>
            setCategoryForm((prev) => ({ ...prev, name: e.target.value }))
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={isEdit ? "edit-desc" : "add-desc"}>Description</Label>
        <Textarea
          id={isEdit ? "edit-desc" : "add-desc"}
          placeholder="Describe this category..."
          value={categoryForm.description}
          onChange={(e) =>
            setCategoryForm((prev) => ({ ...prev, description: e.target.value }))
          }
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={isEdit ? "edit-hsn" : "add-hsn"}>HSN code (sets the GST rate)</Label>
        <Select
          value={categoryForm.hsn_code_id}
          onValueChange={(v) => setCategoryForm((prev) => ({ ...prev, hsn_code_id: v }))}
        >
          <SelectTrigger id={isEdit ? "edit-hsn" : "add-hsn"}>
            <SelectValue placeholder="Choose the HSN code for this category" />
          </SelectTrigger>
          <SelectContent>
            {hsnCodes
              .filter((h) => h.is_active || h.id === categoryForm.hsn_code_id)
              .map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.code} · {h.description} ({describeGst(h)})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {!categoryForm.hsn_code_id && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Without an HSN code, products in this category can't be taxed on the customer invoice.
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor={isEdit ? "edit-header" : "add-header"}>Show in the site header</Label>
            <p className="text-xs text-muted-foreground">A link in the top menu (room for about {HEADER_CATEGORY_LIMIT}).</p>
          </div>
          <Switch
            id={isEdit ? "edit-header" : "add-header"}
            checked={categoryForm.show_in_header}
            onCheckedChange={(v) => setCategoryForm((prev) => ({ ...prev, show_in_header: v }))}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor={isEdit ? "edit-home" : "add-home"}>Show on the home page</Label>
            <p className="text-xs text-muted-foreground">A tile under "Shop by category".</p>
          </div>
          <Switch
            id={isEdit ? "edit-home" : "add-home"}
            checked={categoryForm.show_on_home}
            onCheckedChange={(v) => setCategoryForm((prev) => ({ ...prev, show_on_home: v }))}
          />
        </div>
        <p className="text-xs text-muted-foreground">Every category is always in the shop's category filter.</p>
      </div>

      <div className="space-y-2">
        <Label>Category Image</Label>
        <input
          type="file"
          ref={imageInputRef}
          accept="image/*"
          onChange={handleImageChange}
          className="hidden"
        />
        {imagePreview ? (
          <div className="relative">
            <img
              src={imagePreview}
              alt="Preview"
              className="w-full h-40 object-cover rounded-lg"
            />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2"
              onClick={() => {
                setCategoryImage(null);
                setImagePreview(null);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div
            onClick={() => imageInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setImageDragActive(true);
            }}
            onDragLeave={() => setImageDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setImageDragActive(false);
              applyImageFile(e.dataTransfer.files?.[0]);
            }}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              imageDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary"
            }`}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Drag and drop an image here, or click to upload
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button
          variant="outline"
          onClick={() => {
            resetForm();
            if (isEdit) {
              setEditingCategory(null);
            } else {
              setIsAddingCategory(false);
            }
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={isEdit ? handleEditCategory : handleAddCategory}
          disabled={isSubmitting || !categoryForm.name}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? "Update Category" : "Add Category"}
        </Button>
      </div>
    </div>
  );

  return (
    <Card>
      <div className="flex flex-row items-center justify-between p-6 border-b border-border">
        <div>
          <h3 className="text-lg font-semibold">Categories</h3>
          <p className="text-sm text-muted-foreground">
            Manage product categories with images
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CategoryImportExportDialog categories={categories} />
          <Dialog open={isAddingCategory} onOpenChange={setIsAddingCategory}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Category</DialogTitle>
                <DialogDescription>
                  Create a new product category
                </DialogDescription>
              </DialogHeader>
              {renderFormFields(false)}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {categories.length > 0 && (
        <PlacementPanel
          categories={categories}
          onToggle={(id, patch) => setPlacement(id, patch)}
        />
      )}

      <CardContent className="p-6">
        {categories.length === 0 ? (
          <div className="text-center py-12">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No categories yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first category to organize products
            </p>
            <Button onClick={() => setIsAddingCategory(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => (
              <Card key={category.id} className="overflow-hidden">
                {category.image_url ? (
                  <img
                    src={category.image_url}
                    alt={category.name}
                    className="w-full h-32 object-cover"
                  />
                ) : (
                  <div className="w-full h-32 bg-muted flex items-center justify-center">
                    <FolderOpen className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium">{category.name}</h4>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(category.show_in_header ?? true) && <Badge variant="secondary" className="text-[10px]">Header</Badge>}
                        {(category.show_on_home ?? true) && <Badge variant="secondary" className="text-[10px]">Home page</Badge>}
                        {!(category.show_in_header ?? true) && !(category.show_on_home ?? true) && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">Filter only</Badge>
                        )}
                      </div>
                      {category.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {category.description}
                        </p>
                      )}
                      {(() => {
                        const hsn = hsnCodes.find((h) => h.id === category.hsn_code_id);
                        return hsn ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            HSN {hsn.code} · GST {describeGst(hsn)}
                          </p>
                        ) : (
                          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">No HSN code - set one for GST</p>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1">
                      {!SIZE_CHART_STANDARD_ONLY && (
                        <SizeChartTemplateButton categoryId={category.id} categoryName={category.name} />
                      )}
                      <Dialog
                        open={editingCategory?.id === category.id}
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
                            onClick={() => openEditDialog(category)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit Category</DialogTitle>
                            <DialogDescription>
                              Update category details
                            </DialogDescription>
                          </DialogHeader>
                          {renderFormFields(true)}
                        </DialogContent>
                      </Dialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Category</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{category.name}"?
                              This action cannot be undone. Products in this
                              category will become uncategorized.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => handleDeleteCategory(category.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Which categories are header links and which are home page tiles - all on
// one screen, saved as they're ticked. The rest are only in the shop's
// category filter.
function PlacementPanel({
  categories,
  onToggle,
}: {
  categories: Category[];
  onToggle: (id: string, patch: { show_in_header?: boolean; show_on_home?: boolean }) => void;
}) {
  const inHeader = categories.filter((c) => c.show_in_header ?? true).length;
  const onHome = categories.filter((c) => c.show_on_home ?? true).length;
  return (
    <div className="border-b border-border px-6 py-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="font-medium">Header &amp; home page</h4>
          <p className="text-sm text-muted-foreground">
            Tick where each category shows. The rest are only in the shop&apos;s category filter. Header links show only
            once the category has a live product.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Header: <span className={inHeader > HEADER_CATEGORY_LIMIT ? "font-medium text-destructive" : "font-medium text-foreground"}>{inHeader}</span>
          {" "}/ {HEADER_CATEGORY_LIMIT} · Home page: <span className="font-medium text-foreground">{onHome}</span>
        </p>
      </div>
      {inHeader > HEADER_CATEGORY_LIMIT && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The header has room for {HEADER_CATEGORY_LIMIT} - only the first {HEADER_CATEGORY_LIMIT} (A to Z) show. Untick some.
        </p>
      )}
      <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Category</th>
              <th className="w-28 px-3 py-2 text-center font-medium">Header</th>
              <th className="w-28 px-3 py-2 text-center font-medium">Home page</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-1.5">{c.name}</td>
                <td className="px-3 py-1.5 text-center">
                  <Checkbox
                    aria-label={`Show ${c.name} in the header`}
                    checked={c.show_in_header ?? true}
                    onCheckedChange={(v) => onToggle(c.id, { show_in_header: v === true })}
                  />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <Checkbox
                    aria-label={`Show ${c.name} on the home page`}
                    checked={c.show_on_home ?? true}
                    onCheckedChange={(v) => onToggle(c.id, { show_on_home: v === true })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
