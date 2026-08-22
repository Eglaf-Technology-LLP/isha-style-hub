import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string;
  vendor_id: string | null;
  product_title: string;
  variant_title: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  price: number;
}

interface ShippingAddress {
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface Order {
  id: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: ShippingAddress;
  payment_method: 'cod' | 'stripe' | 'razorpay';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  order_status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  subtotal: number;
  shipping_cost: number;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
}

export function useOrders(isAdmin: boolean = false) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, [isAdmin]);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders((data || []) as unknown as Order[]);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, status: Order['order_status']) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ order_status: status })
        .eq('id', orderId);

      if (error) throw error;

      setOrders(orders.map(o => 
        o.id === orderId ? { ...o, order_status: status } : o
      ));
      toast.success('Order status updated!');
      return true;
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
      return false;
    }
  };

  const updatePaymentStatus = async (orderId: string, status: Order['payment_status']) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ payment_status: status })
        .eq('id', orderId);

      if (error) throw error;

      setOrders(orders.map(o => 
        o.id === orderId ? { ...o, payment_status: status } : o
      ));
      toast.success('Payment status updated!');
      return true;
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast.error('Failed to update payment status');
      return false;
    }
  };

  return {
    orders,
    loading,
    updateOrderStatus,
    updatePaymentStatus,
    refetch: fetchOrders,
  };
}
