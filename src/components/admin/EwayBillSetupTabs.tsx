import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import type { AdminEwayBill, CourierTransporter, VendorEwayBillSetup } from "@/hooks/useEwayBillsAdmin";

// ---------- boutiques: who makes their e-way bills ----------

interface VendorLite {
  id: string;
  name: string;
  boutique_code: string;
}

function BoutiqueSetupRow({
  vendor,
  setup,
  onSaved,
}: {
  vendor: VendorLite;
  setup: VendorEwayBillSetup | undefined;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [mode, setMode] = useState(setup?.mode ?? "subuser");
  const [username, setUsername] = useState(setup?.subuser_username ?? "");
  const [verified, setVerified] = useState(!!setup?.verified_at);
  const [notes, setNotes] = useState(setup?.admin_notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMode(setup?.mode ?? "subuser");
    setUsername(setup?.subuser_username ?? "");
    setVerified(!!setup?.verified_at);
    setNotes(setup?.admin_notes ?? "");
  }, [setup]);

  const dirty =
    mode !== (setup?.mode ?? "subuser") ||
    username.trim() !== (setup?.subuser_username ?? "") ||
    verified !== !!setup?.verified_at ||
    notes.trim() !== (setup?.admin_notes ?? "");

  const save = async () => {
    setSaving(true);
    const nameChanged = username.trim() !== (setup?.subuser_username ?? "");
    const { error } = await supabase.from("vendor_eway_bill_setup").upsert({
      vendor_id: vendor.id,
      mode,
      subuser_username: username.trim() || null,
      submitted_at: nameChanged && username.trim() ? new Date().toISOString() : setup?.submitted_at ?? null,
      verified_at: verified ? setup?.verified_at ?? new Date().toISOString() : null,
      verified_by: verified ? setup?.verified_by ?? user?.id ?? null : null,
      admin_notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${vendor.name} saved`);
    onSaved();
  };

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{vendor.name}</div>
        <div className="text-xs text-muted-foreground font-mono">{vendor.boutique_code}</div>
      </TableCell>
      <TableCell>
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="w-[170px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="subuser">AllBoutiqs (sub-user)</SelectItem>
            <SelectItem value="self">Boutique makes its own</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Not given yet"
          className="h-8 text-xs w-[170px] font-mono"
          disabled={mode === "self"}
        />
        {setup?.submitted_at && (
          <div className="text-[11px] text-muted-foreground mt-0.5">Given {formatDate(setup.submitted_at)}</div>
        )}
      </TableCell>
      <TableCell>
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={verified} onCheckedChange={setVerified} disabled={mode === "self" || !username.trim()} />
          {verified ? "Works" : "Not checked"}
        </label>
      </TableCell>
      <TableCell>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="h-8 text-xs" />
      </TableCell>
      <TableCell>
        <Button size="sm" className="h-8 text-xs" disabled={!dirty || saving} onClick={save}>
          Save
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function EwayBoutiquesTab({ setups, onSaved }: { setups: Map<string, VendorEwayBillSetup>; onSaved: () => void }) {
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("vendors")
      .select("id, name, boutique_code")
      .eq("status", "approved")
      .order("name")
      .then(({ data }) => setVendors(data ?? []));
  }, []);

  const shown = vendors.filter(
    (v) => !search.trim() || `${v.name} ${v.boutique_code}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Boutiques</CardTitle>
        <CardDescription>
          Each boutique creates a sub-user for AllBoutiqs on its e-way bill portal account (the steps are on its Orders
          tab) and enters the username. Sign in with it once and switch on "Works". A boutique that refuses makes its own
          e-way bills and emails the number - set it to "Boutique makes its own".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="Search boutiques..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Boutique</TableHead>
                <TableHead>Made by</TableHead>
                <TableHead>Portal sub-user</TableHead>
                <TableHead>Checked</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((v) => (
                <BoutiqueSetupRow key={v.id} vendor={v} setup={setups.get(v.id)} onSaved={onSaved} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- couriers' transporter IDs ----------

const TRANSPORTER_ID_RE = /^[0-9A-Z]{15}$/;

export function EwayCouriersTab({
  transporters,
  bills,
  onSaved,
}: {
  transporters: CourierTransporter[];
  bills: AdminEwayBill[];
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [newCourier, setNewCourier] = useState({ id: "", name: "", transporterId: "" });

  // Couriers e-way bills were asked for that have no ID yet.
  const missing = useMemo(() => {
    const known = new Set(transporters.map((t) => t.courier_id));
    const seen = new Map<number, string>();
    for (const b of bills) if (b.courier_id != null && !known.has(b.courier_id)) seen.set(b.courier_id, b.courier_name ?? `Courier ${b.courier_id}`);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [transporters, bills]);

  const save = async (courierId: number, courierName: string, transporterId: string) => {
    const id = transporterId.trim().toUpperCase();
    if (!TRANSPORTER_ID_RE.test(id)) {
      toast.error("A transporter ID is 15 letters and digits (a GSTIN or the portal's TRANSIN)");
      return false;
    }
    const { error } = await supabase
      .from("courier_transporters")
      .upsert({ courier_id: courierId, courier_name: courierName, transporter_id: id, updated_by: user?.id ?? null });
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(`${courierName} saved`);
    onSaved();
    return true;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Couriers' transporter IDs</CardTitle>
        <CardDescription>
          Part B of an e-way bill names the courier by its GST transporter ID. Shiprocket doesn't give it, so save it once
          per courier (ask Shiprocket support or the courier). The ID is shown with every request and to boutiques that
          make their own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {missing.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
            <p className="text-sm font-medium text-amber-950">Needed for open requests</p>
            {missing.map((m) => (
              <MissingCourierRow key={m.id} courierId={m.id} courierName={m.name} onSave={save} />
            ))}
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Courier</TableHead>
              <TableHead>Shiprocket ID</TableHead>
              <TableHead>Transporter ID</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transporters.map((t) => (
              <TableRow key={t.courier_id}>
                <TableCell className="font-medium">{t.courier_name}</TableCell>
                <TableCell className="font-mono text-xs">{t.courier_id}</TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-xs font-mono w-[190px]"
                    value={drafts[t.courier_id] ?? t.transporter_id}
                    onChange={(e) => setDrafts((d) => ({ ...d, [t.courier_id]: e.target.value }))}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={(drafts[t.courier_id] ?? t.transporter_id) === t.transporter_id}
                    onClick={() => save(t.courier_id, t.courier_name, drafts[t.courier_id] ?? t.transporter_id)}
                  >
                    Save
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {transporters.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-muted-foreground text-center py-6">
                  No couriers saved yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="grid sm:grid-cols-[120px,1fr,190px,auto] gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Shiprocket ID</Label>
            <Input className="h-8 text-xs" inputMode="numeric" value={newCourier.id} onChange={(e) => setNewCourier((c) => ({ ...c, id: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Courier name</Label>
            <Input className="h-8 text-xs" value={newCourier.name} onChange={(e) => setNewCourier((c) => ({ ...c, name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Transporter ID</Label>
            <Input
              className="h-8 text-xs font-mono"
              value={newCourier.transporterId}
              onChange={(e) => setNewCourier((c) => ({ ...c, transporterId: e.target.value }))}
            />
          </div>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!/^\d+$/.test(newCourier.id) || !newCourier.name.trim()}
            onClick={async () => {
              if (await save(Number(newCourier.id), newCourier.name.trim(), newCourier.transporterId)) {
                setNewCourier({ id: "", name: "", transporterId: "" });
              }
            }}
          >
            Add courier
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MissingCourierRow({
  courierId,
  courierName,
  onSave,
}: {
  courierId: number;
  courierName: string;
  onSave: (courierId: number, courierName: string, transporterId: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm w-48">{courierName}</span>
      <Badge variant="outline" className="font-mono text-[10px]">
        {courierId}
      </Badge>
      <Input className="h-8 text-xs font-mono w-[190px]" placeholder="Transporter ID" value={value} onChange={(e) => setValue(e.target.value)} />
      <Button size="sm" className="h-8 text-xs" onClick={() => onSave(courierId, courierName, value)}>
        Save
      </Button>
    </div>
  );
}

// ---------- settings ----------

export function EwaySettingsTab() {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [threshold, setThreshold] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("eway_bill_threshold, eway_bill_email, eway_bill_subuser_mobile")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setThreshold(String(Number(data.eway_bill_threshold)));
        setEmail(data.eway_bill_email);
        setMobile(data.eway_bill_subuser_mobile ?? "");
        setLoaded(true);
      });
  }, []);

  const save = async () => {
    const limit = Number(threshold);
    if (!Number.isFinite(limit) || limit < 0) {
      toast.error("Enter the limit in rupees");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error("Enter a valid email");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("platform_settings")
      .update({
        eway_bill_threshold: limit,
        eway_bill_email: email.trim(),
        eway_bill_subuser_mobile: mobile.trim() || null,
        updated_by: user?.id ?? null,
      })
      .eq("id", true);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("E-way bill settings saved");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>
          A boutique part whose invoice (GST and delivery charge included, after the coupon) is over the limit can't be
          booked without an e-way bill. Making one below the limit is allowed, so one limit is used for every state.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="space-y-1">
          <Label htmlFor="ewb-limit">Limit (₹)</Label>
          <Input id="ewb-limit" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} disabled={!loaded} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ewb-email">Email for e-way bill numbers</Label>
          <Input id="ewb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!loaded} />
          <p className="text-xs text-muted-foreground">Boutiques that make their own send the number and PDF here.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ewb-mobile">Mobile for boutiques' sub-users</Label>
          <Input id="ewb-mobile" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} disabled={!loaded} />
          <p className="text-xs text-muted-foreground">
            Shown in the boutiques' set-up steps, so the portal's sign-in codes for their sub-user come to AllBoutiqs.
          </p>
        </div>
        <Button onClick={save} disabled={!loaded || saving}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
