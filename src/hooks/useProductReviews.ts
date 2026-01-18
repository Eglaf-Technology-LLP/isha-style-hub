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
}

export interface ReviewFormData {
  rating: number;
  title?: string;
  review_text?: string;
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
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setReviews(data || []);
      
      if (user) {
        const myReview = data?.find(r => r.user_id === user.id);
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

      setReviews(prev => [data, ...prev]);
      setUserReview(data);
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
          ...reviewData,
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
