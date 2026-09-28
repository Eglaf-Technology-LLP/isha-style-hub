import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Loader2, ShieldCheck, Truck, Landmark, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Vendor } from "@/hooks/useVendor";

interface PayoutAccount {
  account_holder_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  business_type: string;
  razorpay_account_id: string | null;
}

interface OwnerProfile {
  full_name: string | null;
  phone: string | null;
}

interface Props {
  vendor: Vendor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

// Everything about one vendor application/store, in one place - the
// summary table only ever showed name/status/commission/shipping, and the
// old edit dialog only touched 5 of the ~25 real columns on `vendors`.
// This shows every field (including ones nothing on the admin side ever
// surfaced before: GST/PAN, full address, logo/banner, payout bank
// details, application/approval timestamps, owner account) and lets the
// admin edit the business-facing fields directly, mirroring exactly what
// VendorSettingsDialog.tsx lets the vendor edit about themselves.
export function VendorDetailsDialog({ vendor, open, onOpenChange, onSaved }: Props) {
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
    commission_rate: "0",
    shipping_flat_rate: "0",
    free_shipping_threshold: "",
    return_window_days: "7",
    return_policy: "",
  });
  const [codEnabled, setCodEnabled] = useState(true);
  const [returnsEnabled, setReturnsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccount | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const [loadingExtra, setLoadingExtra] = useState(false);

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
      commission_rate: String(vendor.commission_rate ?? 0),
      shipping_flat_rate: String(vendor.shipping_flat_rate ?? 0),
      free_shipping_threshold:
        vendor.free_shipping_threshold != null ? String(vendor.free_shipping_threshold) : "",
      return_window_days: String(vendor.return_window_days ?? 7),
      return_policy: vendor.return_policy || "",
    });
    setCodEnabled(vendor.cod_enabled);
    setReturnsEnabled(vendor.returns_enabled);

    setLoadingExtra(true);
    Promise.all([
      supabase
        .from("vendor_payout_accounts")
        .select("account_holder_name, bank_account_number, bank_ifsc, business_type, razorpay_account_id")
        .eq("vendor_id", vendor.id)
        .maybeSingle(),
      vendor.owner_user_id
        ? supabase.from("profiles").select("full_name, phone").eq("user_id", vendor.owner_user_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]).then(([payoutRes, profileRes]) => {
      setPayoutAccount((payoutRes.data as PayoutAccount) ?? null);
      setOwnerProfile((profileRes.data as OwnerProfile) ?? null);
      setLoadingExtra(false);
    });
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
          commission_rate: Number(form.commission_rate) || 0,
          shipping_flat_rate: Number(form.shipping_flat_rate) || 0,
          free_shipping_threshold: form.free_shipping_threshold ? Number(form.free_shipping_threshold) : null,
          return_window_days: Number(form.return_window_days) || 7,
          return_policy: form.return_policy.trim() || null,
          cod_enabled: codEnabled,
          returns_enabled: returnsEnabled,
        })
        .eq("id", vendor.id);
      if (error) throw error;

      if (addressChanged && vendor.shiprocket_pickup_location) {
        toast.info("Pickup address changed - it will be re-registered with the courier on their next shipment.");
      }
      toast.success("Vendor updated");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to update vendor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{vendor.name}</DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            <span>/store/{vendor.slug}</span>
            <Badge variant="outline" className="capitalize">
              {vendor.status}
            </Badge>
            {vendor.is_trusted && (
              <Badge variant="secondary" className="gap-1">
                <ShieldCheck className="h-3 w-3" /> Trusted
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-3">
          <div className="space-y-6">
            {/* Application & Account - read only */}
            <section>
              <h4 className="font-medium mb-3">Application &amp; Account</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Boutique Code" value={<span className="font-mono">{vendor.boutique_code}</span>} />
                <Field label="Applied On" value={format(new Date(vendor.created_at), "MMM d, yyyy")} />
                <Field
                  label="Approved On"
                  value={vendor.approved_at ? format(new Date(vendor.approved_at), "MMM d, yyyy") : "Not yet approved"}
                />
                <Field label="Rating" value={vendor.rating != null ? `${vendor.rating.toFixed(1)} / 5` : "No ratings yet"} />
                <Field
                  label="Payout Account"
                  value={
                    <span className="capitalize">
                      {vendor.payout_account_status.replace(/_/g, " ")}
                    </span>
                  }
                />
                <Field
                  label="Shiprocket Pickup"
                  value={
                    vendor.shiprocket_pickup_location ? (
                      <span className="inline-flex items-center gap-1">
                        <Truck className="h-3.5 w-3.5" /> Registered
                      </span>
                    ) : (
                      "Not registered"
                    )
                  }
                />
                <Field
                  label="Account Holder"
                  value={
                    loadingExtra ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : ownerProfile?.full_name ? (
                      `${ownerProfile.full_name}${ownerProfile.phone ? ` · ${ownerProfile.phone}` : ""}`
                    ) : (
                      "Not linked"
                    )
                  }
                />
              </div>
            </section>

            <Separator />

            {/* Branding - read only preview */}
            {(vendor.logo_url || vendor.banner_url) && (
              <>
                <section>
                  <h4 className="font-medium mb-3">Branding</h4>
                  <div className="flex items-center gap-6 flex-wrap">
                    {vendor.logo_url && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Logo</p>
                        <img src={vendor.logo_url} alt="Logo" className="h-16 w-16 object-cover rounded-lg border" />
                      </div>
                    )}
                    {vendor.banner_url && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Banner</p>
                        <img src={vendor.banner_url} alt="Banner" className="h-16 w-32 object-cover rounded-lg border" />
                      </div>
                    )}
                  </div>
                </section>
                <Separator />
              </>
            )}

            {/* Business Details - editable */}
            <section className="space-y-4">
              <h4 className="font-medium">Business Details</h4>
              <div className="space-y-2">
                <Label htmlFor="vd-name">Store name</Label>
                <Input id="vd-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vd-description">Description</Label>
                <Textarea
                  id="vd-description"
                  rows={3}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vd-email">Contact email</Label>
                  <Input
                    id="vd-email"
                    type="email"
                    value={form.contact_email}
                    onChange={(e) => set("contact_email", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vd-phone">Contact phone</Label>
                  <Input id="vd-phone" value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vd-gst">GST number</Label>
                  <Input id="vd-gst" value={form.gst_number} onChange={(e) => set("gst_number", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vd-pan">PAN number</Label>
                  <Input id="vd-pan" value={form.pan_number} onChange={(e) => set("pan_number", e.target.value)} />
                </div>
              </div>
            </section>

            <Separator />

            {/* Address - editable */}
            <section className="space-y-4">
              <h4 className="font-medium">Pickup Address</h4>
              <div className="space-y-2">
                <Label htmlFor="vd-addr1">Address line 1</Label>
                <Input id="vd-addr1" value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vd-addr2">Address line 2</Label>
                <Input id="vd-addr2" value={form.address_line2} onChange={(e) => set("address_line2", e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vd-city">City</Label>
                  <Input id="vd-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vd-state">State</Label>
                  <Input id="vd-state" value={form.state} onChange={(e) => set("state", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vd-pincode">Pincode</Label>
                  <Input id="vd-pincode" value={form.pincode} onChange={(e) => set("pincode", e.target.value)} />
                </div>
              </div>
            </section>

            <Separator />

            {/* Fees & Policies - editable */}
            <section className="space-y-4">
              <h4 className="font-medium">Fees &amp; Policies</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vd-commission">Commission rate (%)</Label>
                  <Input
                    id="vd-commission"
                    type="number"
                    min={0}
                    max={100}
                    value={form.commission_rate}
                    onChange={(e) => set("commission_rate", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vd-return-days">Return window (days)</Label>
                  <Input
                    id="vd-return-days"
                    type="number"
                    value={form.return_window_days}
                    onChange={(e) => set("return_window_days", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vd-shipping">Flat shipping (₹)</Label>
                  <Input
                    id="vd-shipping"
                    type="number"
                    value={form.shipping_flat_rate}
                    onChange={(e) => set("shipping_flat_rate", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vd-free-over">Free shipping over (₹)</Label>
                  <Input
                    id="vd-free-over"
                    type="number"
                    value={form.free_shipping_threshold}
                    onChange={(e) => set("free_shipping_threshold", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vd-return-policy">Return policy</Label>
                <Textarea
                  id="vd-return-policy"
                  rows={2}
                  value={form.return_policy}
                  onChange={(e) => set("return_policy", e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="vd-cod">Cash on Delivery</Label>
                  <p className="text-xs text-muted-foreground">
                    Off hides COD as a payment option for this vendor's products at checkout.
                  </p>
                </div>
                <Switch id="vd-cod" checked={codEnabled} onCheckedChange={setCodEnabled} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="vd-returns">Returns</Label>
                  <p className="text-xs text-muted-foreground">
                    Off hides the return option for this vendor's products, even if a product itself allows returns.
                  </p>
                </div>
                <Switch id="vd-returns" checked={returnsEnabled} onCheckedChange={setReturnsEnabled} />
              </div>
            </section>

            <Separator />

            {/* Payout Account - read only, admin needs this to actually pay the vendor */}
            <section>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Landmark className="h-4 w-4" /> Payout Bank Details
              </h4>
              {loadingExtra ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : payoutAccount ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Account Holder" value={payoutAccount.account_holder_name} />
                  <Field label="Account Number" value={<span className="font-mono">{payoutAccount.bank_account_number}</span>} />
                  <Field label="IFSC" value={<span className="font-mono">{payoutAccount.bank_ifsc}</span>} />
                  <Field label="Business Type" value={<span className="capitalize">{payoutAccount.business_type.replace(/_/g, " ")}</span>} />
                  {payoutAccount.razorpay_account_id && (
                    <Field label="Razorpay Account" value={payoutAccount.razorpay_account_id} />
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No payout account submitted yet.</p>
              )}
            </section>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
