import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, Ban, ShieldCheck, Pencil, Truck } from "lucide-react";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

interface AdminVendor {
  id: string;
  name: string;
  slug: string;
  status: string;
  is_trusted: boolean;
  commission_rate: number;
  shipping_flat_rate: number;
  free_shipping_threshold: number | null;
  return_window_days: number;
  rating: number;
  contact_email: string | null;
  description: string | null;
  created_at: string;
  shiprocket_pickup_location: string | null;
}

export function VendorManagement() {
  const { user } = useAuth();
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [editVendor, setEditVendor] = useState<AdminVendor | null>(null);

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vendors")
        .select(
          "id, name, slug, status, is_trusted, commission_rate, shipping_flat_rate, free_shipping_threshold, return_window_days, rating, contact_email, description, created_at, shiprocket_pickup_location"
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      setVendors((data || []) as AdminVendor[]);
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

  const saveEdit = async () => {
    if (!editVendor) return;
    setActionId(editVendor.id);
    try {
      const { error } = await supabase
        .from("vendors")
        .update({
          commission_rate: editVendor.commission_rate,
          shipping_flat_rate: editVendor.shipping_flat_rate,
          free_shipping_threshold: editVendor.free_shipping_threshold,
          return_window_days: editVendor.return_window_days,
          description: editVendor.description,
        })
        .eq("id", editVendor.id);
      if (error) throw error;
      toast.success("Vendor updated");
      setEditVendor(null);
      await fetchVendors();
    } catch (e: any) {
      toast.error(e.message || "Update failed");
    } finally {
      setActionId(null);
    }
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
      <CardHeader>
        <CardTitle>Vendor applications & stores</CardTitle>
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
                  <TableHead>Store</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trusted</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Shipping</TableHead>
                  <TableHead>Shiprocket</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="font-medium">{v.name}</div>
                      <div className="text-xs text-muted-foreground">/store/{v.slug}</div>
                      <div className="text-xs text-muted-foreground">
                        {v.contact_email || "—"}
                      </div>
                    </TableCell>
                    <TableCell>{statusBadge(v.status)}</TableCell>
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
                        <Dialog
                          open={editVendor?.id === v.id}
                          onOpenChange={(o) => setEditVendor(o ? v : null)}
                        >
                          <DialogTrigger asChild>
                            <Button size="sm" variant="ghost">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit {v.name}</DialogTitle>
                            </DialogHeader>
                            {editVendor && (
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label>Commission rate (%)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={editVendor.commission_rate}
                                    onChange={(e) =>
                                      setEditVendor({
                                        ...editVendor,
                                        commission_rate: Number(e.target.value),
                                      })
                                    }
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>Flat shipping (₹)</Label>
                                    <Input
                                      type="number"
                                      value={editVendor.shipping_flat_rate}
                                      onChange={(e) =>
                                        setEditVendor({
                                          ...editVendor,
                                          shipping_flat_rate: Number(e.target.value),
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Free over (₹)</Label>
                                    <Input
                                      type="number"
                                      value={editVendor.free_shipping_threshold ?? ""}
                                      onChange={(e) =>
                                        setEditVendor({
                                          ...editVendor,
                                          free_shipping_threshold: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                        })
                                      }
                                    />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label>Return window (days)</Label>
                                  <Input
                                    type="number"
                                    value={editVendor.return_window_days}
                                    onChange={(e) =>
                                      setEditVendor({
                                        ...editVendor,
                                        return_window_days: Number(e.target.value),
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Description</Label>
                                  <Textarea
                                    rows={3}
                                    value={editVendor.description || ""}
                                    onChange={(e) =>
                                      setEditVendor({
                                        ...editVendor,
                                        description: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <Button
                                  className="w-full"
                                  onClick={saveEdit}
                                  disabled={actionId === v.id}
                                >
                                  {actionId === v.id && (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  )}
                                  Save changes
                                </Button>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
