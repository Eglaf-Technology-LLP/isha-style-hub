import { useCallback, useEffect, useMemo, useState } from "react";
import { Home as HomeIcon, KeyRound } from "lucide-react";
import { SignInSecurityDialog } from "@/components/auth/SignInSecurity";
import { userContact } from "@/lib/authIdentifier";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ClipboardCheck,
  Eye,
  Loader2,
  LogOut,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Settings,
  Store,
  Truck,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWarehouseAccess } from "@/hooks/useWarehouseAccess";
import { useWarehouseData } from "@/hooks/useWarehouseData";
import { useFlashFocus, useUrlTab } from "@/hooks/useDeepLink";
import { NotificationBell } from "@/components/NotificationBell";
import { InlineSignInForm } from "@/components/auth/InlineSignInForm";
import { IncomingTab, InspectTab } from "@/components/warehouse/WarehouseInbound";
import { DispatchedTab, PackTab } from "@/components/warehouse/WarehousePacking";
import { ReturnsTab, SendBacksTab } from "@/components/warehouse/WarehouseReturns";
import { WarehouseSettingsRow, WarehouseSettingsTab } from "@/components/warehouse/WarehouseSettings";
import { WarehouseInfo } from "@/components/warehouse/shared";
import { WarehouseTiming } from "@/lib/warehouse";
import logo from "@/assets/logo.png";

