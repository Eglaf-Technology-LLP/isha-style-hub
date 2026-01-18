import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./useAuth";

export interface GiftCard {
  id: string;
  code: string;
  initial_balance: number;
  current_balance: number;
  purchaser_user_id: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  message: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GiftCardFormData {
  initial_balance: number;
  recipient_email?: string;
  recipient_name?: string;
  message?: string;
}

const generateGiftCardCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export function useGiftCards() {
  const [myGiftCards, setMyGiftCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchMyGiftCards();
    } else {
      setMyGiftCards([]);
      setLoading(false);
    }
  }, [user]);

  const fetchMyGiftCards = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('gift_cards')
        .select('*')
        .eq('purchaser_user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMyGiftCards(data || []);
    } catch (error) {
      console.error('Error fetching gift cards:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateGiftCard = async (code: string): Promise<GiftCard | null> => {
    try {
      const { data, error } = await supabase
        .from('gift_cards')
        .select('*')
        .eq('code', code.toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast.error('Invalid gift card code');
        return null;
      }

      if (data.current_balance <= 0) {
        toast.error('This gift card has no balance');
        return null;
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        toast.error('This gift card has expired');
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error validating gift card:', error);
      toast.error('Failed to validate gift card');
      return null;
    }
  };

  const checkBalance = async (code: string): Promise<number | null> => {
    const card = await validateGiftCard(code);
    return card ? card.current_balance : null;
  };

  return {
    myGiftCards,
    loading,
    validateGiftCard,
    checkBalance,
    generateGiftCardCode,
    refetch: fetchMyGiftCards,
  };
}
