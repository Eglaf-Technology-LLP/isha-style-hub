import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Package, 
  FolderOpen, 
  LayoutDashboard, 
  LogOut, 
  Loader2,
  Eye,
  ShoppingCart,
  Sparkles,
  Wallet,
  BarChart3,
  AlertTriangle,
  RotateCcw,
  Store,
  ShieldAlert,
  Landmark,
  Ban,
  HandCoins,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { useVendor } from "@/hooks/useVendor";
import { useCategories } from "@/hooks/useCategories";
import { useOrders } from "@/hooks/useOrders";
import { useProducts } from "@/hooks/useProducts";
import { useDiscounts } from "@/hooks/useDiscounts";
import { useFlashSales } from "@/hooks/useFlashSales";
import { usePayments } from "@/hooks/usePayments";
import { useLowStockAlerts } from "@/hooks/useLowStockAlerts";
import { useReturnRequests } from "@/hooks/useReturnRequests";
import { ProductManagement } from "@/components/admin/ProductManagement";
import { PromotionsManagement } from "@/components/admin/PromotionsManagement";
import { PaymentManagement } from "@/components/admin/PaymentManagement";
import { OrderManagement } from "@/components/admin/OrderManagement";
import { CategoryManagement } from "@/components/admin/CategoryManagement";
import { SalesAnalyticsDashboard } from "@/components/admin/SalesAnalyticsDashboard";
import { InventoryAlerts } from "@/components/admin/InventoryAlerts";
import { ReturnManagement } from "@/components/admin/ReturnManagement";
import { VendorManagement } from "@/components/admin/VendorManagement";
import { ProductModeration } from "@/components/admin/ProductModeration";
import { VendorCatalogManagement } from "@/components/admin/VendorCatalogManagement";
import { VendorPerformanceAnalytics } from "@/components/admin/VendorPerformanceAnalytics";
import { DisputeManagement } from "@/components/admin/DisputeManagement";
import { SettlementLedger } from "@/components/admin/SettlementLedger";
import { CancelledOrdersManagement } from "@/components/admin/CancelledOrdersManagement";
import { VendorPayoutManagement } from "@/components/admin/VendorPayoutManagement";

