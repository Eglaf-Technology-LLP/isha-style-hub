import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const addCategory = async (name: string, description?: string, imageFile?: File) => {
    try {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

      let image_url = null;

      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${slug}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('category-images')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('category-images')
          .getPublicUrl(fileName);

        image_url = publicUrl;
      }

      const { data, error } = await supabase
        .from('categories')
        .insert({
          name,
          slug,
          description: description || null,
          image_url,
        })
        .select()
        .single();

      if (error) throw error;

      setCategories([...categories, data]);
      toast.success('Category added successfully!');
      return data;
    } catch (error: any) {
      console.error('Error adding category:', error);
      if (error.code === '23505') {
        toast.error('A category with this name already exists');
      } else {
        toast.error('Failed to add category');
      }
      return null;
    }
  };

  const updateCategory = async (id: string, updates: Partial<Category>, imageFile?: File) => {
    try {
      let image_url = updates.image_url;

      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${updates.name?.toLowerCase().replace(/\s+/g, '-') || id}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('category-images')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('category-images')
          .getPublicUrl(fileName);

        image_url = publicUrl;
      }

      const { data, error } = await supabase
        .from('categories')
        .update({
          ...updates,
          image_url,
          slug: updates.name ? updates.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : undefined,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setCategories(categories.map(c => c.id === id ? data : c));
      toast.success('Category updated successfully!');
      return data;
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error('Failed to update category');
      return null;
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setCategories(categories.filter(c => c.id !== id));
      toast.success('Category deleted successfully!');
      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
      return false;
    }
  };

  return {
    categories,
    loading,
    addCategory,
    updateCategory,
    deleteCategory,
    refetch: fetchCategories,
  };
}
