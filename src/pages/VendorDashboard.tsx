import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useVendor } from "@/hooks/useVendor";
import { useCategories } from "@/hooks/useCategories";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/PaginationBar";
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
  RotateCcw,
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
import { VendorEarningsBreakdown } from "@/components/vendor/VendorEarningsBreakdown";
import { InvoiceDownloadButton } from "@/components/InvoiceDownloadButton";
import { useLowStockAlerts } from "@/hooks/useLowStockAlerts";
import { useShipments } from "@/hooks/useShipments";
import { useListSeenTracking } from "@/hooks/useListSeenTracking";
import { NewOrdersBanner } from "@/components/NewOrdersBanner";
import { ShipmentTimelineDialog } from "@/components/admin/ShipmentTimelineDialog";
import { ShipNowDialog } from "@/components/admin/ShipNowDialog";
import { VendorOrderDetailsDialog } from "@/components/admin/VendorOrderDetailsDialog";
import { ProductVariant, ProductSpecification, mapDbVariant } from "@/hooks/useProducts";
import { productMatchesQuery } from "@/lib/productSearch";
import { RefundSummaryCell } from "@/components/RefundSummaryCell";
import { ProductImportExportDialog } from "@/components/admin/ProductImportExportDialog";
import { ReturnManagement } from "@/components/admin/ReturnManagement";
import { ExternalLink, XCircle } from "lucide-react";
import { VerifiedBoutiqueBadge } from "@/components/VerifiedBoutiqueBadge";
import type { AiContentStatus } from "@/lib/aiContent";
import { VendorPayoutStages } from "@/components/vendor/VendorPayoutStages";
import { PayoutAccountStatusBadge } from "@/components/vendor/PayoutAccountStatusBadge";
import { formatPayoutDate } from "@/lib/payoutDates";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { RazorpayPayoutStatus } from "@/components/vendor/RazorpayPayoutStatus";

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
  is_returnable: boolean;
  ai_content_status: AiContentStatus | null;
  ai_original_photo_paths: string[];
  video_url: string | null;
  video_is_primary: boolean;
  video_status: string | null;
}

interface VendorOrder {
  id: string;
  order_id: string;
  subtotal: number;
  shipping_cost: number;
  commission_amount: number;
  net_payable: number;
  // Set when delivered: the earliest day this can be paid out (return
  // window / Razorpay settlement); payout_id once a payout run includes it.
  delivered_at: string | null;
  payout_eligible_on: string | null;
  payout_id: string | null;
  rzp_transfer_status: string | null;
  rzp_transfer_amount: number | null;
  rzp_transfer_error: string | null;
  rzp_released_at: string | null;
  rzp_settled_at: string | null;
  rzp_settlement_utr: string | null;
  status: string;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  shipping_address?: {
    address_line1?: string;
    address_line2?: string | null;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  } | null;
  payment_status?: string;
  payment_method?: string;
  discount_code?: string | null;
  discount_amount?: number;
  items?: VendorOrderItem[];
}

interface VendorOrderItem {
  product_title: string;
  variant_title: string | null;
  size: string | null;
  color: string | null;
  sku: string | null;
  quantity: number;
  price: number;
}

interface PayoutAccountForm {
  account_holder_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  business_type: string;
  pan: string;
  legal_business_name: string;
}

// Server-managed Razorpay linked-account state (read-only for boutiques).
interface RazorpayPayoutState {
  razorpay_status: string;
  razorpay_error: string | null;
  razorpay_requirements: { description?: string; reason_code?: string }[] | null;
}

const BUSINESS_TYPES = ["individual", "proprietorship", "partnership", "private_limited", "llp"];

