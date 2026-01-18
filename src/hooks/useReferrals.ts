import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./useAuth";

export interface Referral {
  id: string;
  referrer_user_id: string;
  referral_code: string;
  referred_user_id: string | null;
  referred_email: string | null;
  status: 'pending' | 'signed_up' | 'completed' | 'rewarded';
  referrer_reward_points: number;
  referred_reward_points: number;
  created_at: string;
  completed_at: string | null;
}

const generateReferralCode = (userId: string) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'REF';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export function useReferrals() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [myReferralCode, setMyReferralCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchReferrals();
    } else {
      setReferrals([]);
      setMyReferralCode(null);
      setLoading(false);
    }
  }, [user]);

  const fetchReferrals = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReferrals((data || []) as Referral[]);

      // Check if user has a referral code
      if (data && data.length > 0) {
        setMyReferralCode(data[0].referral_code);
      }
    } catch (error) {
      console.error('Error fetching referrals:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateMyReferralCode = async (): Promise<string | null> => {
    if (!user) {
      toast.error('Please login to generate a referral code');
      return null;
    }

    if (myReferralCode) {
      return myReferralCode;
    }

    try {
      const code = generateReferralCode(user.id);
      
      const { data, error } = await supabase
        .from('referrals')
        .insert({
          referrer_user_id: user.id,
          referral_code: code,
        })
        .select()
        .single();

      if (error) throw error;

      setMyReferralCode(code);
      setReferrals(prev => [data as Referral, ...prev]);
      toast.success('Referral code generated!');
      return code;
    } catch (error) {
      console.error('Error generating referral code:', error);
      toast.error('Failed to generate referral code');
      return null;
    }
  };

  const sendReferralInvite = async (email: string) => {
    if (!user || !myReferralCode) {
      toast.error('Please generate a referral code first');
      return false;
    }

    try {
      const { error } = await supabase
        .from('referrals')
        .insert({
          referrer_user_id: user.id,
          referral_code: myReferralCode,
          referred_email: email,
        });

      if (error) throw error;

      await fetchReferrals();
      toast.success(`Referral invite sent to ${email}`);
      return true;
    } catch (error) {
      console.error('Error sending referral invite:', error);
      toast.error('Failed to send referral invite');
      return false;
    }
  };

  const getReferralStats = () => {
    const pending = referrals.filter(r => r.status === 'pending').length;
    const signedUp = referrals.filter(r => r.status === 'signed_up').length;
    const completed = referrals.filter(r => r.status === 'completed' || r.status === 'rewarded').length;
    const totalEarned = referrals
      .filter(r => r.status === 'rewarded')
      .reduce((acc, r) => acc + r.referrer_reward_points, 0);

    return { pending, signedUp, completed, totalEarned };
  };

  return {
    referrals,
    myReferralCode,
    loading,
    generateMyReferralCode,
    sendReferralInvite,
    getReferralStats,
    refetch: fetchReferrals,
  };
}
