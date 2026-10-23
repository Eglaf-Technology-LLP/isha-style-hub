import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Edit, Trash2, MapPin, Star } from "lucide-react";
import { useSavedAddresses, AddressFormData, SavedAddress } from "@/hooks/useSavedAddresses";
import { toast } from "sonner";
import { StateSelect } from "@/components/StateSelect";
import { normalizeState } from "@/lib/indianStates";
import { AccountSectionTitle, accountFieldClass, accountLabelClass } from "@/components/storefront/account/AccountKit";
import { cn } from "@/lib/utils";

export function AddressSection() {
  const { addresses, loading, addAddress, updateAddress, deleteAddress, setDefaultAddress } = useSavedAddresses();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);
  const [formData, setFormData] = useState<AddressFormData>({
    label: "",
    full_name: "",
    phone: "",
    address_line_1: "",
    address_line_2: "",
    city: "",
    state: "",
    pincode: "",
    is_default: false,
  });

  const resetForm = () => {
    setFormData({
      label: "",
      full_name: "",
      phone: "",
      address_line_1: "",
      address_line_2: "",
      city: "",
      state: "",
      pincode: "",
      is_default: false,
    });
    setEditingAddress(null);
  };

  const handleEdit = (address: SavedAddress) => {
    setEditingAddress(address);
    setFormData({
      label: address.label,
      full_name: address.full_name,
      phone: address.phone,
      address_line_1: address.address_line_1,
      address_line_2: address.address_line_2 || "",
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      is_default: address.is_default,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.full_name || !formData.phone || !formData.address_line_1 || !formData.city || !normalizeState(formData.state) || !formData.pincode) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (editingAddress) {
      const success = await updateAddress(editingAddress.id, formData);
      if (success) {
        setIsDialogOpen(false);
        resetForm();
      }
    } else {
      const result = await addAddress(formData);
      if (result) {
        setIsDialogOpen(false);
        resetForm();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this address?")) {
      await deleteAddress(id);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <AccountSectionTitle
        title="Saved addresses"
        text="Manage your shipping addresses for faster checkout"
        action={
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex h-11 shrink-0 items-center gap-2 border border-foreground px-5 text-[11px] font-medium uppercase tracking-[0.2em] transition-colors hover:bg-foreground hover:text-background"
              >
                <Plus className="h-4 w-4" />
                Add address
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-none bg-ivory sm:rounded-none">
              <DialogHeader>
                <DialogTitle className="font-serif text-2xl font-normal">{editingAddress ? "Edit address" : "Add a new address"}</DialogTitle>
                <DialogDescription>
                  {editingAddress ? "Update your address details" : "Add a new shipping address"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="label" className={accountLabelClass}>Address label (e.g., Home, Office)</Label>
                  <Input
                    id="label"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    placeholder="Home"
                    className={accountFieldClass}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="full_name" className={accountLabelClass}>Full name *</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="John Doe"
                    className={accountFieldClass}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone" className={accountLabelClass}>Phone number *</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 9876543210"
                    className={accountFieldClass}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address_line_1" className={accountLabelClass}>Address line 1 *</Label>
                  <Input
                    id="address_line_1"
                    value={formData.address_line_1}
                    onChange={(e) => setFormData({ ...formData, address_line_1: e.target.value })}
                    placeholder="House/Flat No., Building Name"
                    className={accountFieldClass}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address_line_2" className={accountLabelClass}>Address line 2</Label>
                  <Input
                    id="address_line_2"
                    value={formData.address_line_2}
                    onChange={(e) => setFormData({ ...formData, address_line_2: e.target.value })}
                    placeholder="Street, Area, Landmark"
                    className={accountFieldClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="city" className={accountLabelClass}>City *</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="Mumbai"
                      className={accountFieldClass}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="state" className={accountLabelClass}>State *</Label>
                    <StateSelect
                      id="state"
                      value={formData.state}
                      onChange={(state) => setFormData({ ...formData, state })}
                      className={accountFieldClass}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pincode" className={accountLabelClass}>Pincode *</Label>
                  <Input
                    id="pincode"
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                    placeholder="400001"
                    className={accountFieldClass}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_default"
                    checked={formData.is_default}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked as boolean })}
                  />
                  <Label htmlFor="is_default">Set as default address</Label>
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="h-12 w-full bg-primary text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground transition-colors hover:bg-maroon-deep"
                >
                  {editingAddress ? "Update address" : "Save address"}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {addresses.length === 0 ? (
        <div className="border border-dashed border-foreground/15 px-6 py-14 text-center">
          <MapPin className="mx-auto mb-4 h-8 w-8 text-gold" strokeWidth={1.5} />
          <p className="font-serif text-2xl">No saved addresses yet</p>
          <p className="mt-2 text-sm text-muted-foreground">Add an address for faster checkout</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {addresses.map((address) => (
            <div
              key={address.id}
              className={cn("flex flex-col border p-5", address.is_default ? "border-foreground bg-ivory" : "border-border")}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {address.label && (
                    <span className="border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]">
                      {address.label}
                    </span>
                  )}
                  {address.is_default && (
                    <span className="inline-flex items-center gap-1 bg-primary px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-primary-foreground">
                      <Star className="h-3 w-3" />
                      Default
                    </span>
                  )}
                </div>
                <div className="-mr-2 -mt-1 flex">
                  <button type="button" onClick={() => handleEdit(address)} className="p-2 text-muted-foreground hover:text-foreground" aria-label="Edit address">
                    <Edit className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => handleDelete(address.id)} className="p-2 text-muted-foreground hover:text-destructive" aria-label="Delete address">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 space-y-1 text-sm">
                <p className="font-medium">{address.full_name}</p>
                <p className="text-muted-foreground">{address.phone}</p>
                <p className="text-muted-foreground">
                  {address.address_line_1}
                  {address.address_line_2 && `, ${address.address_line_2}`}
                </p>
                <p className="text-muted-foreground">
                  {address.city}, {address.state} - {address.pincode}
                </p>
              </div>
              {!address.is_default && (
                <button
                  type="button"
                  className="mt-4 self-start text-[11px] font-medium uppercase tracking-[0.18em] text-primary underline-offset-4 hover:underline"
                  onClick={() => setDefaultAddress(address.id)}
                >
                  Set as default
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