export default function VendorDashboard() {
  const { vendor, loading, refresh: refreshVendor } = useVendor();
  const { totalAlerts: lowStockAlerts } = useLowStockAlerts(vendor?.id);
  const { categories } = useCategories();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [hasPayoutAccount, setHasPayoutAccount] = useState(false);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>("all");
  const [productStockFilter, setProductStockFilter] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">(
    "all",
  );
  const [orderStatusTab, setOrderStatusTab] = useState<
    "all" | "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "returned_ndr"
  >("all");
  const { lastSeenAt: orderListLastSeenAt, markSeen: markOrderListSeen } = useListSeenTracking("orders_vendor");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<"all" | "paid" | "pending" | "failed" | "refunded">(
    "all",
  );
  const [dataLoading, setDataLoading] = useState(true);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<VendorProduct | null>(null);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccountForm>({
    account_holder_name: "",
    bank_account_number: "",
    bank_ifsc: "",
    business_type: "individual",
    pan: "",
    legal_business_name: "",
  });
  const [razorpayState, setRazorpayState] = useState<RazorpayPayoutState | null>(null);
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
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(payoutAccount.pan.trim().toUpperCase())) {
      toast.error("Enter a valid PAN (e.g. ABCDE1234F) - Razorpay needs it to pay you");
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
          pan: payoutAccount.pan.trim().toUpperCase(),
          legal_business_name: payoutAccount.legal_business_name.trim() || null,
        },
        { onConflict: "vendor_id" }
      );
      if (error) throw error;
      setHasPayoutAccount(true);

      // Create/update the Razorpay account that payouts are sent through.
      const { data: rzp, errorMessage } = await invokeEdgeFunction<RazorpayPayoutState>("razorpay-route-onboard", {
        vendor_id: vendor.id,
      });
      await refreshVendor();
      if (errorMessage || rzp?.razorpay_error) {
        setRazorpayState((prev) => ({
          razorpay_status: rzp?.razorpay_status ?? prev?.razorpay_status ?? "failed",
          razorpay_error: rzp?.razorpay_error ?? errorMessage ?? null,
          razorpay_requirements: prev?.razorpay_requirements ?? null,
        }));
        toast.error(`Saved, but Razorpay couldn't set up payouts: ${rzp?.razorpay_error ?? errorMessage}`);
      } else {
        setRazorpayState({
          razorpay_status: rzp?.razorpay_status ?? "created",
          razorpay_error: null,
          razorpay_requirements: (rzp as any)?.requirements ?? null,
        });
        toast.success("Payout details saved - Razorpay is verifying your bank account");
      }
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
            "id, name, price, stock_quantity, is_active, approval_status, images, description, category_id, compare_at_price, sku, weight_grams, length_cm, breadth_cm, height_cm, specifications, country_of_origin, net_quantity, is_returnable, ai_content_status, ai_original_photo_paths, video_url, video_is_primary, video_status, product_variants(*)"
          )
          .eq("vendor_id", vendor.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("vendor_orders")
          .select(
            "id, order_id, subtotal, shipping_cost, commission_amount, net_payable, status, tracking_number, carrier, created_at, updated_at, delivered_at, payout_eligible_on, payout_id, rzp_transfer_status, rzp_transfer_amount, rzp_transfer_error, rzp_released_at, rzp_settled_at, rzp_settlement_utr"
          )
          .eq("vendor_id", vendor.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("vendor_payout_accounts")
          .select("account_holder_name, bank_account_number, bank_ifsc, business_type, pan, legal_business_name, razorpay_status, razorpay_error, razorpay_requirements")
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
        const pa = payoutRes.data as any;
        setPayoutAccount({
          account_holder_name: pa.account_holder_name ?? "",
          bank_account_number: pa.bank_account_number ?? "",
          bank_ifsc: pa.bank_ifsc ?? "",
          business_type: pa.business_type ?? "individual",
          pan: pa.pan ?? "",
          legal_business_name: pa.legal_business_name ?? "",
        });
        setRazorpayState({
          razorpay_status: pa.razorpay_status,
          razorpay_error: pa.razorpay_error,
          razorpay_requirements: pa.razorpay_requirements,
        });
      }
      setHasPayoutAccount(!!payoutRes.data);

      const vOrders = (voRes.data || []) as VendorOrder[];
      // fetch customer names for these orders
      if (vOrders.length > 0) {
        const ids = vOrders.map((o) => o.order_id);
        const { data: ords } = await supabase
          .from("orders")
          .select(
            "id, customer_name, customer_phone, customer_email, shipping_address, payment_status, payment_method, discount_code, discount_amount"
          )
          .in("id", ids);
        const map = new Map((ords || []).map((o: any) => [o.id, o]));
        vOrders.forEach((o) => {
          const ord = map.get(o.order_id);
          o.customer_name = ord?.customer_name || "Customer";
          o.customer_phone = ord?.customer_phone;
          o.customer_email = ord?.customer_email;
          o.shipping_address = ord?.shipping_address;
          o.payment_status = ord?.payment_status;
          o.payment_method = ord?.payment_method;
          o.discount_code = ord?.discount_code ?? null;
          o.discount_amount = ord?.discount_amount ?? 0;
        });

        // Scoped to this vendor's own vendor_order_id - a multi-vendor order's
        // other sellers' items must never show up here. This was the actual
        // gap behind "vendor always confuse what they have to deliver": the
        // table showed commission/payout numbers but never the products
        // themselves, so there was nothing to pack against.
        const vendorOrderIds = vOrders.map((o) => o.id);
        const { data: itemRows } = await supabase
          .from("order_items")
          .select("vendor_order_id, product_title, variant_title, size, color, sku, quantity, price")
          .in("vendor_order_id", vendorOrderIds);
        const itemsByVendorOrder = new Map<string, VendorOrderItem[]>();
        (itemRows || []).forEach((item: any) => {
          const list = itemsByVendorOrder.get(item.vendor_order_id) ?? [];
          list.push(item);
          itemsByVendorOrder.set(item.vendor_order_id, list);
        });
        vOrders.forEach((o) => {
          o.items = itemsByVendorOrder.get(o.id) ?? [];
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

  // A vendor with a real volume of orders can't scan one flat table to find
  // what needs action right now - these tabs split orders into the buckets
  // that actually drive what a vendor does next (confirm it, ship it, it's
  // done, it's dead), each with a live count, so "which orders still need
  // confirming" is a click instead of a scroll-and-squint.
  const ORDER_STATUS_TABS: { key: typeof orderStatusTab; label: string; statuses: string[] | null }[] = [
    { key: "all", label: "All Orders", statuses: null },
    { key: "pending", label: "Need to Confirm", statuses: ["pending"] },
    { key: "confirmed", label: "Confirmed", statuses: ["confirmed"] },
    { key: "processing", label: "Processing", statuses: ["processing"] },
    { key: "shipped", label: "Shipped", statuses: ["shipped", "out_for_delivery"] },
    { key: "delivered", label: "Delivered", statuses: ["delivered"] },
    { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
    { key: "returned_ndr", label: "Returned / NDR", statuses: ["returned", "ndr"] },
  ];
  // "All Orders" stays an honest live total. Every other tab's number is
  // "how many changed into this bucket since I last opened this tab" -
  // opening it (below) marks it seen, so it only comes back once
  // something genuinely new lands there.
  const orderStatusCounts = Object.fromEntries(
    ORDER_STATUS_TABS.map((t) => {
      if (!t.statuses) return [t.key, orders.length];
      const seenAt = orderListLastSeenAt(t.key);
      const count = orders.filter(
        (o) => t.statuses!.includes(o.status) && (!seenAt || new Date(o.updated_at) > new Date(seenAt)),
      ).length;
      return [t.key, count];
    }),
  ) as Record<typeof orderStatusTab, number>;

  // Computed (and paginated) before the loading/approval early-return below,
  // not after it - usePagination calls hooks internally, which must never
  // run only on some renders. This exact ordering mistake shipped once
  // already in ProductManagement.tsx and threw a real "Rendered more hooks
  // than during the previous render" error the moment `loading` (or here,
  // vendor approval) flipped between renders.
  const visibleProducts = products.filter((p) => {
    if (productCategoryFilter !== "all" && p.category_id !== productCategoryFilter) return false;
    if (productStockFilter === "out_of_stock" && p.stock_quantity > 0) return false;
    if (productStockFilter === "low_stock" && (p.stock_quantity <= 0 || p.stock_quantity > 5)) return false;
    if (productStockFilter === "in_stock" && p.stock_quantity <= 5) return false;
    if (productSearch.trim() && !productMatchesQuery(p, productSearch)) return false;
    return true;
  });
  const {
    page: productPage,
    setPage: setProductPage,
    totalPages: productTotalPages,
    paginatedItems: paginatedProducts,
    totalItems: totalVisibleProducts,
    pageSize: productPageSize,
  } = usePagination(visibleProducts, 10);
  const visibleOrders = orders.filter((o) => {
    const tabDef = ORDER_STATUS_TABS.find((t) => t.key === orderStatusTab);
    if (tabDef?.statuses && !tabDef.statuses.includes(o.status)) return false;
    if (orderPaymentFilter !== "all" && (o.payment_status || "pending") !== orderPaymentFilter) return false;
    if (orderSearch.trim()) {
      const q = orderSearch.trim().toLowerCase();
      const matchesOrderId = o.order_id.toLowerCase().includes(q);
      const matchesCustomer = (o.customer_name || "").toLowerCase().includes(q);
      const matchesPhone = (o.customer_phone || "").toLowerCase().includes(q);
      const matchesItems = (o.items || []).some(
        (item) => item.product_title.toLowerCase().includes(q) || (item.sku || "").toLowerCase().includes(q),
      );
      if (!matchesOrderId && !matchesCustomer && !matchesPhone && !matchesItems) return false;
    }
    return true;
  });
  const {
    page: orderPage,
    setPage: setOrderPage,
    totalPages: orderTotalPages,
    paginatedItems: paginatedOrders,
    totalItems: totalOrders,
    pageSize: orderPageSize,
  } = usePagination(visibleOrders, 10);

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

  // Was summing net_payable across every vendor_order regardless of
  // status or whether the order was ever actually paid - a cancelled or
  // still-unpaid order's figures were counting as live revenue.
  const revenue = orders
    .filter((o) => o.status !== "cancelled" && o.payment_status === "paid")
    .reduce((s, o) => s + Number(o.net_payable || 0), 0);
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
                <Badge variant="outline" className="font-mono text-xs">
                  {vendor.boutique_code}
                </Badge>
                {vendor.is_verified && <VerifiedBoutiqueBadge size="sm" />}
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
        <Tabs defaultValue={searchParams.get("tab") || "dashboard"} className="space-y-6">
          <TabsList className="grid w-full max-w-4xl grid-cols-7">
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
            <TabsTrigger value="returns" className="flex items-center gap-1">
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Returns</span>
            </TabsTrigger>
            <TabsTrigger value="payouts" className="flex items-center gap-1">
              <Landmark className="h-4 w-4" />
              <span className="hidden sm:inline">Payouts</span>
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            <NewOrdersBanner />
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
            <VendorEarningsBreakdown vendorId={vendor.id} />
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
                <div className="flex items-center gap-2">
                  <ProductImportExportDialog
                    products={products}
                    categories={categories}
                    vendorId={vendor.id}
                    isVendorTrusted={vendor.is_trusted}
                    onImported={fetchAll}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingProduct(null);
                      setProductDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" /> Add product
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!dataLoading && products.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <Input
                      placeholder="Search by name, SKU or variant..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="max-w-xs"
                    />
                    <Select value={productCategoryFilter} onValueChange={setProductCategoryFilter}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={productStockFilter}
                      onValueChange={(v) => setProductStockFilter(v as typeof productStockFilter)}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue placeholder="Stock" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any stock level</SelectItem>
                        <SelectItem value="in_stock">In stock</SelectItem>
                        <SelectItem value="low_stock">Low stock</SelectItem>
                        <SelectItem value="out_of_stock">Out of stock</SelectItem>
                      </SelectContent>
                    </Select>
                    {(productSearch || productCategoryFilter !== "all" || productStockFilter !== "all") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setProductSearch("");
                          setProductCategoryFilter("all");
                          setProductStockFilter("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>
                )}
                {dataLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : products.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No products yet. Use “Add product” to create your first listing.
                  </p>
                ) : visibleProducts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No products match these filters.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Stock</TableHead>
                          <TableHead>Approval</TableHead>
                          <TableHead>Visible</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedProducts.map((p, idx) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm text-muted-foreground">
                              {(productPage - 1) * productPageSize + idx + 1}
                            </TableCell>
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
                <PaginationBar
                  page={productPage}
                  totalPages={productTotalPages}
                  onPageChange={setProductPage}
                  totalItems={totalVisibleProducts}
                  pageSize={productPageSize}
                />
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
                  <>
                    <Tabs
                      value={orderStatusTab}
                      onValueChange={(v) => {
                        setOrderStatusTab(v as typeof orderStatusTab);
                        if (v !== "all") markOrderListSeen(v);
                      }}
                      className="mb-4"
                    >
                      <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1">
                        {ORDER_STATUS_TABS.map((t) => (
                          <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                            {t.label}
                            <Badge variant="secondary" className="h-5 min-w-5 px-1 text-xs">
                              {orderStatusCounts[t.key]}
                            </Badge>
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>

                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <Input
                        placeholder="Search by order ID, customer, phone, product or SKU..."
                        value={orderSearch}
                        onChange={(e) => setOrderSearch(e.target.value)}
                        className="max-w-sm"
                      />
                      <Select
                        value={orderPaymentFilter}
                        onValueChange={(v) => setOrderPaymentFilter(v as typeof orderPaymentFilter)}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Payment status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Payments</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="pending">Payment Pending</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                          <SelectItem value="refunded">Refunded</SelectItem>
                        </SelectContent>
                      </Select>
                      {(orderSearch || orderPaymentFilter !== "all" || orderStatusTab !== "all") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setOrderSearch("");
                            setOrderPaymentFilter("all");
                            setOrderStatusTab("all");
                          }}
                        >
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </>
                )}
                {dataLoading ? null : orders.length === 0 ? null : visibleOrders.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No orders match these filters. Try a different search term or status.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Order</TableHead>
                          <TableHead>Items to Deliver</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Commission</TableHead>
                          <TableHead>Net Payable</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Shipment</TableHead>
                          <TableHead></TableHead>
                          <TableHead>Refunds</TableHead>
                          <TableHead>Invoice</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedOrders.map((o, idx) => (
                          <TableRow key={o.id}>
                            <TableCell className="text-sm text-muted-foreground">
                              {(orderPage - 1) * orderPageSize + idx + 1}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {o.order_id.slice(0, 8)}
                              <div className="text-muted-foreground">
                                {new Date(o.created_at).toLocaleDateString()}
                              </div>
                              <div className="mt-1">
                                <VendorOrderDetailsDialog
                                  data={{
                                    orderId: o.order_id,
                                    createdAt: o.created_at,
                                    vendorName: vendor?.name || "Your store",
                                    status: o.status,
                                    paymentMethod: o.payment_method || "",
                                    paymentStatus: o.payment_status || "pending",
                                    customerName: o.customer_name || "Customer",
                                    customerPhone: o.customer_phone,
                                    customerEmail: o.customer_email,
                                    shippingAddress: o.shipping_address,
                                    items: o.items || [],
                                    subtotal: o.subtotal,
                                    shippingCost: o.shipping_cost,
                                    discountCode: o.discount_code,
                                    discountAmount: o.discount_amount,
                                    shipment: forwardShipmentFor(o.id) ?? null,
                                  }}
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              {o.items && o.items.length > 0 ? (
                                <div className="space-y-1.5">
                                  {o.items.map((item, i) => (
                                    <div key={i} className="text-xs">
                                      <span className="font-medium">{item.product_title}</span>
                                      <span className="text-muted-foreground"> × {item.quantity}</span>
                                      {(item.variant_title || item.size || item.color) && (
                                        <div className="text-muted-foreground">
                                          {[item.variant_title, item.size && `Size: ${item.size}`, item.color && `Color: ${item.color}`]
                                            .filter(Boolean)
                                            .join(" · ")}
                                        </div>
                                      )}
                                      {/* The one thing that actually tells apart two listings that
                                          otherwise look identical (same name/size/color) - called out
                                          in its own monospace line rather than folded into the
                                          variant text so it reads as an identifier, not a label. */}
                                      {item.sku ? (
                                        <div className="font-mono text-muted-foreground">SKU: {item.sku}</div>
                                      ) : (
                                        <div className="text-destructive">No SKU set</div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
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
                              {!!o.discount_amount && o.discount_amount > 0 && (
                                <div className="text-xs text-primary">
                                  Coupon used{o.discount_code && ` (${o.discount_code})`} - doesn't affect your payout
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              -₹{Number(o.commission_amount || 0).toFixed(0)}
                            </TableCell>
                            <TableCell className="font-medium">
                              ₹{Number(o.net_payable).toFixed(0)}
                              {o.status === "delivered" && (
                                <div className="text-xs font-normal text-muted-foreground whitespace-nowrap">
                                  {o.payout_id
                                    ? "In payout run"
                                    : o.payout_eligible_on
                                      ? `Payout ${formatPayoutDate(o.payout_eligible_on)}`
                                      : null}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={`${statusColors[o.status] || "bg-muted"} capitalize`}>
                                {o.status.replace(/_/g, " ")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const shipment = forwardShipmentFor(o.id);
                                if (!shipment || shipment.status === "cancelled") {
                                  if (o.status === "cancelled") {
                                    return <span className="text-xs text-muted-foreground">Cancelled</span>;
                                  }
                                  return (
                                    <div className="space-y-1">
                                      {shipment?.awb_code && (
                                        <div className="text-xs text-destructive max-w-[220px]">
                                          {shipment.status_raw?.startsWith("Pickup cancelled")
                                            ? shipment.status_raw
                                            : "Pickup cancelled by courier"}{" "}
                                          (AWB {shipment.awb_code}) - book again
                                        </div>
                                      )}
                                      <ShipNowDialog
                                        vendorOrderId={o.id}
                                        actioning={actioningId === o.id}
                                        checkServiceability={checkServiceability}
                                        shipNow={shipNow}
                                      />
                                    </div>
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
                            <TableCell>
                              {/* Read-only - RLS scopes this to refunds on the vendor's own
                                  sale in this order. Vendors can't trigger a refund, only
                                  see one an admin already processed. Compact summary here,
                                  not the full card - "Details" opens the full breakdown. */}
                              <RefundSummaryCell orderId={o.order_id} />
                            </TableCell>
                            <TableCell>
                              <InvoiceDownloadButton
                                vendorOrderId={o.id}
                                paymentStatus={o.payment_status ?? "pending"}
                                vendorOrderStatus={o.status}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <PaginationBar
                  page={orderPage}
                  totalPages={orderTotalPages}
                  onPageChange={setOrderPage}
                  totalItems={totalOrders}
                  pageSize={orderPageSize}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Returns Tab - read-only, RLS scopes visibility to this vendor's own items; approval stays admin-only */}
          <TabsContent value="returns">
            <ReturnManagement vendorView />
          </TabsContent>

          {/* Payouts Tab */}
          <TabsContent value="payouts" className="space-y-6">
            <VendorPayoutStages
              vendorId={vendor.id}
              orders={orders}
              hasPayoutAccount={hasPayoutAccount}
              accountStatus={vendor.payout_account_status}
            />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Landmark className="h-5 w-5" /> Payout details
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm text-muted-foreground">Where we send your earnings.</p>
                  <PayoutAccountStatusBadge status={hasPayoutAccount ? vendor.payout_account_status : "not_setup"} />
                </div>
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
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="po-pan">PAN</Label>
                    <Input
                      id="po-pan"
                      value={payoutAccount.pan}
                      maxLength={10}
                      placeholder="ABCDE1234F"
                      onChange={(e) => setPayoutAccount((f) => ({ ...f, pan: e.target.value.toUpperCase() }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="po-legal">Legal business name (if different)</Label>
                    <Input
                      id="po-legal"
                      value={payoutAccount.legal_business_name}
                      placeholder="As on PAN / GST"
                      onChange={(e) => setPayoutAccount((f) => ({ ...f, legal_business_name: e.target.value }))}
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
                <RazorpayPayoutStatus state={razorpayState} />
                <p className="text-xs text-muted-foreground">
                  Payouts are sent automatically through Razorpay. Your bank details and PAN are shared with Razorpay
                  only to verify your account and pay you.
                </p>
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
