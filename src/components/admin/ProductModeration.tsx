import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { aiContentLabel } from "@/lib/aiContent";
import { useSignedOriginalUrls } from "@/lib/productOriginals";

interface ModeratedProduct {
  id: string;
  name: string;
  price: number;
  images: string[] | null;
  vendor_id: string | null;
  approval_status: string;
  rejection_reason: string | null;
  created_at: string;
  ai_content_status: string | null;
  ai_original_photo_paths: string[];
  video_url: string | null;
  video_status: string | null;
  video_is_primary: boolean;
  vendors: { name: string } | null;
}

function OriginalPhotoThumbs({ paths }: { paths: string[] }) {
  const urls = useSignedOriginalUrls(paths);
  return (
    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Originals (private):</span>
      {paths.map((path) =>
        urls[path] ? (
          <a key={path} href={urls[path]} target="_blank" rel="noreferrer" title="Open original">
            <img src={urls[path]} alt="Original product photo" className="h-12 w-12 rounded object-cover border-2 border-amber-300" />
          </a>
        ) : (
          <div key={path} className="h-12 w-12 rounded bg-muted animate-pulse" />
        ),
      )}
    </div>
  );
}

const FILTERS = ["pending_review", "approved", "rejected", "draft"] as const;

// Supabase filters go in the URL - keep each .in() list a safe length.
const chunks = <T,>(list: T[], size = 100) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const plural = (n: number) => `${n} product${n === 1 ? "" : "s"}`;

function reportResult(list: { name: string }[], done: string[], verb: "approved" | "rejected") {
  const skipped = list.length - done.length;
  if (done.length === 0) {
    toast.info(`Nothing changed - ${list.length === 1 ? "this product was" : "these products were"} already reviewed`);
    return;
  }
  toast.success(list.length === 1 ? `${list[0].name} ${verb}` : `${plural(done.length)} ${verb}`, {
    description: skipped ? `${plural(skipped)} had already been reviewed` : undefined,
  });
}

