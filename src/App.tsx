import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import ProductDetail from "./pages/ProductDetail";
import Category from "./pages/Category";
import Admin from "./pages/Admin";
import Checkout from "./pages/Checkout";
import OrderHistory from "./pages/OrderHistory";
import Wishlist from "./pages/Wishlist";
import Account from "./pages/Account";
import SellWithUs from "./pages/SellWithUs";
import VendorPending from "./pages/VendorPending";
import VendorDashboard from "./pages/VendorDashboard";
import StorePage from "./pages/StorePage";
import Warehouse from "./pages/Warehouse";
import NotFound from "./pages/NotFound";
import { CompareDrawer } from "./components/ProductComparison";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/product/:handle" element={<ProductDetail />} />
          <Route path="/category/:slug" element={<Category />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/orders" element={<OrderHistory />} />
          <Route path="/wishlist" element={<Wishlist />} />
          {/* Rewards and membership (AllBoutiqs Insider) are hidden from
              shoppers for now - pages/Rewards.tsx and pages/Membership.tsx are
              kept for when they come back. */}
          <Route path="/rewards" element={<Navigate to="/" replace />} />
          <Route path="/membership" element={<Navigate to="/" replace />} />
          <Route path="/account" element={<Account />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/sell-with-us" element={<SellWithUs />} />
          <Route path="/vendor/pending" element={<VendorPending />} />
          <Route path="/vendor" element={<VendorDashboard />} />
          <Route path="/store/:slug" element={<StorePage />} />
          <Route path="/warehouse" element={<Warehouse />} />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <CompareDrawer />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
