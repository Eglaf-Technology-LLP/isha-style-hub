import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, ImageOff } from "lucide-react";
import { toast } from "sonner";

interface ModeratedProduct {
  id: string;
  name: string;
  price: number;
  images: string[] | null;
  vendor_id: string | null;
  approval_status: string;
  rejection_reason: string | null;
  created_at: string;
  vendors: { name: string } | null;
}

const FILTERS = ["pending_review", "approved", "rejected", "draft"] as const;

export function ProductModeration() {
  const [products, setProducts] = useState<ModeratedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending_review");
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ModeratedProduct | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    fetchProducts();
  }, [filter]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, price, images, vendor_id, approval_status, rejection_reason, created_at, vendors(name)"
        )
        .eq("approval_status", filter)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setProducts((data || []) as unknown as ModeratedProduct[]);
    } catch (e: any) {
      toast.error(e.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  const approve = async (p: ModeratedProduct) => {
    setActionId(p.id);
    try {
      const { error } = await supabase
        .from("products")
        .update({ approval_status: "approved", rejection_reason: null })
        .eq("id", p.id);
      if (error) throw error;
      toast.success(`${p.name} approved`);
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e: any) {
      toast.error(e.message || "Failed to approve product");
    } finally {
      setActionId(null);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    setActionId(rejecting.id);
    try {
      const { error } = await supabase
        .from("products")
        .update({
          approval_status: "rejected",
          rejection_reason: rejectionReason.trim() || "Did not meet listing guidelines.",
        })
        .eq("id", rejecting.id);
      if (error) throw error;
      toast.success(`${rejecting.name} rejected`);
      setProducts((prev) => prev.filter((x) => x.id !== rejecting.id));
      setRejecting(null);
      setRejectionReason("");
    } catch (e: any) {
      toast.error(e.message || "Failed to reject product");
    } finally {
      setActionId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Vendor product moderation</CardTitle>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-44 h-9 text-xs capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f} value={f} className="capitalize">
                {f.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : products.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No products with status "{filter.replace("_", " ")}".
          </p>
        ) : (
          <div className="space-y-3">
            {products.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-4 p-3 border border-border rounded-lg"
              >
                <div className="w-14 h-14 bg-muted rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {p.images?.[0] ? (
                    <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <ImageOff className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.vendors?.name || "No vendor"} &middot; ₹{Number(p.price).toFixed(0)}
                  </div>
                  {p.approval_status === "rejected" && p.rejection_reason && (
                    <div className="text-xs text-destructive mt-1">
                      Reason: {p.rejection_reason}
                    </div>
                  )}
                </div>
                <Badge variant="outline" className="capitalize flex-shrink-0">
                  {p.approval_status.replace("_", " ")}
                </Badge>
                {p.approval_status === "pending_review" && (
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => approve(p)}
                      disabled={actionId === p.id}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRejecting(p);
                        setRejectionReason("");
                      }}
                      disabled={actionId === p.id}
                    >
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.name}</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Let the vendor know why (e.g. missing size chart, blurry images, prohibited item)"
            rows={4}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reject} disabled={actionId === rejecting?.id}>
              {actionId === rejecting?.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