// The AllBoutiqs warehouse: receive boutique parcels, inspect, pack each
// order into one parcel and book it to the customer; receive and inspect
// returns; send items back to boutiques. For warehouse staff and admins.
export default function Warehouse() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { canOperate, isAdmin, loading: accessLoading } = useWarehouseAccess();
  const [tab, setTab] = useUrlTab("incoming");
  const data = useWarehouseData(canOperate);
  const [warehouse, setWarehouse] = useState<WarehouseInfo | null>(null);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [settings, setSettings] = useState<WarehouseSettingsRow | null>(null);
  const [holidays, setHolidays] = useState<{ holiday_date: string; name: string }[]>([]);

  const loadSetup = useCallback(async () => {
    const [{ data: w }, { data: s }, { data: h }] = await Promise.all([
      supabase
        .from("warehouses")
        .select("id, name, contact_name, contact_phone, contact_email, address")
        .eq("is_default", true)
        .maybeSingle(),
      supabase
        .from("platform_settings")
        .select(
          "warehouse_routing_enabled, default_prep_days, warehouse_handling_days, warehouse_cutoff_hour, warehouse_max_wait_days, warehouse_inbound_transit_days",
        )
        .maybeSingle(),
      supabase
        .from("warehouse_holidays")
        .select("holiday_date, name")
        .gte("holiday_date", new Date().toISOString().slice(0, 10))
        .order("holiday_date"),
    ]);
    setWarehouse((w as WarehouseInfo) ?? null);
    setSettings((s as WarehouseSettingsRow) ?? null);
    setHolidays(h ?? []);
  }, []);

  useEffect(() => {
    if (canOperate) loadSetup();
  }, [canOperate, loadSetup]);

  const timing: WarehouseTiming = useMemo(
    () => ({
      handlingDays: settings?.warehouse_handling_days ?? 1,
      cutoffHour: settings?.warehouse_cutoff_hour ?? 17,
      maxWaitDays: settings?.warehouse_max_wait_days ?? 3,
      holidays: new Set(holidays.map((h) => h.holiday_date)),
    }),
    [settings, holidays],
  );

  useFlashFocus(!data.loading);

  if (accessLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-serif">Warehouse sign in</CardTitle>
            <CardDescription>AllBoutiqs warehouse</CardDescription>
          </CardHeader>
          <CardContent>
            <InlineSignInForm variant="staff" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!canOperate) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-serif text-destructive">Access Denied</CardTitle>
            <CardDescription>Only AllBoutiqs warehouse staff and admins can open the warehouse.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">Logged in as: {userContact(user)}</p>
            <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
              Go to Store
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const v = data.vendorOrders;
  const counts = {
    incoming: v.filter((vo) => ["confirmed", "processing", "in_transit_to_warehouse"].includes(vo.status) && vo.inbound).length,
    inspect: v.filter((vo) => (vo.status === "at_warehouse" && vo.qc_status !== "passed" && !vo.dispatch_id) || vo.status === "qc_failed").length,
    pack: new Set([
      ...v.filter((vo) => vo.status === "at_warehouse" && vo.qc_status === "passed" && !vo.dispatch_id).map((vo) => vo.order_id),
      ...data.dispatches.filter((d) => d.status === "packing").map((d) => d.order_id),
    ]).size,
    returns: data.returns.filter((r) => ["at_warehouse", "picked_up"].includes(r.status)).length,
    sendbacks: data.sendBacks.filter((s) => s.status === "required").length,
  };
  const props = { data, timing, isAdmin, warehouse };
  const count = (n: number) =>
    n > 0 ? (
      <Badge variant="secondary" className="h-5 min-w-5 px-1 text-xs">
        {n}
      </Badge>
    ) : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Home: the admin dashboard for admins, this page for warehouse staff. */}
              <Link to={isAdmin ? "/admin" : "/warehouse"} aria-label="AllBoutiqs - home">
                <img src={logo} alt="AllBoutiqs" className="h-12 w-auto object-contain" />
              </Link>
              <Button variant="ghost" size="sm" asChild>
                <Link to={isAdmin ? "/admin" : "/warehouse"} className="gap-1.5">
                  <HomeIcon className="h-4 w-4" /> Home
                </Link>
              </Button>
              <Badge variant="secondary" className="gap-1">
                <WarehouseIcon className="h-3 w-3" /> Warehouse
              </Badge>
              {warehouse && <span className="text-sm text-muted-foreground hidden md:inline truncate">{warehouse.name}</span>}
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <Button variant="ghost" size="sm" onClick={() => data.refetch()} title="Refresh">
                <RefreshCw className="h-4 w-4" />
              </Button>
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="ghost" size="sm">
                    <Eye className="h-4 w-4 mr-2" />
                    Admin
                  </Button>
                </Link>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSecurityOpen(true)} title="Password & sign-in">
                <KeyRound className="h-4 w-4 lg:mr-2" />
                <span className="hidden lg:inline">Password</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await signOut();
                  toast.success("Signed out");
                  navigate("/");
                }}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
        <SignInSecurityDialog open={securityOpen} onOpenChange={setSecurityOpen} />
      </header>

      <div className="container mx-auto px-4 py-8">
        {data.error && <p className="text-sm text-destructive mb-4">{data.error}</p>}
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1">
            <TabsTrigger value="incoming" className="gap-1.5">
              <Truck className="h-4 w-4" /> Incoming {count(counts.incoming)}
            </TabsTrigger>
            <TabsTrigger value="inspect" className="gap-1.5">
              <ClipboardCheck className="h-4 w-4" /> Receive &amp; inspect {count(counts.inspect)}
            </TabsTrigger>
            <TabsTrigger value="pack" className="gap-1.5">
              <PackageCheck className="h-4 w-4" /> Pack &amp; ship {count(counts.pack)}
            </TabsTrigger>
            <TabsTrigger value="dispatched" className="gap-1.5">
              <Truck className="h-4 w-4" /> Dispatched
            </TabsTrigger>
            <TabsTrigger value="returns" className="gap-1.5">
              <RotateCcw className="h-4 w-4" /> Returns {count(counts.returns)}
            </TabsTrigger>
            <TabsTrigger value="sendbacks" className="gap-1.5">
              <Store className="h-4 w-4" /> Back to boutiques {count(counts.sendbacks)}
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="settings" className="gap-1.5">
                <Settings className="h-4 w-4" /> Settings
              </TabsTrigger>
            )}
          </TabsList>

          {data.loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <TabsContent value="incoming">
                <IncomingTab {...props} />
              </TabsContent>
              <TabsContent value="inspect">
                <InspectTab {...props} />
              </TabsContent>
              <TabsContent value="pack">
                <PackTab {...props} />
              </TabsContent>
              <TabsContent value="dispatched">
                <DispatchedTab {...props} />
              </TabsContent>
              <TabsContent value="returns">
                <ReturnsTab {...props} />
              </TabsContent>
              <TabsContent value="sendbacks">
                <SendBacksTab {...props} />
              </TabsContent>
              {isAdmin && (
                <TabsContent value="settings">
                  <WarehouseSettingsTab warehouse={warehouse} settings={settings} holidays={holidays} onSaved={loadSetup} />
                </TabsContent>
              )}
            </>
          )}
        </Tabs>
      </div>
    </div>
  );
}
