import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";

export interface SizeGuide {
  id: string;
  category_id: string | null;
  name: string;
  sizes: string[];
  measurements: {
    name: string;
    values: Record<string, string>;
  }[];
  created_at: string;
  updated_at: string;
}

interface RawSizeGuide {
  id: string;
  category_id: string | null;
  name: string;
  sizes: Json;
  measurements: Json;
  created_at: string;
  updated_at: string;
}

export function useSizeGuides(categoryId?: string) {
  const [sizeGuides, setSizeGuides] = useState<SizeGuide[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSizeGuides();
  }, [categoryId]);

  const fetchSizeGuides = async () => {
    try {
      let query = supabase.from('size_guides').select('*');
      
      if (categoryId) {
        query = query.or(`category_id.eq.${categoryId},category_id.is.null`);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      
      const parsed = (data || []).map((guide: RawSizeGuide) => ({
        ...guide,
        sizes: Array.isArray(guide.sizes) ? guide.sizes as string[] : [],
        measurements: Array.isArray(guide.measurements) 
          ? guide.measurements as SizeGuide['measurements']
          : [],
      }));
      
      setSizeGuides(parsed);
    } catch (error) {
      console.error('Error fetching size guides:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    sizeGuides,
    loading,
    refetch: fetchSizeGuides,
  };
}
