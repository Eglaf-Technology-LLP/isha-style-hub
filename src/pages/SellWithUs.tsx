import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useVendor } from "@/hooks/useVendor";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Store,
  TrendingUp,
  ShieldCheck,
  Wallet,
  Users,
  ArrowRight,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

const benefits = [
  {
    icon: TrendingUp,
    title: "Reach lakhs of shoppers",
    desc: "List on a fast-growing Indian fashion marketplace with built-in discovery.",
  },
  {
    icon: Wallet,
    title: "Split payouts, your rates",
    desc: "Set your own shipping & return policy. Funds reach you per order minus a flat commission.",
  },
  {
    icon: ShieldCheck,
    title: "Trusted-partner fast-track",
    desc: "Once approved as a trusted partner, your products publish instantly — no waiting.",
  },
  {
    icon: Users,
    title: "Your own back-office",
    desc: "Manage products, inventory, orders, fulfilment and analytics from one dashboard.",
  },
];

export default function SellWithUs() {
  const { user, loading: authLoading } = useAuth();
  const { vendor, loading: vendorLoading, registerVendor } = useVendor();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    contact_email: user?.email || "",
    contact_phone: "",
    gst_number: "",
    pan_number: "",
    address_line1: "",
    city: "",
    state: "",
    pincode: "",
    shipping_flat_rate: "99",
    free_shipping_threshold: "999",
    return_window_days: "7",
    return_policy:
      "7-day easy returns. Items must be unused with original tags and packaging intact.",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (authLoading || vendorLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex justify-center items-center py-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <Footer />
      </div>
    );
  }

  // Already registered → route to the right place
  if (vendor) {
    navigate(vendor.status === "approved" ? "/vendor" : "/vendor/pending", {
      replace: true,
    });
    return null;
  }

  // Not signed in → prompt
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16">
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <Store className="h-16 w-16 mx-auto text-primary mb-4" />
              <CardTitle>Sign in to start selling</CardTitle>
              <CardDescription>
                Create an account or sign in, then submit your store application to
                join Isha Fashion Hub as a vendor.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full"
                onClick={() => navigate("/admin?redirect=/sell-with-us")}
              >
                Sign In / Create Account
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate("/")}
              >
                Continue Shopping
              </Button>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Store name is required");
      return;
    }
    setSubmitting(true);
    const { error } = await registerVendor({
      name: form.name.trim(),
      description: form.description.trim(),
      contact_email: form.contact_email.trim(),
      contact_phone: form.contact_phone.trim(),
      gst_number: form.gst_number.trim(),
      pan_number: form.pan_number.trim(),
      address: {
        line1: form.address_line1.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
      },
      shipping_flat_rate: Number(form.shipping_flat_rate) || 0,
      free_shipping_threshold: form.free_shipping_threshold
        ? Number(form.free_shipping_threshold)
        : null,
      return_window_days: Number(form.return_window_days) || 7,
      return_policy: form.return_policy.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error);
      return;
    }
    navigate("/vendor/pending");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-secondary/30 border-b border-border">
        <div className="container mx-auto px-4 py-16 text-center max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-4">
            <Store className="h-4 w-4" /> Marketplace Vendor Program
          </span>
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">
            Sell your brand to all of India
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            Open your own storefront on Isha Fashion Hub. Keep full control of your
            products, pricing, shipping and returns — we bring the customers.
          </p>
          <Button size="lg" onClick={() => document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" })}>
            Start your application <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* Benefits */}
      <section className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((b) => (
            <Card key={b.title} className="h-full">
              <CardHeader>
                <b.icon className="h-8 w-8 text-primary mb-2" />
                <CardTitle className="text-lg">{b.title}</CardTitle>
                <CardDescription>{b.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Application form */}
      <section id="apply" className="container mx-auto px-4 py-12">
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-serif">Vendor application</CardTitle>
            <CardDescription>
              Tell us about your store. Our team reviews applications within 1–2
              business days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Store name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. Anaya Ethnic Wear"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Store description</Label>
                <Textarea
                  id="description"
                  placeholder="What do you sell? What makes your brand special?"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contact_email">Contact email</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    placeholder="owner@brand.com"
                    value={form.contact_email}
                    onChange={(e) => set("contact_email", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_phone">Contact phone</Label>
                  <Input
                    id="contact_phone"
                    placeholder="+91 98765 43210"
                    value={form.contact_phone}
                    onChange={(e) => set("contact_phone", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gst_number">GST number</Label>
                  <Input
                    id="gst_number"
                    placeholder="22AAAAA0000A1Z5"
                    value={form.gst_number}
                    onChange={(e) => set("gst_number", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pan_number">PAN number</Label>
                  <Input
                    id="pan_number"
                    placeholder="AAAAA0000A"
                    value={form.pan_number}
                    onChange={(e) => set("pan_number", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address_line1">Business address</Label>
                <Input
                  id="address_line1"
                  placeholder="Address line 1"
                  value={form.address_line1}
                  onChange={(e) => set("address_line1", e.target.value)}
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                  <Input placeholder="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
                  <Input placeholder="State" value={form.state} onChange={(e) => set("state", e.target.value)} />
                  <Input placeholder="PIN code" value={form.pincode} onChange={(e) => set("pincode", e.target.value)} />
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/30">
                <h4 className="font-semibold flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" /> Shipping & returns
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="shipping_flat_rate">Flat shipping (₹)</Label>
                    <Input
                      id="shipping_flat_rate"
                      type="number"
                      min={0}
                      value={form.shipping_flat_rate}
                      onChange={(e) => set("shipping_flat_rate", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="free_shipping_threshold">Free over (₹)</Label>
                    <Input
                      id="free_shipping_threshold"
                      type="number"
                      min={0}
                      value={form.free_shipping_threshold}
                      onChange={(e) => set("free_shipping_threshold", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="return_window_days">Return window (days)</Label>
                    <Input
                      id="return_window_days"
                      type="number"
                      min={0}
                      value={form.return_window_days}
                      onChange={(e) => set("return_window_days", e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="return_policy">Return policy</Label>
                  <Textarea
                    id="return_policy"
                    rows={2}
                    value={form.return_policy}
                    onChange={(e) => set("return_policy", e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                <p>
                  By submitting, you agree to the marketplace terms. New stores start
                  un-trusted (products need admin approval); the super admin can grant
                  trusted-partner status to publish instantly.
                </p>
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit application
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <Footer />
    </div>
  );
}
