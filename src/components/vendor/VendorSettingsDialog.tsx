import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Vendor } from "@/hooks/useVendor";
import { SingleImageDropzone } from "@/components/ImageDropzone";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor: Vendor;
  onSaved: () => void;
}

// Self-service editing of everything a vendor is meant to control -
// name, description, contact info, shipping/returns. Deliberately does
// NOT include is_trusted/commission_rate/status: those are admin-only,
// and the protect_vendor_admin_fields DB trigger enforces that
// regardless of what this form ever sends.
export function VendorSettingsDialog({ open, onOpenChange, vendor, onSaved }: Props) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    contact_email: "",
    contact_phone: "",
    gst_number: "",
    pan_number: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    pincode: "",
    shipping_flat_rate: "0",
    free_shipping_threshold: "",
    return_window_days: "7",
    return_policy: "",
  });
  const [codEnabled, setCodEnabled] = useState(true);
  const [returnsEnabled, setReturnsEnabled] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: vendor.name || "",
      description: vendor.description || "",
      contact_email: vendor.contact_email || "",
      contact_phone: vendor.contact_phone || "",
      gst_number: vendor.gst_number || "",
      pan_number: vendor.pan_number || "",
      address_line1: vendor.address?.address_line1 || "",
      address_line2: vendor.address?.address_line2 || "",
      city: vendor.address?.city || "",
      state: vendor.address?.state || "",
      pincode: vendor.address?.pincode || "",
      shipping_flat_rate: String(vendor.shipping_flat_rate ?? 0),
      free_shipping_threshold:
        vendor.free_shipping_threshold != null ? String(vendor.free_shipping_threshold) : "",
      return_window_days: String(vendor.return_window_days ?? 7),
      return_policy: vendor.return_policy || "",
    });
    setCodEnabled(vendor.cod_enabled);
    setReturnsEnabled(vendor.returns_enabled);
    setLogoUrl(vendor.logo_url);
    setBannerUrl(vendor.banner_url);
  }, [open, vendor]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Store name is required");

    setSaving(true);
    try {
      const newAddress = {
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        country: "India",
      };
      // The Shiprocket pickup location is tied to the address it was
      // registered with - if the address actually changed, drop the
      // registration so "Ship Now" re-registers against the new one
      // instead of silently shipping from a stale address.
      const addressChanged =
        newAddress.address_line1 !== (vendor.address?.address_line1 || "") ||
        newAddress.address_line2 !== (vendor.address?.address_line2 || "") ||
        newAddress.city !== (vendor.address?.city || "") ||
        newAddress.state !== (vendor.address?.state || "") ||
        newAddress.pincode !== (vendor.address?.pincode || "");

      const { error } = await supabase
        .from("vendors")
        .update({
          name: form.name.trim(),
          description: form.description.trim() || null,
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          gst_number: form.gst_number.trim() || null,
          pan_number: form.pan_number.trim() || null,
          address: newAddress,
          ...(addressChanged && vendor.shiprocket_pickup_location
            ? { shiprocket_pickup_location: null, shiprocket_pickup_registered_at: null }
            : {}),
          shipping_flat_rate: Number(form.shipping_flat_rate) || 0,
          free_shipping_threshold: form.free_shipping_threshold
            ? Number(form.free_shipping_threshold)
            : null,
          return_window_days: Number(form.return_window_days) || 7,
          return_policy: form.return_policy.trim() || null,
          cod_enabled: codEnabled,
          returns_enabled: returnsEnabled,
          logo_url: logoUrl,
          banner_url: bannerUrl,
        })
        .eq("id", vendor.id);

      if (error) throw error;
      if (addressChanged && vendor.shiprocket_pickup_location) {
        toast.info("Pickup address changed - it will be re-registered with the courier on your next shipment.");
      }
      toast.success("Store settings updated");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to update store settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Store settings</DialogTitle>
          <DialogDescription>
            Your commission rate and trusted-partner status are set by the marketplace
            team, not here. Your boutique code (<span className="font-mono">{vendor.boutique_code}</span>) is
            permanent and can't be changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Store logo</Label>
              <SingleImageDropzone folder="vendor-uploads" value={logoUrl} onChange={setLogoUrl} />
            </div>
            <div className="space-y-2">
              <Label>Store banner</Label>
              <SingleImageDropzone folder="vendor-uploads" value={bannerUrl} onChange={setBannerUrl} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vs-name">Store name</Label>
            <Input id="vs-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vs-desc">Description</Label>
            <Textarea
              id="vs-desc"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vs-email">Contact email</Label>
              <Input
                id="vs-email"
                type="email"
                value={form.contact_email}
                onChange={(e) => set("contact_email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vs-phone">Contact phone</Label>
              <Input
                id="vs-phone"
                value={form.contact_phone}
                onChange={(e) => set("contact_phone", e.target.value)}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vs-gst">GST number</Label>
              <Input
                id="vs-gst"
                value={form.gst_number}
                onChange={(e) => set("gst_number", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vs-pan">PAN number</Label>
              <Input
                id="vs-pan"
                value={form.pan_number}
                onChange={(e) => set("pan_number", e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/30">
            <h4 className="font-semibold">Pickup address</h4>
            <p className="text-sm text-muted-foreground">
              Where couriers collect your orders for shipping. Keep this accurate and
              complete - it can't be used to ship until it is.
            </p>
            <div className="space-y-2">
              <Label htmlFor="vs-addr1">Address line 1</Label>
              <Input
                id="vs-addr1"
                value={form.address_line1}
                onChange={(e) => set("address_line1", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vs-addr2">Address line 2 (optional)</Label>
              <Input
                id="vs-addr2"
                value={form.address_line2}
                onChange={(e) => set("address_line2", e.target.value)}
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vs-city">City</Label>
                <Input id="vs-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vs-state">State</Label>
                <Input id="vs-state" value={form.state} onChange={(e) => set("state", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vs-pincode">PIN code</Label>
                <Input id="vs-pincode" value={form.pincode} onChange={(e) => set("pincode", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/30">
            <h4 className="font-semibold">Shipping &amp; returns</h4>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vs-ship">Flat shipping (₹)</Label>
                <Input
                  id="vs-ship"
                  type="number"
                  min={0}
                  value={form.shipping_flat_rate}
                  onChange={(e) => set("shipping_flat_rate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vs-free">Free over (₹)</Label>
                <Input
                  id="vs-free"
                  type="number"
                  min={0}
                  value={form.free_shipping_threshold}
                  onChange={(e) => set("free_shipping_threshold", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vs-window">Return window (days)</Label>
                <Input
                  id="vs-window"
                  type="number"
                  min={0}
                  value={form.return_window_days}
                  onChange={(e) => set("return_window_days", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vs-policy">Return policy</Label>
              <Textarea
                id="vs-policy"
                rows={2}
                value={form.return_policy}
                onChange={(e) => set("return_policy", e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
              <div>
                <Label htmlFor="vs-cod">Offer Cash on Delivery</Label>
                <p className="text-xs text-muted-foreground">Off hides COD at checkout for your products.</p>
              </div>
              <Switch id="vs-cod" checked={codEnabled} onCheckedChange={setCodEnabled} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
              <div>
                <Label htmlFor="vs-returns">Accept returns</Label>
                <p className="text-xs text-muted-foreground">
                  Off hides the return option for your products, even for items you've marked returnable.
                </p>
              </div>
              <Switch id="vs-returns" checked={returnsEnabled} onCheckedChange={setReturnsEnabled} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
