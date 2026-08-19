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
import { Loader2, Package, ShoppingCart, IndianRupee, Store, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface VendorProduct {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  is_active: boolean;
  approval_status: string;
  images: string[];
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
}

const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];

export default function VendorDashboard() {
  const { vendor, loading } = useVendor();
  const navigate = useNavigate();
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!vendor) return;
    if (vendor.status !== "approved") return;
    fetchAll();
  }, [loading, vendor]);

  const fetchAll = async () => {
    if (!vendor) return;
    setDataLoading(true);
    try {
      const [prodRes, voRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, price, stock_quantity, is_active, approval_status, images")
          .eq("vendor_id", vendor.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("vendor_orders")
          .select(
            "id, order_id, subtotal, shipping_cost, net_payable, status, tracking_number, carrier, created_at"
          )
          .eq("vendor_id", vendor.id)
          .order("created_at", { ascending: false }),
      ]);

      if (prodRes.error) throw prodRes.error;
      setProducts((prodRes.data || []) as VendorProduct[]);

      const vOrders = (voRes.data || []) as VendorOrder[];
      // fetch customer names for these orders
      if (vOrders.length > 0) {
        const ids = vOrders.map((o) => o.order_id);
        const { data: ords } = await supabase
          .from("orders")
          .select("id, customer_name")
          .in("id", ids);
        const map = new Map((ords || []).map((o: any) => [o.id, o.customer_name]));
        vOrders.forEach((o) => (o.customer_name = map.get(o.order_id) || "Customer"));
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

  const updateOrder = async (
    o: VendorOrder,
    patch: Partial<VendorOrder>
  ) => {
    setSavingId(o.id);
    try {
      const { error } = await supabase
        .from("vendor_orders")
        .update({
          status: patch.status ?? o.status,
          tracking_number: patch.tracking_number ?? o.tracking_number,
          carrier: patch.carrier ?? o.carrier,
        })
        .eq("id", o.id);
      if (error) throw error;
      setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, ...patch } : x)));
      toast.success("Order updated");
    } catch (e: any) {
      toast.error(e.message || "Failed to update order");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
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

  if (!vendor) {
    navigate("/sell-with-us", { replace: true });
    return null;
  }

  if (vendor.status !== "approved") {
    navigate("/vendor/pending", { replace: true });
    return null;
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
            <Link to="/sell-with-us">
              <Button variant="ghost" size="sm">
                Store settings
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
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

        {/* Products */}
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
                        <TableCell>{p.stock_quantity}</TableCell>
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

        {/* Orders */}
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
                      <TableHead>Tracking</TableHead>
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
                        <TableCell>{o.customer_name || "Customer"}</TableCell>
                        <TableCell>₹{Number(o.net_payable).toFixed(0)}</TableCell>
                        <TableCell>
                          <Select
                            value={o.status}
                            onValueChange={(v) => updateOrder(o, { status: v })}
                            disabled={savingId === o.id}
                          >
                            <SelectTrigger className="w-32 h-8 text-xs capitalize">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ORDER_STATUSES.map((s) => (
                                <SelectItem key={s} value={s} className="capitalize">
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="Tracking no."
                            defaultValue={o.tracking_number || ""}
                            className="h-8 w-36 text-xs"
                            onBlur={(e) => {
                              if (e.target.value !== (o.tracking_number || "")) {
                                updateOrder(o, { tracking_number: e.target.value });
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {savingId === o.id && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
