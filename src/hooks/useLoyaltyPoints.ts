import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./useAuth";

export interface LoyaltyPoints {
  id: string;
  user_id: string;
  total_points: number;
  lifetime_points: number;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  created_at: string;
  updated_at: string;
}

export interface LoyaltyTransaction {
  id: string;
  user_id: string;
  points: number;
  transaction_type: 'earn' | 'redeem' | 'expire' | 'bonus' | 'referral';
  description: string | null;
  order_id: string | null;
  created_at: string;
}

const POINTS_PER_RUPEE = 1;
const TIER_THRESHOLDS = {
  bronze: 0,
  silver: 1000,
  gold: 5000,
  platinum: 10000,
};

export function useLoyaltyPoints() {
  const [loyaltyPoints, setLoyaltyPoints] = useState<LoyaltyPoints | null>(null);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchLoyaltyData();
    } else {
      setLoyaltyPoints(null);
      setTransactions([]);
      setLoading(false);
    }
  }, [user]);

  const fetchLoyaltyData = async () => {
    if (!user) return;

    try {
      const { data: pointsData, error: pointsError } = await supabase
        .from('loyalty_points')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (pointsError) throw pointsError;
      setLoyaltyPoints(pointsData as LoyaltyPoints | null);

      const { data: txData, error: txError } = await supabase
        .from('loyalty_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (txError) throw txError;
      setTransactions((txData || []) as LoyaltyTransaction[]);
    } catch (error) {
      console.error('Error fetching loyalty data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculatePointsForOrder = (orderTotal: number) => {
    return Math.floor(orderTotal * POINTS_PER_RUPEE);
  };

  const getNextTier = () => {
    if (!loyaltyPoints) return { tier: 'silver', pointsNeeded: TIER_THRESHOLDS.silver };
    
    const currentLifetime = loyaltyPoints.lifetime_points;
    
    if (currentLifetime < TIER_THRESHOLDS.silver) {
      return { tier: 'silver', pointsNeeded: TIER_THRESHOLDS.silver - currentLifetime };
    }
    if (currentLifetime < TIER_THRESHOLDS.gold) {
      return { tier: 'gold', pointsNeeded: TIER_THRESHOLDS.gold - currentLifetime };
    }
    if (currentLifetime < TIER_THRESHOLDS.platinum) {
      return { tier: 'platinum', pointsNeeded: TIER_THRESHOLDS.platinum - currentLifetime };
    }
    return null;
  };

  const getTierBenefits = (tier: string) => {
    const benefits = {
      bronze: ['1 point per ₹1 spent', 'Birthday bonus points'],
      silver: ['1.25x points multiplier', 'Early access to sales', 'Free shipping on orders over ₹500'],
      gold: ['1.5x points multiplier', 'Exclusive discounts', 'Free shipping on all orders', 'Priority support'],
      platinum: ['2x points multiplier', 'VIP access', 'Free express shipping', 'Personal shopper', 'Exclusive products'],
    };
    return benefits[tier as keyof typeof benefits] || benefits.bronze;
  };

  const getPointsValue = (points: number) => {
    return points / 10; // 10 points = ₹1
  };

  return {
    loyaltyPoints,
    transactions,
    loading,
    calculatePointsForOrder,
    getNextTier,
    getTierBenefits,
    getPointsValue,
    TIER_THRESHOLDS,
    refetch: fetchLoyaltyData,
  };
}
