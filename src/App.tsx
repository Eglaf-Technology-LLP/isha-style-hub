import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import Index from "./pages/Index";
import { ConsentGate } from "./components/auth/ConsentGate";
import { LEGAL_PATHS } from "./lib/legal";
import NotFound from "./pages/NotFound";
import { CompareDrawer } from "./components/ProductComparison";
import { StaffOnlyGate } from "./components/StaffOnlyGate";

// Every page but the home page is its own file, fetched when first opened -
// a shopper no longer downloads the admin, boutique and warehouse screens.
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Category = lazy(() => import("./pages/Category"));
const Admin = lazy(() => import("./pages/Admin"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderHistory = lazy(() => import("./pages/OrderHistory"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const Account = lazy(() => import("./pages/Account"));
const SellWithUs = lazy(() => import("./pages/SellWithUs"));
const VendorPending = lazy(() => import("./pages/VendorPending"));
const VendorDashboard = lazy(() => import("./pages/VendorDashboard"));
const StorePage = lazy(() => import("./pages/StorePage"));
const Boutiques = lazy(() => import("./pages/Boutiques"));
const Warehouse = lazy(() => import("./pages/Warehouse"));
const PrivacyPolicy = lazy(() => import("./pages/legal/PrivacyPolicy"));
const SellerTerms = lazy(() => import("./pages/legal/SellerTerms"));
const CustomerTerms = lazy(() => import("./pages/legal/CustomerTerms"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <StaffOnlyGate>
          <ConsentGate />
          <Suspense fallback={<div className="min-h-screen bg-background" />}>
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
              <Route path="/boutiques" element={<Boutiques />} />
              <Route path="/warehouse" element={<Warehouse />} />
              <Route path={LEGAL_PATHS.privacy} element={<PrivacyPolicy />} />
              <Route path={LEGAL_PATHS.terms} element={<CustomerTerms />} />
              <Route path={LEGAL_PATHS.sellerTerms} element={<SellerTerms />} />

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <CompareDrawer />
        </StaffOnlyGate>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
