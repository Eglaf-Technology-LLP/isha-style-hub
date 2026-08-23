import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useVendor } from "@/hooks/useVendor";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Package,
  ShoppingCart,
  IndianRupee,
  Store,
  Eye,
  Plus,
  Pencil,
  Trash2,
  Landmark,
  LayoutDashboard,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VendorProductDialog } from "@/components/vendor/VendorProductDialog";
import { VendorSettingsDialog } from "@/components/vendor/VendorSettingsDialog";
import { InventoryAlerts } from "@/components/admin/InventoryAlerts";
import { VariantStockDialog } from "@/components/admin/VariantStockDialog";
import { VendorAnalyticsSection } from "@/components/vendor/VendorAnalyticsSection";
import { useLowStockAlerts } from "@/hooks/useLowStockAlerts";
import { useShipments } from "@/hooks/useShipments";
import { ShipmentTimelineDialog } from "@/components/admin/ShipmentTimelineDialog";
import { ShipNowDialog } from "@/components/admin/ShipNowDialog";
import { ProductVariant, ProductSpecification, mapDbVariant } from "@/hooks/useProducts";
import { ExternalLink, XCircle } from "lucide-react";

interface VendorProduct {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  is_active: boolean;
  approval_status: string;
  images: string[];
  description: string | null;
  category_id: string | null;
  compare_at_price: number | null;
  sku: string | null;
  variants: ProductVariant[];
  weight_grams: number | null;
  length_cm: number | null;
  breadth_cm: number | null;
  height_cm: number | null;
  specifications: ProductSpecification[];
  country_of_origin: string;
  net_quantity: string;
}

interface VendorOrder {
  id: string;
  order_id: string;
  subtotal: number;
  shipping_cost: number;
  net_payable: number;
  status: string;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
  customer_name?: string;
  customer_phone?: string;
  shipping_address?: { city?: string; state?: string; pincode?: string } | null;
}

interface PayoutAccountForm {
  account_holder_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  business_type: string;
}

const BUSINESS_TYPES = ["individual", "proprietorship", "partnership", "private_limited", "llp"];