export function ProductModeration() {
  const [products, setProducts] = useState<ModeratedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending_review");
  const [actionId, setActionId] = useState<string | null>(null);
  // One product (its Reject button) or several (bulk) - same dialog and reason.
  const [rejecting, setRejecting] = useState<ModeratedProduct[] | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    setSelected(new Set());
    fetchProducts();
  }, [filter]);

  // Only listings waiting for review can be approved or rejected here.
  const selectable = useMemo(() => products.filter((p) => p.approval_status === "pending_review"), [products]);
  const selectedProducts = selectable.filter((p) => selected.has(p.id));
  const allSelected = selectable.length > 0 && selectedProducts.length === selectable.length;

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAll = (on: boolean) => setSelected(on ? new Set(selectable.map((p) => p.id)) : new Set());
  const dropFromList = (ids: string[]) => {
    const gone = new Set(ids);
    setProducts((prev) => prev.filter((x) => !gone.has(x.id)));
    setSelected((prev) => new Set([...prev].filter((id) => !gone.has(id))));
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, price, images, vendor_id, approval_status, rejection_reason, created_at, ai_content_status, ai_original_photo_paths, video_url, video_status, video_is_primary, vendors(name)"
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

  // Approve one or many. The admin reviewed the whole card, video included,
  // so a pending video is approved along with the listing ("Reject video"
  // drops it). Only rows still waiting for review change - another admin may
  // have acted on some in the meantime.
  const approveMany = async (list: ModeratedProduct[]) => {
    if (list.length === 1) setActionId(list[0].id);
    else setBulkBusy(true);
    const done: string[] = [];
    try {
      for (const ids of chunks(list.map((p) => p.id))) {
        const { data, error } = await supabase
          .from("products")
          .update({ approval_status: "approved", rejection_reason: null })
          .in("id", ids)
          .eq("approval_status", "pending_review")
          .select("id");
        if (error) throw error;
        done.push(...(data ?? []).map((r) => r.id));
      }
      const videoIds = list.filter((p) => p.video_status === "pending" && done.includes(p.id)).map((p) => p.id);
      for (const ids of chunks(videoIds)) {
        const { error } = await supabase
          .from("products")
          .update({ video_status: "approved" })
          .in("id", ids)
          .eq("video_status", "pending");
        if (error) throw error;
      }
      reportResult(list, done, "approved");
      // None of these is waiting for review any more (approved now, or by
      // someone else in the meantime).
      dropFromList(list.map((p) => p.id));
    } catch (e: any) {
      toast.error(e.message || "Failed to approve", {
        description: done.length ? `${plural(done.length)} were approved before the error` : undefined,
      });
      dropFromList(done);
    } finally {
      setActionId(null);
      setBulkBusy(false);
      setConfirmApprove(false);
    }
  };

  const rejectVideo = async (p: ModeratedProduct) => {
    setActionId(p.id);
    const { error } = await supabase.from("products").update({ video_status: "rejected" }).eq("id", p.id);
    setActionId(null);
    if (error) return toast.error(error.message || "Couldn't reject video");
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, video_status: "rejected" } : x)));
    toast.success("Video rejected - it won't be shown to shoppers");
  };

  const reject = async () => {
    if (!rejecting?.length) return;
    const list = rejecting;
    if (list.length === 1) setActionId(list[0].id);
    else setBulkBusy(true);
    const done: string[] = [];
    try {
      for (const ids of chunks(list.map((p) => p.id))) {
        const { data, error } = await supabase
          .from("products")
          .update({
            approval_status: "rejected",
            rejection_reason: rejectionReason.trim() || "Did not meet listing guidelines.",
          })
          .in("id", ids)
          .eq("approval_status", "pending_review")
          .select("id");
        if (error) throw error;
        done.push(...(data ?? []).map((r) => r.id));
      }
      reportResult(list, done, "rejected");
      dropFromList(list.map((p) => p.id));
      setRejecting(null);
      setRejectionReason("");
    } catch (e: any) {
      toast.error(e.message || "Failed to reject", {
        description: done.length ? `${plural(done.length)} were rejected before the error` : undefined,
      });
      dropFromList(done);
    } finally {
      setActionId(null);
      setBulkBusy(false);
    }
  };

  const rejectingBusy = bulkBusy || (rejecting?.length === 1 && actionId === rejecting[0].id);

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
        {!loading && selectable.length > 0 && (
          <div className="sticky top-[65px] z-10 -mx-2 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={allSelected ? true : selectedProducts.length > 0 ? "indeterminate" : false}
                onCheckedChange={(v) => toggleAll(v === true)}
                aria-label="Select all products waiting for review"
                disabled={bulkBusy}
              />
              {selectedProducts.length > 0 ? `${selectedProducts.length} of ${selectable.length} selected` : `Select all (${selectable.length})`}
            </label>
            {selectedProducts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                <Button size="sm" onClick={() => setConfirmApprove(true)} disabled={bulkBusy}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve {selectedProducts.length}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setRejecting(selectedProducts);
                    setRejectionReason("");
                  }}
                  disabled={bulkBusy}
                >
                  <XCircle className="h-4 w-4 mr-1" /> Reject {selectedProducts.length}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleAll(false)} disabled={bulkBusy}>
                  Clear
                </Button>
              </div>
            )}
          </div>
        )}
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
                className={`flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 p-3 border rounded-lg ${selected.has(p.id) ? "border-primary/50 bg-primary/5" : "border-border"}`}
              >
                {p.approval_status === "pending_review" && (
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={(v) => toggle(p.id, v === true)}
                    aria-label={`Select ${p.name}`}
                    disabled={bulkBusy}
                    className="flex-shrink-0"
                  />
                )}
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
                  <div className="mt-1">
                    <Badge
                      variant="outline"
                      className={
                        !p.ai_content_status
                          ? "text-[10px] text-muted-foreground"
                          : p.ai_content_status === "none"
                            ? "text-[10px]"
                            : "text-[10px] border-amber-300 bg-amber-50 text-amber-800"
                      }
                    >
                      AI: {aiContentLabel(p.ai_content_status)}
                    </Badge>
                  </div>
                  {p.ai_original_photo_paths?.length > 0 && <OriginalPhotoThumbs paths={p.ai_original_photo_paths} />}
                  {p.video_url && (
                    <div className="mt-2 flex items-start gap-3">
                      <video src={p.video_url} controls muted playsInline className="h-28 w-20 rounded-md bg-black object-cover" />
                      <div className="space-y-1 text-xs">
                        <Badge
                          variant="outline"
                          className={
                            p.video_status === "approved"
                              ? "text-[10px] border-emerald-300 text-emerald-700"
                              : p.video_status === "rejected"
                                ? "text-[10px] border-destructive/40 text-destructive"
                                : "text-[10px] border-amber-300 bg-amber-50 text-amber-800"
                          }
                        >
                          Video {p.video_status ?? "pending"}
                        </Badge>
                        <p className="text-muted-foreground">{p.video_is_primary ? "Shown first" : "Highlight frame over main image"}</p>
                        {(p.video_status === "pending" || p.video_status === "approved") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            disabled={actionId === p.id}
                            onClick={() => rejectVideo(p)}
                          >
                            Reject video
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  {p.approval_status === "rejected" && p.rejection_reason && (
                    <div className="text-xs text-destructive mt-1">
                      Reason: {p.rejection_reason}
                    </div>
                  )}
                </div>
                {/* On a phone the status and buttons drop to their own line. */}
                <div className="flex w-full sm:w-auto items-center justify-end gap-2 flex-shrink-0">
                  <Badge variant="outline" className="capitalize flex-shrink-0">
                    {p.approval_status.replace("_", " ")}
                  </Badge>
                  {p.approval_status === "pending_review" && (
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => approveMany([p])}
                        disabled={actionId === p.id || bulkBusy}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejecting([p]);
                          setRejectionReason("");
                        }}
                        disabled={actionId === p.id || bulkBusy}
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && !rejectingBusy && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {rejecting?.length === 1 ? `Reject ${rejecting[0].name}` : `Reject ${plural(rejecting?.length ?? 0)}`}
            </DialogTitle>
            {rejecting && rejecting.length > 1 && (
              <DialogDescription>Every selected boutique sees this same reason on its product.</DialogDescription>
            )}
          </DialogHeader>
          <Textarea
            placeholder="Let the vendor know why (e.g. missing size chart, blurry images, prohibited item)"
            rows={4}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={rejectingBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reject} disabled={rejectingBusy}>
              {rejectingBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {rejecting && rejecting.length > 1 ? `Reject ${plural(rejecting.length)}` : "Reject product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmApprove} onOpenChange={(o) => !bulkBusy && setConfirmApprove(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve {plural(selectedProducts.length)}?</DialogTitle>
            <DialogDescription>
              Each boutique's listing is approved as it is, including any product video waiting for review.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmApprove(false)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button onClick={() => approveMany(selectedProducts)} disabled={bulkBusy}>
              {bulkBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Approve {plural(selectedProducts.length)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
