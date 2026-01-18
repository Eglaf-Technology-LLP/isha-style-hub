import { useState } from "react";
import { Star, ThumbsUp, Trash2, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useProductReviews, ReviewFormData } from "@/hooks/useProductReviews";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

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
    sm: "h-3 w-3",
    md: "h-5 w-5",
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
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
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
  const [submitting, setSubmitting] = useState(false);

  const averageRating = getAverageRating();
  const distribution = getRatingDistribution();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.rating) return;

    setSubmitting(true);
    const result = await addReview(formData);
    if (result) {
      setShowForm(false);
      setFormData({ rating: 5, title: "", review_text: "" });
    }
    setSubmitting(false);
  };

  const handleDelete = async (reviewId: string) => {
    if (confirm("Are you sure you want to delete this review?")) {
      await deleteReview(reviewId);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-48 bg-muted rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Customer Reviews</h2>

      {/* Summary Section */}
      <div className="grid md:grid-cols-2 gap-6 p-6 bg-muted/30 rounded-lg">
        <div className="flex flex-col items-center justify-center">
          <div className="text-4xl font-bold">{averageRating.toFixed(1)}</div>
          <StarRating rating={Math.round(averageRating)} readonly size="lg" />
          <div className="text-sm text-muted-foreground mt-1">
            Based on {reviews.length} review{reviews.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="space-y-2">
          {[5, 4, 3, 2, 1].map((star) => (
            <div key={star} className="flex items-center gap-2">
              <span className="text-sm w-3">{star}</span>
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <Progress
                value={reviews.length ? (distribution[star as keyof typeof distribution] / reviews.length) * 100 : 0}
                className="h-2 flex-1"
              />
              <span className="text-sm text-muted-foreground w-8">
                {distribution[star as keyof typeof distribution]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Write Review Button/Form */}
      {user && !userReview && (
        <div className="border rounded-lg p-4">
          {!showForm ? (
            <Button onClick={() => setShowForm(true)}>Write a Review</Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Your Rating</label>
                <StarRating
                  rating={formData.rating}
                  onRatingChange={(rating) => setFormData({ ...formData, rating })}
                  size="lg"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Title (optional)</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Summarize your experience"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Review (optional)</label>
                <Textarea
                  value={formData.review_text}
                  onChange={(e) => setFormData({ ...formData, review_text: e.target.value })}
                  placeholder="Tell others about your experience"
                  rows={4}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Review"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {!user && (
        <p className="text-muted-foreground text-sm">Please login to write a review</p>
      )}

      {/* Reviews List */}
      <div className="space-y-4">
        {reviews.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No reviews yet. Be the first to review this product!
          </p>
        ) : (
          reviews.map((review) => (
            <div key={review.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                  <div>
                    <StarRating rating={review.rating} readonly size="sm" />
                    {review.title && (
                      <h4 className="font-medium">{review.title}</h4>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(review.created_at), "MMM d, yyyy")}
                      {review.is_verified_purchase && (
                        <span className="ml-2 text-green-600">✓ Verified Purchase</span>
                      )}
                    </p>
                  </div>
                </div>

                {user && review.user_id === user.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(review.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>

              {review.review_text && (
                <p className="text-muted-foreground">{review.review_text}</p>
              )}

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="gap-1">
                  <ThumbsUp className="h-3 w-3" />
                  Helpful ({review.helpful_count})
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