export default function Admin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, signIn, signUp, signOut, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { vendor } = useVendor();
  const redirectParam = searchParams.get("redirect");

  // /admin is the only sign-in surface in the app, used by regular
  // customers too (e.g. Checkout's sign-in gate links here with
  // ?redirect=/checkout). Once signed in, send them back where they came
  // from instead of falling through to the admin-only "Access Denied"
  // screen below.
  useEffect(() => {
    if (!user) return;
    const redirect = searchParams.get("redirect");
    if (redirect) navigate(redirect, { replace: true });
  }, [user, searchParams, navigate]);
  const { categories, loading: categoriesLoading } = useCategories();
  const { orders, loading: ordersLoading } = useOrders(isAdmin);
  const { products, loading: productsLoading } = useProducts();
  const { discounts } = useDiscounts();
  const { activeFlashSales } = useFlashSales(isAdmin);
  const { getPaymentStats } = usePayments(isAdmin);
  const { totalAlerts: lowStockAlerts } = useLowStockAlerts();
  const { returnRequests } = useReturnRequests(isAdmin);

  const pendingOrdersCount = orders.filter((o) => o.order_status === "pending").length;
  const pendingReturnsCount = returnRequests.filter((r) => r.status === "pending").length;
  
  const [loginForm, setLoginForm] = useState({ email: '', password: '', fullName: '' });
  const [isSignUp, setIsSignUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  

  const paymentStats = getPaymentStats();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        const { error } = await signUp(loginForm.email, loginForm.password, loginForm.fullName);
        if (error) throw error;
        toast.success('Account created! You can now sign in.');
        setIsSignUp(false);
      } else {
        const { error } = await signIn(loginForm.email, loginForm.password);
        if (error) throw error;
        toast.success('Welcome back!');
      }
    } catch (error: any) {
      toast.error(error.message || 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
    navigate('/');
  };


  // Loading state
  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in - show login form
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-serif">
              {isSignUp ? 'Create Account' : redirectParam ? 'Sign In' : 'Admin Login'}
            </CardTitle>
            <CardDescription>
              {redirectParam ? 'Isha Fashion Hub' : 'Isha Fashion Hub Dashboard'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    placeholder="Your name"
                    value={loginForm.fullName}
                    onChange={(e) => setLoginForm({ ...loginForm, fullName: e.target.value })}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Button>
              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setIsSignUp(!isSignUp)}
                >
                  {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Logged in but not admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-serif text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have admin privileges. Please contact the administrator to get access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Logged in as: {user.email}
            </p>
            {vendor && vendor.status === 'approved' && (
              <Button className="w-full" onClick={() => navigate('/vendor')}>
                Go to Vendor Dashboard
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => navigate('/')}>
                Go to Store
              </Button>
              <Button variant="destructive" className="flex-1" onClick={handleSignOut}>
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link to="/" className="text-xl font-serif font-bold text-primary">
                Isha Fashion Hub
              </Link>
              <Badge variant="secondary">Admin</Badge>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground hidden md:inline">
                {user.email}
              </span>
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <Eye className="h-4 w-4 mr-2" />
                  View Store
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto w-full max-w-5xl justify-start">
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
            <TabsTrigger value="categories" className="flex items-center gap-1">
              <FolderOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Categories</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-1 relative">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Orders</span>
              {pendingOrdersCount > 0 && (
                <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                  {pendingOrdersCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="returns" className="flex items-center gap-1 relative">
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Returns</span>
              {pendingReturnsCount > 0 && (
                <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                  {pendingReturnsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="flex items-center gap-1">
              <Ban className="h-4 w-4" />
              <span className="hidden sm:inline">Cancelled</span>
            </TabsTrigger>
            <TabsTrigger value="promotions" className="flex items-center gap-1">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Promotions</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-1">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Payments</span>
            </TabsTrigger>
            <TabsTrigger value="disputes" className="flex items-center gap-1">
              <ShieldAlert className="h-4 w-4" />
              <span className="hidden sm:inline">Disputes</span>
            </TabsTrigger>
            <TabsTrigger value="settlements" className="flex items-center gap-1">
              <Landmark className="h-4 w-4" />
              <span className="hidden sm:inline">Settlements</span>
            </TabsTrigger>
            <TabsTrigger value="vendor-payouts" className="flex items-center gap-1">
              <HandCoins className="h-4 w-4" />
              <span className="hidden sm:inline">Payouts</span>
            </TabsTrigger>
            <TabsTrigger value="vendors" className="flex items-center gap-1">
              <Store className="h-4 w-4" />
              <span className="hidden sm:inline">Vendors</span>
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard">
            <div className="grid md:grid-cols-4 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Total Products</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold text-primary">
                    {productsLoading ? '...' : products.length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Categories</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold text-primary">
                    {categoriesLoading ? '...' : categories.length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Total Orders</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold text-primary">
                    {ordersLoading ? '...' : orders.length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold text-primary">
                    ₹{paymentStats.totalReceived.toFixed(0)}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Pending Orders</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">
                    {ordersLoading ? '...' : orders.filter(o => o.order_status === 'pending').length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Active Discounts</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">
                    {discounts.filter(d => d.is_active).length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Active Flash Sales</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">
                    {activeFlashSales.length}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <SalesAnalyticsDashboard />
          </TabsContent>

          {/* Inventory Tab */}
          <TabsContent value="inventory">
            <InventoryAlerts />
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products">
            <ProductManagement categories={categories} />
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories">
            <CategoryManagement />
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            <OrderManagement isAdmin={isAdmin} />
          </TabsContent>

          {/* Returns Tab */}
          <TabsContent value="returns">
            <ReturnManagement />
          </TabsContent>

          {/* Cancelled Orders Tab */}
          <TabsContent value="cancelled">
            <CancelledOrdersManagement isAdmin={isAdmin} />
          </TabsContent>

          {/* Promotions Tab */}
          <TabsContent value="promotions">
            <PromotionsManagement />
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments">
            <PaymentManagement isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="disputes">
            <DisputeManagement isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="settlements">
            <SettlementLedger isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="vendor-payouts">
            <VendorPayoutManagement isAdmin={isAdmin} />
          </TabsContent>

          {/* Vendors Tab */}
          <TabsContent value="vendors" className="space-y-6">
            <VendorPerformanceAnalytics />
            <VendorManagement />
            <VendorCatalogManagement />
            <ProductModeration />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
