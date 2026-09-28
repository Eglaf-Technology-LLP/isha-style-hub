import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  payment_method: string;
  payment_status: "pending" | "paid" | "failed" | "refunded" | "partially_refunded";
  transaction_id: string | null;
  refund_amount: number;
  refund_reason: string | null;
  gateway_fee: number | null;
  gateway_tax: number | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  order?: {
    id: string;
    customer_name: string;
    customer_email: string;
    total: number;
    order_status: string;
    order_items?: { vendor_id: string | null; vendor_order_id: string | null }[];
  };
  // Every distinct vendor_order_id this payment's order touches - almost
  // always one, but a multi-vendor checkout is one payment covering
  // several vendor_orders. Used to link to the full order/shipment
  // breakdown per vendor_order, same as the Cancelled/Returns lists.
  vendorOrderIds: string[];
}

export interface PaymentFormData {
  order_id: string;
  amount: number;
  payment_method: string;
  transaction_id?: string;
}

export function usePayments(isAdmin: boolean = false) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      fetchPayments();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  const fetchPayments = async () => {
    try {
      const { data, error } = await supabase
        .from("payments")
        .select(`
          *,
          order:orders(id, customer_name, customer_email, total, order_status, order_items(vendor_id, vendor_order_id))
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const typedPayments: Payment[] = (data || []).map(p => {
        const order = Array.isArray(p.order) ? p.order[0] : p.order;
        return {
          ...p,
          payment_status: p.payment_status as Payment["payment_status"],
          metadata: (p.metadata as Record<string, any>) || {},
          order,
          vendorOrderIds: [
            ...new Set((order?.order_items ?? []).map((i) => i.vendor_order_id).filter((v): v is string => !!v)),
          ],
        };
      });

      setPayments(typedPayments);
    } catch (error: any) {
      console.error("Error fetching payments:", error);
      toast.error("Failed to fetch payments");
    } finally {
      setLoading(false);
    }
  };

  const createPayment = async (paymentData: PaymentFormData): Promise<Payment | null> => {
    try {
      const { data, error } = await supabase
        .from("payments")
        .insert({
          order_id: paymentData.order_id,
          amount: paymentData.amount,
          payment_method: paymentData.payment_method,
          payment_status: "pending",
          transaction_id: paymentData.transaction_id || null,
        })
        .select(`
          *,
          order:orders(id, customer_name, customer_email, total, order_status)
        `)
        .single();

      if (error) throw error;

      const newPayment: Payment = {
        ...data,
        payment_status: data.payment_status as Payment["payment_status"],
        metadata: (data.metadata as Record<string, any>) || {},
        order: Array.isArray(data.order) ? data.order[0] : data.order,
      };

      setPayments((prev) => [newPayment, ...prev]);
      toast.success("Payment recorded");
      return newPayment;
    } catch (error: any) {
      console.error("Error creating payment:", error);
      toast.error(error.message || "Failed to record payment");
      return null;
    }
  };

  const markPaymentComplete = async (
    id: string,
    transactionId?: string
  ): Promise<boolean> => {
    try {
      const updateData: any = {
        payment_status: "paid",
      };
      
      if (transactionId) {
        updateData.transaction_id = transactionId;
      }

      const { error } = await supabase
        .from("payments")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      // Also update the order payment status
      const payment = payments.find(p => p.id === id);
      if (payment) {
        await supabase
          .from("orders")
          .update({ payment_status: "paid" })
          .eq("id", payment.order_id);
      }

      await fetchPayments();
      toast.success("Payment marked as completed");
      return true;
    } catch (error: any) {
      console.error("Error completing payment:", error);
      toast.error(error.message || "Failed to update payment");
      return false;
    }
  };

  const markPaymentFailed = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("payments")
        .update({ payment_status: "failed" })
        .eq("id", id);

      if (error) throw error;

      // Also update the order payment status
      const payment = payments.find(p => p.id === id);
      if (payment) {
        await supabase
          .from("orders")
          .update({ payment_status: "failed" })
          .eq("id", payment.order_id);
      }

      await fetchPayments();
      toast.success("Payment marked as failed");
      return true;
    } catch (error: any) {
      console.error("Error marking payment failed:", error);
      toast.error(error.message || "Failed to update payment");
      return false;
    }
  };

  // Calls the real Razorpay refund API via create-razorpay-refund - this
  // used to only write payments.refund_amount/orders.payment_status
  // directly, which recorded a refund locally without ever actually
  // returning money to the customer. Real refund attempts (success or
  // failure) now live in the `refunds` table (see useRefunds below).
  const processRefund = async (
    id: string,
    refundAmount: number,
    reason: string
  ): Promise<boolean> => {
    const payment = payments.find(p => p.id === id);
    if (!payment) {
      toast.error("Payment not found");
      return false;
    }

    const { errorMessage } = await invokeEdgeFunction("create-razorpay-refund", {
      order_id: payment.order_id,
      amount: refundAmount,
      reason,
    });

    if (errorMessage) {
      toast.error(errorMessage);
      return false;
    }

    await fetchPayments();
    toast.success(`₹${refundAmount} refund submitted to Razorpay`);
    return true;
  };

  const getPaymentsByOrder = (orderId: string): Payment[] => {
    return payments.filter(p => p.order_id === orderId);
  };

  const getPaymentStats = () => {
    const stats = {
      totalReceived: 0,
      totalPending: 0,
      totalRefunded: 0,
      totalGatewayFees: 0,
      completedCount: 0,
      pendingCount: 0,
      refundedCount: 0,
    };

    payments.forEach(payment => {
      if (payment.payment_status === "paid") {
        stats.totalReceived += payment.amount - payment.refund_amount;
        stats.completedCount++;
        stats.totalGatewayFees += payment.gateway_fee || 0;
      } else if (payment.payment_status === "pending") {
        stats.totalPending += payment.amount;
        stats.pendingCount++;
      }

      if (payment.refund_amount > 0) {
        stats.totalRefunded += payment.refund_amount;
        if (payment.payment_status === "refunded" || payment.payment_status === "partially_refunded") {
          stats.refundedCount++;
        }
      }
    });

    return stats;
  };

  return {
    payments,
    loading,
    createPayment,
    markPaymentComplete,
    markPaymentFailed,
    processRefund,
    getPaymentsByOrder,
    getPaymentStats,
    refetch: fetchPayments,
  };
}
