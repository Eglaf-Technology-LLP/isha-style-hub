import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, CheckCircle2, XCircle, Ban, ShieldCheck, Eye, Truck, BadgeCheck } from "lucide-react";
import { VerifiedBoutiqueBadge } from "@/components/VerifiedBoutiqueBadge";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { VendorImportExportDialog } from "./VendorImportExportDialog";
import { VendorDetailsDialog } from "./VendorDetailsDialog";
import type { Vendor as AdminVendor } from "@/hooks/useVendor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Internal only - never shown to customers or the boutique itself.
const QUALITY_GRADES = ["A++", "A+", "A", "B+", "B", "C"];
const NO_GRADE = "none";

export function VendorManagement() {
  const { user } = useAuth();
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [viewVendor, setViewVendor] = useState<AdminVendor | null>(null);
  const [gradeByVendor, setGradeByVendor] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const [{ data, error }, { data: grades, error: gradesError }] = await Promise.all([
        supabase.from("vendors").select("*").order("created_at", { ascending: false }),
        supabase.from("vendor_quality_tags").select("vendor_id, tag"),
      ]);
      if (error) throw error;
      if (gradesError) throw gradesError;
      setVendors((data || []) as unknown as AdminVendor[]);
      setGradeByVendor(Object.fromEntries((grades || []).map((g) => [g.vendor_id, g.tag])));
    } catch (e: any) {
      toast.error(e.message || "Failed to load vendors");
    } finally {
      setLoading(false);
    }
  };

  const act = async (
    v: AdminVendor,
    patch: Partial<AdminVendor>,
    msg: string
  ) => {
    setActionId(v.id);
    try {
      const payload: Record<string, unknown> = { ...patch };
      if (patch.status === "approved") {
        payload.approved_by = user?.id || null;
        payload.approved_at = new Date().toISOString();
      }
      const { error } = await supabase.from("vendors").update(payload).eq("id", v.id);
      if (error) throw error;
      toast.success(msg);
      await fetchVendors();
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    } finally {
      setActionId(null);
    }
  };

  const setGrade = async (v: AdminVendor, grade: string) => {
    setActionId(v.id);
    const { error } =
      grade === NO_GRADE
        ? await supabase.from("vendor_quality_tags").delete().eq("vendor_id", v.id)
        : await supabase
            .from("vendor_quality_tags")
            .upsert({ vendor_id: v.id, tag: grade, updated_by: user?.id ?? null });
    setActionId(null);
    if (error) {
      toast.error(error.message || "Couldn't update grade");
      return;
    }
    setGradeByVendor((prev) => {
      const next = { ...prev };
      if (grade === NO_GRADE) delete next[v.id];
      else next[v.id] = grade;
      return next;
    });
    toast.success(grade === NO_GRADE ? `Grade removed for ${v.name}` : `${v.name} graded ${grade}`);
  };

  const registerShiprocket = async (v: AdminVendor) => {
    setActionId(v.id);
    const { errorMessage } = await invokeEdgeFunction("shiprocket-register-pickup", { vendor_id: v.id });
    setActionId(null);
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }
    toast.success("Pickup location registered with Shiprocket");
    await fetchVendors();
  };

  const statusBadge = (s: string) => {
    const variant =
      s === "approved"
        ? "secondary"
        : s === "rejected" || s === "suspended"
        ? "destructive"
        : "outline";
    return (
      <Badge variant={variant as any} className="capitalize">
        {s}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Vendor applications & stores</CardTitle>
        <VendorImportExportDialog vendors={vendors} onImported={fetchVendors} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : vendors.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No vendors yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead title="Internal admin grade - not visible to customers or boutiques">
                    Grade
                  </TableHead>
                  <TableHead>Trusted</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Shipping</TableHead>
                  <TableHead>Shiprocket</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((v, idx) => (
                  <TableRow key={v.id}>
                    <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{v.name}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {v.boutique_code}
                        </Badge>
                        {v.is_verified && <VerifiedBoutiqueBadge size="sm" />}
                      </div>
                      <div className="text-xs text-muted-foreground">/store/{v.slug}</div>
                      <div className="text-xs text-muted-foreground">
                        {v.contact_email || "—"}
                      </div>
                    </TableCell>
                    <TableCell>{statusBadge(v.status)}</TableCell>
                    <TableCell>
                      <Select
                        value={gradeByVendor[v.id] ?? NO_GRADE}
                        onValueChange={(g) => setGrade(v, g)}
                        disabled={actionId === v.id}
                      >
                        <SelectTrigger className="h-8 w-[84px] text-xs" aria-label={`Grade for ${v.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_GRADE} className="text-xs text-muted-foreground">
                            —
                          </SelectItem>
                          {QUALITY_GRADES.map((g) => (
                            <SelectItem key={g} value={g} className="text-xs font-semibold">
                              {g}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {v.is_trusted ? (
                        <ShieldCheck className="h-4 w-4 text-primary" />
                      ) : (
                        <span className="text-muted-foreground text-xs">No</span>
                      )}
                    </TableCell>
                    <TableCell>{v.commission_rate}%</TableCell>
                    <TableCell className="text-xs">
                      ₹{v.shipping_flat_rate} flat
                      <br />
                      <span className="text-muted-foreground">
                        free over ₹{v.free_shipping_threshold || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {v.shiprocket_pickup_location ? (
                        <Badge variant="secondary" className="gap-1">
                          <Truck className="h-3 w-3" /> Registered
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={actionId === v.id}
                          onClick={() => registerShiprocket(v)}
                        >
                          {actionId === v.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Register pickup"
                          )}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1 flex-wrap">
                        {v.status !== "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => act(v, { status: "approved" }, "Vendor approved")}
                            disabled={actionId === v.id}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                          </Button>
                        )}
                        {v.status === "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => act(v, { status: "suspended" }, "Vendor suspended")}
                            disabled={actionId === v.id}
                          >
                            <Ban className="h-4 w-4 mr-1" /> Suspend
                          </Button>
                        )}
                        {v.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => act(v, { status: "rejected" }, "Vendor rejected")}
                            disabled={actionId === v.id}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        )}
                        {(v.status === "rejected" || v.status === "suspended") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => act(v, { status: "approved" }, "Vendor reinstated")}
                            disabled={actionId === v.id}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Reinstate
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={v.is_trusted ? "default" : "outline"}
                          onClick={() =>
                            act(
                              v,
                              { is_trusted: !v.is_trusted },
                              v.is_trusted ? "Trusted status removed" : "Marked as trusted"
                            )
                          }
                          disabled={actionId === v.id}
                          title="Trusted partners publish products instantly"
                        >
                          <ShieldCheck className="h-4 w-4 mr-1" />
                          {v.is_trusted ? "Trusted" : "Trust"}
                        </Button>
                        <Button
                          size="sm"
                          variant={v.is_verified ? "default" : "outline"}
                          onClick={() =>
                            act(
                              v,
                              { is_verified: !v.is_verified },
                              v.is_verified ? "Verified badge removed" : "Verified badge enabled"
                            )
                          }
                          disabled={actionId === v.id || (!v.is_verified && v.status !== "approved")}
                          title="Shows a 'Verified Boutique' badge to customers"
                        >
                          <BadgeCheck className="h-4 w-4 mr-1" />
                          {v.is_verified ? "Verified" : "Verify"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setViewVendor(v)}>
                          <Eye className="h-4 w-4 mr-1" /> View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {viewVendor && (
        <VendorDetailsDialog
          vendor={viewVendor}
          open={!!viewVendor}
          onOpenChange={(o) => !o && setViewVendor(null)}
          onSaved={fetchVendors}
        />
      )}
    </Card>
  );
}
