import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useNewsletter() {
  const [loading, setLoading] = useState(false);

  const subscribe = async (email: string, name?: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .insert({ email, name });

      if (error) {
        if (error.code === '23505') {
          toast.info('You are already subscribed!');
          return false;
        }
        throw error;
      }

      toast.success('Successfully subscribed to newsletter!');
      return true;
    } catch (error) {
      console.error('Error subscribing to newsletter:', error);
      toast.error('Failed to subscribe');
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    subscribe,
    loading,
  };
}
