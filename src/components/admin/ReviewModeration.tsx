import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, ImageIcon, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deletePublicPhoto } from "@/lib/userPhotoUpload";

interface AdminReviewImage {
  id: string;
  url: string;
  status: "pending" | "approved";
}

interface AdminReview {
  id: string;
  rating: number;
  title: string | null;
  review_text: string | null;
  is_verified_purchase: boolean;
  created_at: string;
  product_id: string;
  products: { name: string } | null;
  review_images: AdminReviewImage[];
}

type View = "pending_photos" | "all";

export function ReviewModeration() {
  const { user } = useAuth();
  const [requireApproval, setRequireApproval] = useState<boolean | null>(null);
  const [savingSetting, setSavingSetting] = useState(false);
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("pending_photos");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: settings }, { data, error }] = await Promise.all([
      supabase.from("platform_settings").select("review_images_require_approval").maybeSingle(),
      supabase
        .from("product_reviews")
        .select("id, rating, title, review_text, is_verified_purchase, created_at, product_id, products(name), review_images(id, url, status)")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (settings) setRequireApproval(settings.review_images_require_approval);
    if (error) toast.error(error.message || "Failed to load reviews");
    setReviews((data || []) as unknown as AdminReview[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleApproval = async (on: boolean) => {
    setSavingSetting(true);
    const { error } = await supabase
      .from("platform_settings")
      .update({ review_images_require_approval: on, updated_by: user?.id ?? null })
      .eq("id", true);
    setSavingSetting(false);
    if (error) return toast.error(error.message || "Couldn't save setting");
    setRequireApproval(on);
    toast.success(on ? "New review photos now need approval" : "New review photos now publish immediately");
  };

  const approveImage = async (img: AdminReviewImage) => {
    setBusyId(img.id);
    const { error } = await supabase.from("review_images").update({ status: "approved" }).eq("id", img.id);
    setBusyId(null);
    if (error) return toast.error(error.message || "Couldn't approve photo");
    setReviews((prev) =>
      prev.map((r) => ({
        ...r,
        review_images: r.review_images.map((i) => (i.id === img.id ? { ...i, status: "approved" } : i)),
      })),
    );
    toast.success("Photo approved");
  };

  const deleteImage = async (img: AdminReviewImage) => {
    if (!confirm("Delete this photo permanently?")) return;
    setBusyId(img.id);
    const { error } = await supabase.from("review_images").delete().eq("id", img.id);
    if (!error) await deletePublicPhoto(img.url);
    setBusyId(null);
    if (error) return toast.error(error.message || "Couldn't delete photo");
    setReviews((prev) => prev.map((r) => ({ ...r, review_images: r.review_images.filter((i) => i.id !== img.id) })));
    toast.success("Photo deleted");
  };

  const deleteReview = async (review: AdminReview) => {
    if (!confirm("Delete this review and all its photos permanently?")) return;
    setBusyId(review.id);
    const { error } = await supabase.from("product_reviews").delete().eq("id", review.id);
    if (!error) await Promise.all(review.review_images.map((i) => deletePublicPhoto(i.url)));
    setBusyId(null);
    if (error) return toast.error(error.message || "Couldn't delete review");
    setReviews((prev) => prev.filter((r) => r.id !== review.id));
    toast.success("Review deleted");
  };

  const pendingCount = reviews.reduce((n, r) => n + r.review_images.filter((i) => i.status === "pending").length, 0);
  const shown =
    view === "pending_photos" ? reviews.filter((r) => r.review_images.some((i) => i.status === "pending")) : reviews;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-5">
          <div>
            <p className="font-medium">Approve customer review photos before they appear</p>
            <p className="text-sm text-muted-foreground">
              On: new photos wait for approval here. Off: they publish immediately (you can still delete them).
              Applies to photos uploaded from now on.
            </p>
          </div>
          <Switch
            checked={!!requireApproval}
            disabled={requireApproval === null || savingSetting}
            onCheckedChange={toggleApproval}
            aria-label="Require approval for review photos"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Customer reviews</CardTitle>
            <CardDescription>Remove inappropriate reviews or photos.</CardDescription>
          </div>
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="pending_photos" className="gap-1">
                Photos awaiting approval
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="all">All reviews</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {view === "pending_photos" ? "No photos waiting for approval." : "No reviews yet."}
            </p>
          ) : (
            <div className="space-y-3">
              {shown.map((r, idx) => (
                <div key={r.id} className="space-y-3 rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{idx + 1}.</span>
                        <span className="font-medium">{r.products?.name ?? "Deleted product"}</span>
                        <span className="flex items-center gap-0.5 text-amber-600">
                          {r.rating} <Star className="h-3.5 w-3.5 fill-current" />
                        </span>
                        {r.is_verified_purchase && <Badge variant="secondary" className="text-[10px]">Verified purchase</Badge>}
                      </div>
                      {r.title && <p className="mt-1 font-medium">{r.title}</p>}
                      {r.review_text && <p className="text-sm text-muted-foreground">{r.review_text}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy p")}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-destructive hover:text-destructive"
                      disabled={busyId === r.id}
                      onClick={() => deleteReview(r)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Delete review
                    </Button>
                  </div>

                  {r.review_images.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                      {r.review_images.map((img) => (
                        <div key={img.id} className="w-28 space-y-1">
                          <a href={img.url} target="_blank" rel="noreferrer" className="relative block">
                            <img src={img.url} alt="Customer review photo" className="h-28 w-28 rounded-md border border-border object-cover" />
                            {img.status === "pending" && (
                              <Badge className="absolute left-1 top-1 bg-amber-500 text-[10px] text-white">Pending</Badge>
                            )}
                          </a>
                          <div className="flex gap-1">
                            {img.status === "pending" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 flex-1 px-1 text-xs"
                                disabled={busyId === img.id}
                                onClick={() => approveImage(img)}
                                aria-label="Approve photo"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 flex-1 px-1 text-xs text-destructive hover:text-destructive"
                              disabled={busyId === img.id}
                              onClick={() => deleteImage(img)}
                              aria-label="Delete photo"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ImageIcon className="h-3.5 w-3.5" /> No photos
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
