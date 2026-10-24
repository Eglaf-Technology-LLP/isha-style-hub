import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, ThumbsUp, Trash2, Clock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useProductReviews, ReviewFormData } from "@/hooks/useProductReviews";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ImageDropzone } from "@/components/ImageDropzone";
import { uploadUserFile } from "@/lib/userPhotoUpload";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/dates";

const MAX_REVIEW_PHOTOS = 5;

interface ProductReviewsProps {
  productId: string;
}

function StarRating({ rating, onRatingChange, readonly = false, size = "md" }: {
  rating: number;
  onRatingChange?: (rating: number) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-6 w-6",
  };

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onRatingChange?.(star)}
          className={cn(
            "transition-colors",
            !readonly && "cursor-pointer hover:scale-110"
          )}
        >
          <Star
            className={cn(
              sizeClasses[size],
              star <= rating
                ? "fill-gold text-gold"
                : "text-foreground/20"
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function ProductReviews({ productId }: ProductReviewsProps) {
  const { reviews, loading, userReview, addReview, deleteReview, getAverageRating, getRatingDistribution } = useProductReviews(productId);
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<ReviewFormData>({ rating: 5, title: "", review_text: "" });
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [photosNeedApproval, setPhotosNeedApproval] = useState(true);

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("review_images_require_approval")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPhotosNeedApproval(data.review_images_require_approval);
      });
  }, []);

  const averageRating = getAverageRating();
  const distribution = getRatingDistribution();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.rating) return;

    setSubmitting(true);
    const result = await addReview({ ...formData, image_urls: photoUrls });
    if (result) {
      setShowForm(false);
      setFormData({ rating: 5, title: "", review_text: "" });
      setPhotoUrls([]);
    }
    setSubmitting(false);
  };

  const handleDelete = async (reviewId: string) => {
    if (confirm("Are you sure you want to delete this review?")) {
      await deleteReview(reviewId);
    }
  };

  if (loading) {
    return <div className="h-48 animate-pulse bg-ivory" />;
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[320px_1fr] lg:gap-20">
      {/* Summary */}
      <div>
        <p className="eyebrow text-gold">Reviews</p>
        <h2 className="mt-3 font-serif text-3xl leading-tight md:text-[2.6rem]">
          Customer <em className="font-normal text-primary">reviews</em>
        </h2>

        {reviews.length > 0 && (
          <>
            <div className="mt-8 flex items-end gap-4">
              <span className="font-serif text-6xl leading-none">{averageRating.toFixed(1)}</span>
              <div className="pb-1">
                <StarRating rating={Math.round(averageRating)} readonly size="md" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Based on {reviews.length} review{reviews.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = distribution[star as keyof typeof distribution];
                return (
                  <div key={star} className="flex items-center gap-3 text-xs">
                    <span className="w-8 tabular-nums text-muted-foreground">{star} ★</span>
                    <div className="h-1 flex-1 bg-foreground/10">
                      <div className="h-1 bg-gold" style={{ width: `${(count / reviews.length) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right tabular-nums text-muted-foreground">{count}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {user && !userReview && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-8 h-12 w-full border border-foreground text-[11px] font-medium uppercase tracking-[0.22em] transition-colors hover:bg-foreground hover:text-background"
          >
            Write a review
          </button>
        )}
        {!user && (
          <Link
            to="/account"
            className="mt-8 flex h-12 w-full items-center justify-center border border-foreground text-[11px] font-medium uppercase tracking-[0.22em] transition-colors hover:bg-foreground hover:text-background"
          >
            Sign in to write a review
          </Link>
        )}
      </div>

      <div className="min-w-0">
        {/* Write Review Form */}
        {user && !userReview && showForm && (
          <form onSubmit={handleSubmit} className="mb-10 space-y-5 border border-border bg-ivory p-6">
            <p className="font-serif text-2xl">Your review</p>
            <div>
              <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.2em]">Your rating</label>
              <StarRating
                rating={formData.rating}
                onRatingChange={(rating) => setFormData({ ...formData, rating })}
                size="lg"
              />
            </div>

            <div>
              <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.2em]">Title (optional)</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Summarize your experience"
                className="rounded-none bg-background"
              />
            </div>

            <div>
              <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.2em]">Review (optional)</label>
              <Textarea
                value={formData.review_text}
                onChange={(e) => setFormData({ ...formData, review_text: e.target.value })}
                placeholder="Tell others about the fit, fabric and finish"
                rows={4}
                className="rounded-none bg-background"
              />
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium uppercase tracking-[0.2em]">Photos (optional)</label>
              <p className="mb-2 text-xs text-muted-foreground">
                Share how it looks after it arrived or when you wore it - up to {MAX_REVIEW_PHOTOS} photos.
                {photosNeedApproval && " Photos appear once our team approves them."}
              </p>
              <ImageDropzone
                folder="vendor-uploads"
                value={photoUrls}
                onChange={setPhotoUrls}
                maxFiles={MAX_REVIEW_PHOTOS}
                uploadFile={(file) => uploadUserFile(file, "reviews")}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="h-12 bg-primary px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit review"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="h-12 px-6 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Reviews List */}
        {reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-foreground/15 px-6 py-14 text-center">
            <p className="font-serif text-2xl">No reviews yet</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Bought this piece? Be the first to tell others about the fit, fabric and finish.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {reviews.map((review) => (
              <li key={review.id} className="py-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <StarRating rating={review.rating} readonly size="sm" />
                    {review.title && <h4 className="mt-2 font-serif text-xl">{review.title}</h4>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(new Date(review.created_at))}
                      {review.is_verified_purchase && <span className="ml-3 text-emerald-700">✓ Verified purchase</span>}
                    </p>
                  </div>

                  {user && review.user_id === user.id && (
                    <button
                      type="button"
                      onClick={() => handleDelete(review.id)}
                      className="p-2 text-muted-foreground hover:text-destructive"
                      aria-label="Delete your review"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {review.review_text && (
                  <p className="mt-3 text-[15px] leading-relaxed text-foreground/80">{review.review_text}</p>
                )}

                {review.review_images?.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {review.review_images.map((img) => (
                      <a
                        key={img.id}
                        href={img.url}
                        target="_blank"
                        rel="noreferrer"
                        className="relative block h-24 w-20 overflow-hidden bg-ivory"
                      >
                        <img src={img.url} alt="Customer photo" loading="lazy" className="h-full w-full object-cover" />
                        {img.status === "pending" && (
                          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-foreground/70 py-0.5 text-[10px] text-background">
                            <Clock className="h-3 w-3" /> Awaiting approval
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                )}

                <button type="button" className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                  <ThumbsUp className="h-3 w-3" />
                  Helpful ({review.helpful_count})
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
