import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Heart, Loader2, LogOut, MapPin, Package, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ProfileSection } from "@/components/account/ProfileSection";
import { AddressSection } from "@/components/account/AddressSection";
import { OrdersSection } from "@/components/account/OrdersSection";
import { AccountAction, AccountHero, SignInCard } from "@/components/storefront/account/AccountKit";
import { cn } from "@/lib/utils";

const TABS = [
  { value: "profile", label: "Profile", icon: User },
  { value: "addresses", label: "Addresses", icon: MapPin },
  { value: "orders", label: "Recent orders", icon: Package },
] as const;
type Tab = (typeof TABS)[number]["value"];

export default function Account() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading, isAuthenticated, signOut } = useAuth();
  // ?tab=addresses / ?tab=orders opens that tab directly.
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = params.get("tab");
    return TABS.some((x) => x.value === t) ? (t as Tab) : "profile";
  });

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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <SignInCard
          icon={User}
          title="Sign in to your account"
          text="Please sign in to manage your profile, addresses, and view your orders."
        />
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        <AccountHero
          crumb="My account"
          eyebrow="My account"
          title="Your"
          accent="account"
          subtitle={user?.email}
          actions={
            <>
              <AccountAction to="/orders" icon={Package}>
                My orders
              </AccountAction>
              <AccountAction to="/wishlist" icon={Heart}>
                Wishlist
              </AccountAction>
              <AccountAction
                icon={LogOut}
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                Sign out
              </AccountAction>
            </>
          }
        />

        <div className="store-container pb-24 pt-8 md:pt-10">
          <div role="tablist" aria-label="Account sections" className="no-scrollbar -mx-4 mb-10 flex gap-8 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
            {TABS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={activeTab === value}
                onClick={() => setActiveTab(value)}
                className={cn(
                  "-mb-px flex h-12 shrink-0 items-center gap-2 border-b-2 text-[12px] font-medium uppercase tracking-[0.2em] transition-colors",
                  activeTab === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div role="tabpanel" className="max-w-5xl">
            {activeTab === "profile" && <ProfileSection />}
            {activeTab === "addresses" && <AddressSection />}
            {activeTab === "orders" && <OrdersSection />}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
