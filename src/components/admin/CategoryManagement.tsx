import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
import { CategoryImportExportDialog } from "./CategoryImportExportDialog";

export function CategoryManagement() {
  const {
    categories,
    loading,
    addCategory,
    updateCategory,
    deleteCategory,
  } = useCategories();

  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
  });
  const [categoryImage, setCategoryImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setCategoryForm({ name: "", description: "" });
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
      categoryImage || undefined
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
                      {category.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {category.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
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
