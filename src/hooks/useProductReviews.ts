import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./useAuth";

export interface ProductReview {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  title: string | null;
  review_text: string | null;
  is_verified_purchase: boolean;
  is_approved: boolean;
  helpful_count: number;
  created_at: string;
  updated_at: string;
  review_images: ReviewImage[];
}

export interface ReviewImage {
  id: string;
  url: string;
  status: "pending" | "approved";
  user_id: string;
}

export interface ReviewFormData {
  rating: number;
  title?: string;
  review_text?: string;
  // Public URLs of photos already uploaded to the reviewer's own folder.
  image_urls?: string[];
}

export function useProductReviews(productId?: string) {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [userReview, setUserReview] = useState<ProductReview | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (productId) {
      fetchReviews();
    }
  }, [productId, user]);

  const fetchReviews = async () => {
    if (!productId) return;

    try {
      const { data, error } = await supabase
        .from('product_reviews')
        // RLS returns approved photos to everyone, plus the reviewer's own
        // still-pending ones - no client-side filtering needed.
        .select('*, review_images(id, url, status, user_id)')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const loaded = (data || []) as ProductReview[];
      setReviews(loaded);

      if (user) {
        const myReview = loaded.find(r => r.user_id === user.id);
        setUserReview(myReview || null);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const addReview = async (reviewData: ReviewFormData) => {
    if (!user || !productId) {
      toast.error('Please login to write a review');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('product_reviews')
        .insert({
          product_id: productId,
          user_id: user.id,
          rating: reviewData.rating,
          title: reviewData.title || null,
          review_text: reviewData.review_text || null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error('You have already reviewed this product');
          return null;
        }
        throw error;
      }

      const imageUrls = reviewData.image_urls ?? [];
      if (imageUrls.length > 0) {
        const { error: imagesError } = await supabase
          .from('review_images')
          .insert(imageUrls.map((url) => ({ review_id: data.id, user_id: user.id, url })));
        if (imagesError) {
          console.error('Error attaching review images:', imagesError);
          toast.error('Review saved, but the photos could not be attached');
        }
      }

      await fetchReviews();
      toast.success('Review submitted!');
      return data;
    } catch (error) {
      console.error('Error adding review:', error);
      toast.error('Failed to submit review');
      return null;
    }
  };

  const updateReview = async (reviewId: string, reviewData: Partial<ReviewFormData>) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('product_reviews')
        .update({
          rating: reviewData.rating,
          title: reviewData.title,
          review_text: reviewData.review_text,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reviewId)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchReviews();
      toast.success('Review updated!');
      return true;
    } catch (error) {
      console.error('Error updating review:', error);
      toast.error('Failed to update review');
      return false;
    }
  };

  const deleteReview = async (reviewId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('product_reviews')
        .delete()
        .eq('id', reviewId)
        .eq('user_id', user.id);

      if (error) throw error;

      setReviews(prev => prev.filter(r => r.id !== reviewId));
      setUserReview(null);
      toast.success('Review deleted');
      return true;
    } catch (error) {
      console.error('Error deleting review:', error);
      toast.error('Failed to delete review');
      return false;
    }
  };

  const getAverageRating = () => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return sum / reviews.length;
  };

  const getRatingDistribution = () => {
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => {
      distribution[r.rating as keyof typeof distribution]++;
    });
    return distribution;
  };

  return {
    reviews,
    loading,
    userReview,
    addReview,
    updateReview,
    deleteReview,
    getAverageRating,
    getRatingDistribution,
    refetch: fetchReviews,
  };
}
