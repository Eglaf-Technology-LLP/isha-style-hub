import { useState } from "react";
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
  Percent,
  Plus,
  Loader2,
  Edit,
  Trash2,
  Copy,
  Tag,
} from "lucide-react";
import { useDiscounts, Discount, DiscountFormData } from "@/hooks/useDiscounts";
import { toast } from "sonner";
import { format } from "date-fns";
import { DiscountImportExportDialog } from "./DiscountImportExportDialog";

export function DiscountManagement() {
  const {
    discounts,
    loading,
    addDiscount,
    updateDiscount,
    deleteDiscount,
    toggleDiscountStatus,
  } = useDiscounts();

  const [isAddingDiscount, setIsAddingDiscount] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [discountForm, setDiscountForm] = useState<DiscountFormData>({
    code: "",
    name: "",
    description: "",
    discount_type: "percentage",
    discount_value: 0,
    min_order_amount: 0,
    max_uses: null,
    product_ids: null,
    is_active: true,
    starts_at: null,
    expires_at: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setDiscountForm({
      code: "",
      name: "",
      description: "",
      discount_type: "percentage",
      discount_value: 0,
      min_order_amount: 0,
      max_uses: null,
      product_ids: null,
      is_active: true,
      starts_at: null,
      expires_at: null,
    });
    setEditingDiscount(null);
  };

  const handleAddDiscount = async () => {
    if (!discountForm.code || !discountForm.name) {
      toast.error("Please fill in required fields");
      return;
    }

    setIsSubmitting(true);
    const result = await addDiscount(discountForm);
    setIsSubmitting(false);

    if (result) {
      resetForm();
      setIsAddingDiscount(false);
    }
  };

  const handleEditDiscount = async () => {
    if (!editingDiscount || !discountForm.code || !discountForm.name) return;

    setIsSubmitting(true);
    const result = await updateDiscount(editingDiscount.id, discountForm);
    setIsSubmitting(false);

    if (result) {
      resetForm();
      setEditingDiscount(null);
    }
  };

  const openEditDialog = (discount: Discount) => {
    setEditingDiscount(discount);
    setDiscountForm({
      code: discount.code,
      name: discount.name,
      description: discount.description || "",
      discount_type: discount.discount_type,
      discount_value: discount.discount_value,
      min_order_amount: discount.min_order_amount,
      max_uses: discount.max_uses,
      product_ids: discount.product_ids,
      is_active: discount.is_active,
      starts_at: discount.starts_at,
      expires_at: discount.expires_at,
    });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied to clipboard");
  };

  const getDiscountStatusBadge = (discount: Discount) => {
    if (!discount.is_active) {
      return <Badge variant="secondary">Inactive</Badge>;
    }
    if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    if (discount.starts_at && new Date(discount.starts_at) > new Date()) {
      return <Badge variant="secondary">Scheduled</Badge>;
    }
    if (discount.max_uses && discount.used_count >= discount.max_uses) {
      return <Badge variant="secondary">Exhausted</Badge>;
    }
    return <Badge variant="default">Active</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // A plain function returning JSX, called directly - not a JSX component.
  // As `const DiscountFormContent = (...) => (...)` used via
  // `<DiscountFormContent />`, this got a brand-new function identity every
  // render (any keystroke re-renders the parent), which made React treat it
  // as a different component type each time and remount the whole subtree -
  // every input lost focus after a single character.
  const renderDiscountFormContent = ({ isEdit = false }: { isEdit?: boolean } = {}) => (
    <div className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Discount Code *</Label>
          <Input
            placeholder="SUMMER20"
            value={discountForm.code}
            onChange={(e) =>
              setDiscountForm({
                ...discountForm,
                code: e.target.value.toUpperCase(),
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Name *</Label>
          <Input
            placeholder="Summer Sale"
            value={discountForm.name}
            onChange={(e) =>
              setDiscountForm({ ...discountForm, name: e.target.value })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          placeholder="Describe this discount..."
          value={discountForm.description}
          onChange={(e) =>
            setDiscountForm({ ...discountForm, description: e.target.value })
          }
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Discount Type</Label>
          <Select
            value={discountForm.discount_type}
            onValueChange={(value: "percentage" | "fixed_amount") =>
              setDiscountForm({ ...discountForm, discount_type: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">Percentage</SelectItem>
              <SelectItem value="fixed_amount">Fixed Amount</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>
            Value {discountForm.discount_type === "percentage" ? "(%)" : "(₹)"}
          </Label>
          <Input
            type="number"
            min="0"
            max={discountForm.discount_type === "percentage" ? 100 : undefined}
            step="0.01"
            placeholder={discountForm.discount_type === "percentage" ? "20" : "100"}
            value={discountForm.discount_value || ""}
            onChange={(e) =>
              setDiscountForm({
                ...discountForm,
                discount_value: parseFloat(e.target.value) || 0,
              })
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Min. Order Amount (₹)</Label>
          <Input
            type="number"
            min="0"
            placeholder="500"
            value={discountForm.min_order_amount || ""}
            onChange={(e) =>
              setDiscountForm({
                ...discountForm,
                min_order_amount: parseFloat(e.target.value) || 0,
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Max Uses (optional)</Label>
          <Input
            type="number"
            min="1"
            placeholder="100"
            value={discountForm.max_uses || ""}
            onChange={(e) =>
              setDiscountForm({
                ...discountForm,
                max_uses: parseInt(e.target.value) || null,
              })
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Start Date (optional)</Label>
          <Input
            type="datetime-local"
            value={
              discountForm.starts_at
                ? format(new Date(discountForm.starts_at), "yyyy-MM-dd'T'HH:mm")
                : ""
            }
            onChange={(e) =>
              setDiscountForm({
                ...discountForm,
                starts_at: e.target.value ? new Date(e.target.value).toISOString() : null,
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>End Date (optional)</Label>
          <Input
            type="datetime-local"
            value={
              discountForm.expires_at
                ? format(new Date(discountForm.expires_at), "yyyy-MM-dd'T'HH:mm")
                : ""
            }
            onChange={(e) =>
              setDiscountForm({
                ...discountForm,
                expires_at: e.target.value ? new Date(e.target.value).toISOString() : null,
              })
            }
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label>Active</Label>
        <Switch
          checked={discountForm.is_active}
          onCheckedChange={(checked) =>
            setDiscountForm({ ...discountForm, is_active: checked })
          }
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 sticky bottom-0 bg-background">
        <Button
          variant="outline"
          onClick={() => {
            resetForm();
            isEdit ? setEditingDiscount(null) : setIsAddingDiscount(false);
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={isEdit ? handleEditDiscount : handleAddDiscount}
          disabled={isSubmitting || !discountForm.code || !discountForm.name}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? "Update Discount" : "Create Discount"}
        </Button>
      </div>
    </div>
  );

  return (
    <Card>
      <div className="flex flex-row items-center justify-between p-6 border-b border-border">
        <div>
          <h3 className="text-lg font-semibold">Discounts & Coupons</h3>
          <p className="text-sm text-muted-foreground">
            Manage promotional codes and discounts
          </p>
        </div>
        <div className="flex items-center gap-2">
        <DiscountImportExportDialog
          discounts={discounts}
          addDiscount={addDiscount}
          updateDiscount={updateDiscount}
        />
        <Dialog open={isAddingDiscount} onOpenChange={setIsAddingDiscount}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Create Discount
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Discount</DialogTitle>
              <DialogDescription>
                Create a new discount or coupon code
              </DialogDescription>
            </DialogHeader>
            {renderDiscountFormContent()}
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <CardContent className="p-6">
        {discounts.length === 0 ? (
          <div className="text-center py-12">
            <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No discounts yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first discount code
            </p>
            <Button onClick={() => setIsAddingDiscount(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Discount
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {discounts.map((discount) => (
              <div
                key={discount.id}
                className="flex items-center justify-between p-4 border border-border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Percent className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{discount.name}</h4>
                      <button
                        onClick={() => copyCode(discount.code)}
                        className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs font-mono hover:bg-muted/80"
                      >
                        {discount.code}
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {discount.discount_type === "percentage"
                        ? `${discount.discount_value}% off`
                        : `₹${discount.discount_value} off`}
                      {discount.min_order_amount > 0 &&
                        ` • Min. ₹${discount.min_order_amount}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Used: {discount.used_count}
                      {discount.max_uses && ` / ${discount.max_uses}`}
                      {discount.expires_at &&
                        ` • Expires: ${format(new Date(discount.expires_at), "MMM d, yyyy")}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getDiscountStatusBadge(discount)}
                  <Switch
                    checked={discount.is_active}
                    onCheckedChange={(checked) =>
                      toggleDiscountStatus(discount.id, checked)
                    }
                  />
                  <Dialog
                    open={editingDiscount?.id === discount.id}
                    onOpenChange={(open) => {
                      if (!open) resetForm();
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(discount)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Edit Discount</DialogTitle>
                        <DialogDescription>
                          Update discount details
                        </DialogDescription>
                      </DialogHeader>
                      {renderDiscountFormContent({ isEdit: true })}
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
                        <AlertDialogTitle>Delete Discount?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete "{discount.code}". This
                          action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteDiscount(discount.id)}
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
