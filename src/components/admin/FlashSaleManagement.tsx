import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Zap,
  Plus,
  Loader2,
  Edit,
  Trash2,
  Clock,
} from "lucide-react";
import { useFlashSales, FlashSale, FlashSaleFormData } from "@/hooks/useFlashSales";
import { useProducts } from "@/hooks/useProducts";
import { toast } from "sonner";
import { format } from "date-fns";

export function FlashSaleManagement() {
  const {
    flashSales,
    loading,
    createFlashSale,
    updateFlashSale,
    deleteFlashSale,
  } = useFlashSales(true);
  const { products } = useProducts();

  const [isAddingFlashSale, setIsAddingFlashSale] = useState(false);
  const [editingFlashSale, setEditingFlashSale] = useState<FlashSale | null>(null);
  const [flashSaleForm, setFlashSaleForm] = useState<FlashSaleFormData>({
    name: "",
    description: "",
    discount_percentage: 10,
    product_ids: [],
    starts_at: "",
    ends_at: "",
    is_active: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const resetForm = () => {
    setFlashSaleForm({
      name: "",
      description: "",
      discount_percentage: 10,
      product_ids: [],
      starts_at: "",
      ends_at: "",
      is_active: true,
    });
    setSelectedProducts([]);
    setEditingFlashSale(null);
  };

  const handleAddFlashSale = async () => {
    if (!flashSaleForm.name || !flashSaleForm.starts_at || !flashSaleForm.ends_at) {
      toast.error("Please fill in required fields");
      return;
    }

    if (selectedProducts.length === 0) {
      toast.error("Please select at least one product");
      return;
    }

    setIsSubmitting(true);
    const result = await createFlashSale({
      ...flashSaleForm,
      product_ids: selectedProducts,
    });
    setIsSubmitting(false);

    if (result) {
      resetForm();
      setIsAddingFlashSale(false);
    }
  };

  const handleEditFlashSale = async () => {
    if (!editingFlashSale) return;

    setIsSubmitting(true);
    const result = await updateFlashSale(editingFlashSale.id, {
      ...flashSaleForm,
      product_ids: selectedProducts,
    });
    setIsSubmitting(false);

    if (result) {
      resetForm();
      setEditingFlashSale(null);
    }
  };

  const openEditDialog = (sale: FlashSale) => {
    setEditingFlashSale(sale);
    setFlashSaleForm({
      name: sale.name,
      description: sale.description || "",
      discount_percentage: sale.discount_percentage,
      product_ids: sale.product_ids,
      starts_at: sale.starts_at,
      ends_at: sale.ends_at,
      is_active: sale.is_active,
    });
    setSelectedProducts(sale.product_ids);
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const getFlashSaleStatus = (sale: FlashSale) => {
    const now = new Date();
    const start = new Date(sale.starts_at);
    const end = new Date(sale.ends_at);

    if (!sale.is_active) return { label: "Inactive", variant: "secondary" as const };
    if (now < start) return { label: "Scheduled", variant: "secondary" as const };
    if (now > end) return { label: "Ended", variant: "destructive" as const };
    return { label: "Active", variant: "default" as const };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const FlashSaleFormContent = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-2">
      <div className="space-y-2">
        <Label>Sale Name *</Label>
        <Input
          placeholder="Summer Flash Sale"
          value={flashSaleForm.name}
          onChange={(e) =>
            setFlashSaleForm({ ...flashSaleForm, name: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          placeholder="Describe this flash sale..."
          value={flashSaleForm.description}
          onChange={(e) =>
            setFlashSaleForm({ ...flashSaleForm, description: e.target.value })
          }
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Discount Percentage (%)</Label>
        <Input
          type="number"
          min="1"
          max="100"
          placeholder="20"
          value={flashSaleForm.discount_percentage || ""}
          onChange={(e) =>
            setFlashSaleForm({
              ...flashSaleForm,
              discount_percentage: parseFloat(e.target.value) || 0,
            })
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Start Date/Time *</Label>
          <Input
            type="datetime-local"
            value={
              flashSaleForm.starts_at
                ? format(new Date(flashSaleForm.starts_at), "yyyy-MM-dd'T'HH:mm")
                : ""
            }
            onChange={(e) =>
              setFlashSaleForm({
                ...flashSaleForm,
                starts_at: e.target.value ? new Date(e.target.value).toISOString() : "",
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>End Date/Time *</Label>
          <Input
            type="datetime-local"
            value={
              flashSaleForm.ends_at
                ? format(new Date(flashSaleForm.ends_at), "yyyy-MM-dd'T'HH:mm")
                : ""
            }
            onChange={(e) =>
              setFlashSaleForm({
                ...flashSaleForm,
                ends_at: e.target.value ? new Date(e.target.value).toISOString() : "",
              })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Select Products *</Label>
        <div className="border border-border rounded-lg max-h-40 overflow-y-auto p-2">
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">
              No products available
            </p>
          ) : (
            <div className="space-y-2">
              {products.map((product) => (
                <label
                  key={product.id}
                  className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedProducts.includes(product.id)}
                    onChange={() => toggleProductSelection(product.id)}
                    className="rounded border-border"
                  />
                  <span className="text-sm">{product.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    ₹{product.price}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {selectedProducts.length} product(s) selected
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Label>Active</Label>
        <Switch
          checked={flashSaleForm.is_active}
          onCheckedChange={(checked) =>
            setFlashSaleForm({ ...flashSaleForm, is_active: checked })
          }
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 sticky bottom-0 bg-background">
        <Button
          variant="outline"
          onClick={() => {
            resetForm();
            isEdit ? setEditingFlashSale(null) : setIsAddingFlashSale(false);
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={isEdit ? handleEditFlashSale : handleAddFlashSale}
          disabled={isSubmitting || !flashSaleForm.name || !flashSaleForm.starts_at || !flashSaleForm.ends_at}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? "Update Flash Sale" : "Create Flash Sale"}
        </Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Flash Sales</CardTitle>
          <p className="text-sm text-muted-foreground">
            Create time-limited promotional sales
          </p>
        </div>
        <Dialog open={isAddingFlashSale} onOpenChange={setIsAddingFlashSale}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Create Flash Sale
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Flash Sale</DialogTitle>
              <DialogDescription>
                Set up a time-limited promotional sale
              </DialogDescription>
            </DialogHeader>
            <FlashSaleFormContent />
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        {flashSales.length === 0 ? (
          <div className="text-center py-12">
            <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No flash sales yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first flash sale
            </p>
            <Button onClick={() => setIsAddingFlashSale(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Flash Sale
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {flashSales.map((sale) => {
              const status = getFlashSaleStatus(sale);
              return (
                <div
                  key={sale.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Zap className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{sale.name}</h4>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {sale.discount_percentage}% off • {sale.product_ids.length} product(s)
                      </p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(sale.starts_at), "MMM d, h:mm a")} -{" "}
                        {format(new Date(sale.ends_at), "MMM d, h:mm a")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={sale.is_active}
                      onCheckedChange={(checked) =>
                        updateFlashSale(sale.id, { is_active: checked })
                      }
                    />
                    <Dialog
                      open={editingFlashSale?.id === sale.id}
                      onOpenChange={(open) => {
                        if (!open) resetForm();
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(sale)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Edit Flash Sale</DialogTitle>
                          <DialogDescription>
                            Update flash sale details
                          </DialogDescription>
                        </DialogHeader>
                        <FlashSaleFormContent isEdit />
                      </DialogContent>
                    </Dialog>
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
                          <AlertDialogTitle>Delete Flash Sale?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete "{sale.name}". This action
                            cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteFlashSale(sale.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