export default function VendorDashboard() {
  const { vendor, loading, refresh: refreshVendor } = useVendor();
  const { totalAlerts: lowStockAlerts } = useLowStockAlerts(vendor?.id);
  const navigate = useNavigate();
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<VendorProduct | null>(null);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccountForm>({
    account_holder_name: "",
    bank_account_number: "",
    bank_ifsc: "",
    business_type: "individual",
  });
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const savePayoutAccount = async () => {
    if (!vendor) return;
    if (
      !payoutAccount.account_holder_name.trim() ||
      !payoutAccount.bank_account_number.trim() ||
      !payoutAccount.bank_ifsc.trim()
    ) {
      toast.error("Please fill in account holder name, account number and IFSC");
      return;
    }
    setPayoutSaving(true);
    try {
      const { error } = await supabase.from("vendor_payout_accounts").upsert(
        {
          vendor_id: vendor.id,
          account_holder_name: payoutAccount.account_holder_name.trim(),
          bank_account_number: payoutAccount.bank_account_number.trim(),
          bank_ifsc: payoutAccount.bank_ifsc.trim().toUpperCase(),
          business_type: payoutAccount.business_type,
        },
        { onConflict: "vendor_id" }
      );
      if (error) throw error;

      // Payout account is now submitted; marketplace-side verification with
      // the payment gateway happens separately and flips this to "active".
      await supabase
        .from("vendors")
        .update({ payout_account_status: "pending" })
        .eq("id", vendor.id);

      toast.success("Payout details saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save payout details");
    } finally {
      setPayoutSaving(false);
    }
  };

  const deleteProduct = async (p: VendorProduct) => {
    if (!window.confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) throw error;
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
      toast.success("Product deleted");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete product");
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!vendor) {
      navigate("/sell-with-us", { replace: true });
      return;
    }
    if (vendor.status !== "approved") {
      navigate("/vendor/pending", { replace: true });
      return;
    }
    fetchAll();
  }, [loading, vendor, navigate]);

  const fetchAll = async () => {
    if (!vendor) return;
    setDataLoading(true);
    try {
      const [prodRes, voRes, payoutRes] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id, name, price, stock_quantity, is_active, approval_status, images, description, category_id, compare_at_price, sku, weight_grams, length_cm, breadth_cm, height_cm, specifications, country_of_origin, net_quantity, product_variants(*)"
          )
          .eq("vendor_id", vendor.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("vendor_orders")
          .select(
            "id, order_id, subtotal, shipping_cost, net_payable, status, tracking_number, carrier, created_at"
          )
          .eq("vendor_id", vendor.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("vendor_payout_accounts")
          .select("account_holder_name, bank_account_number, bank_ifsc, business_type")
          .eq("vendor_id", vendor.id)
          .maybeSingle(),
      ]);

      if (prodRes.error) throw prodRes.error;
      setProducts(
        (prodRes.data || []).map((p: any) => ({
          ...p,
          variants: (p.product_variants || []).map(mapDbVariant),
        }))
      );

      if (payoutRes.data) {
        setPayoutAccount(payoutRes.data as PayoutAccountForm);
      }

      const vOrders = (voRes.data || []) as VendorOrder[];
      // fetch customer names for these orders
      if (vOrders.length > 0) {
        const ids = vOrders.map((o) => o.order_id);
        const { data: ords } = await supabase
          .from("orders")
          .select("id, customer_name, customer_phone, shipping_address")
          .in("id", ids);
        const map = new Map((ords || []).map((o: any) => [o.id, o]));
        vOrders.forEach((o) => {
          const ord = map.get(o.order_id);
          o.customer_name = ord?.customer_name || "Customer";
          o.customer_phone = ord?.customer_phone;
          o.shipping_address = ord?.shipping_address;
        });
      }
      setOrders(vOrders);
    } catch (e: any) {
      console.error("dashboard load error:", e);
      toast.error("Failed to load dashboard data");
    } finally {
      setDataLoading(false);
    }
  };

  const toggleActive = async (p: VendorProduct, value: boolean) => {
    try {
      const { error } = await supabase
        .from("products")
        .update({ is_active: value })
        .eq("id", p.id);
      if (error) throw error;
      setProducts((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, is_active: value } : x))
      );
      toast.success(value ? "Product listed" : "Product unlisted");
    } catch (e: any) {
      toast.error(e.message || "Failed to update product");
    }
  };

  const { forwardShipmentFor, actioningId, checkServiceability, shipNow, cancelShipment } = useShipments(
    orders.map((o) => o.id)
  );

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-blue-100 text-blue-800",
    processing: "bg-purple-100 text-purple-800",
    shipped: "bg-indigo-100 text-indigo-800",
    out_for_delivery: "bg-indigo-100 text-indigo-800",
    delivered: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    returned: "bg-gray-100 text-gray-800",
    ndr: "bg-orange-100 text-orange-800",
  };

  if (loading || !vendor || vendor.status !== "approved") {
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

  const revenue = orders.reduce((s, o) => s + Number(o.net_payable || 0), 0);
  const pendingOrders = orders.filter((o) => o.status === "pending").length;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Vendor header */}
      <div className="border-b border-border bg-secondary/30">
        <div className="container mx-auto px-4 py-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Store className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold">{vendor.name}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>/store/{vendor.slug}</span>
                {vendor.is_trusted && (
                  <Badge variant="secondary" className="text-xs">
                    Trusted partner
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to={`/store/${vendor.slug}`}>
              <Button variant="outline" size="sm">
                <Eye className="h-4 w-4 mr-2" /> View storefront
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
              Store settings
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full max-w-3xl grid-cols-6">
            <TabsTrigger value="dashboard" className="flex items-center gap-1">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-1">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="flex items-center gap-1 relative">
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Inventory</span>
              {lowStockAlerts > 0 && (
                <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                  {lowStockAlerts}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-1">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Products</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-1">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Orders</span>
            </TabsTrigger>
            <TabsTrigger value="payouts" className="flex items-center gap-1">
              <Landmark className="h-4 w-4" />
              <span className="hidden sm:inline">Payouts</span>
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                    <Package className="h-4 w-4" /> Products
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">
                    {dataLoading ? "..." : products.length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" /> Orders
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">
                    {dataLoading ? "..." : orders.length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" /> Pending fulfilment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">
                    {dataLoading ? "..." : pendingOrders}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                    <IndianRupee className="h-4 w-4" /> Net payable
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">
                    {dataLoading ? "..." : `₹${revenue.toFixed(0)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Commission {vendor.commission_rate}%
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <VendorAnalyticsSection vendorId={vendor.id} />
          </TabsContent>

          {/* Inventory Tab */}
          <TabsContent value="inventory">
            <InventoryAlerts vendorId={vendor.id} />
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" /> Your products
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingProduct(null);
                    setProductDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" /> Add product
                </Button>
              </CardHeader>
              <CardContent>
                {dataLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : products.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No products yet. Use “Add product” to create your first listing.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Stock</TableHead>
                          <TableHead>Approval</TableHead>
                          <TableHead>Visible</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell>₹{Number(p.price).toFixed(0)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {p.stock_quantity}
                                <VariantStockDialog productName={p.name} variants={p.variants} />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  p.approval_status === "approved"
                                    ? "secondary"
                                    : p.approval_status === "rejected"
                                    ? "destructive"
                                    : "outline"
                                }
                                className="capitalize"
                              >
                                {p.approval_status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={p.is_active ? "listed" : "unlisted"}
                                onValueChange={(v) => toggleActive(p, v === "listed")}
                              >
                                <SelectTrigger className="w-28 h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="listed">Listed</SelectItem>
                                  <SelectItem value="unlisted">Hidden</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Edit ${p.name}`}
                                onClick={() => {
                                  setEditingProduct(p);
                                  setProductDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Delete ${p.name}`}
                                onClick={() => deleteProduct(p)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}

                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" /> Orders to fulfil
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dataLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : orders.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No orders yet. Orders will appear here once customers buy your products.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Shipment</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono text-xs">
                              {o.order_id.slice(0, 8)}
                              <div className="text-muted-foreground">
                                {new Date(o.created_at).toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>{o.customer_name || "Customer"}</div>
                              {o.customer_phone && (
                                <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                              )}
                              {o.shipping_address?.city && (
                                <div className="text-xs text-muted-foreground">
                                  {o.shipping_address.city}, {o.shipping_address.state} {o.shipping_address.pincode}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>₹{Number(o.net_payable).toFixed(0)}</TableCell>
                            <TableCell>
                              <Badge className={`${statusColors[o.status] || "bg-muted"} capitalize`}>
                                {o.status.replace(/_/g, " ")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const shipment = forwardShipmentFor(o.id);
                                if (!shipment || (!shipment.awb_code && shipment.status === "cancelled")) {
                                  if (o.status === "cancelled") {
                                    return <span className="text-xs text-muted-foreground">Cancelled</span>;
                                  }
                                  return (
                                    <ShipNowDialog
                                      vendorOrderId={o.id}
                                      actioning={actioningId === o.id}
                                      checkServiceability={checkServiceability}
                                      shipNow={shipNow}
                                    />
                                  );
                                }
                                return (
                                  <div className="text-xs space-y-1">
                                    <div className="font-medium">{shipment.courier_name || "Courier assigned"}</div>
                                    {shipment.awb_code && (
                                      <div className="font-mono text-muted-foreground">AWB {shipment.awb_code}</div>
                                    )}
                                    <div className="flex items-center gap-2">
                                      {shipment.label_url && (
                                        <a
                                          href={shipment.label_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-primary inline-flex items-center gap-0.5 hover:underline"
                                        >
                                          Label <ExternalLink className="h-3 w-3" />
                                        </a>
                                      )}
                                      {["pending", "awb_assigned", "pickup_scheduled"].includes(shipment.status) && (
                                        <button
                                          className="text-destructive inline-flex items-center gap-0.5 hover:underline disabled:opacity-50"
                                          disabled={actioningId === o.id}
                                          onClick={() => cancelShipment(o.id)}
                                        >
                                          <XCircle className="h-3 w-3" /> Cancel
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const shipment = forwardShipmentFor(o.id);
                                if (!shipment) return null;
                                return (
                                  <div className="flex items-center gap-2">
                                    {shipment.awb_code && (
                                      <a
                                        href={`https://shiprocket.co/tracking/${shipment.awb_code}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-primary inline-flex items-center gap-0.5 hover:underline"
                                      >
                                        Track <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                    <ShipmentTimelineDialog shipmentId={shipment.id} awbCode={shipment.awb_code} />
                                  </div>
                                );
                              })()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payouts Tab */}
          <TabsContent value="payouts">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Landmark className="h-5 w-5" /> Payout details
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Where we send your earnings. Status: {vendor.payout_account_status.replace("_", " ")}.
                </p>
              </CardHeader>
              <CardContent className="space-y-4 max-w-xl">
                <div className="space-y-2">
                  <Label htmlFor="po-name">Account holder name</Label>
                  <Input
                    id="po-name"
                    value={payoutAccount.account_holder_name}
                    onChange={(e) =>
                      setPayoutAccount((f) => ({ ...f, account_holder_name: e.target.value }))
                    }
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="po-acc">Bank account number</Label>
                    <Input
                      id="po-acc"
                      value={payoutAccount.bank_account_number}
                      onChange={(e) =>
                        setPayoutAccount((f) => ({ ...f, bank_account_number: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="po-ifsc">IFSC code</Label>
                    <Input
                      id="po-ifsc"
                      value={payoutAccount.bank_ifsc}
                      onChange={(e) =>
                        setPayoutAccount((f) => ({ ...f, bank_ifsc: e.target.value.toUpperCase() }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Business type</Label>
                  <Select
                    value={payoutAccount.business_type}
                    onValueChange={(v) => setPayoutAccount((f) => ({ ...f, business_type: v }))}
                  >
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUSINESS_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">
                          {t.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={savePayoutAccount} disabled={payoutSaving}>
                  {payoutSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save payout details
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <VendorProductDialog
        open={productDialogOpen}
        onOpenChange={setProductDialogOpen}
        vendorId={vendor.id}
        isTrusted={vendor.is_trusted}
        product={editingProduct}
        onSaved={fetchAll}
      />

      <VendorSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        vendor={vendor}
        onSaved={refreshVendor}
      />

      <Footer />
    </div>
  );
}
