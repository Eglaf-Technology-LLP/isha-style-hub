import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ReturnRequest {
  id: string;
  order_id: string;
  user_id: string;
  request_type: "return" | "exchange";
  status: "pending" | "approved" | "rejected" | "picked_up" | "completed" | "cancelled" | "pickup_failed";
  reason: string;
  additional_notes: string | null;
  items: ReturnItem[];
  exchange_details: ExchangeDetails | null;
  admin_notes: string | null;
  refund_amount: number;
  evidence_video_url: string | null;
  // Boutique-first workflow: "vendor" until the boutique decides or the
  // SLA passes (then escalated_at is set and it becomes "admin").
  handled_by: "vendor" | "admin";
  escalated_at: string | null;
  vendor_decision_at: string | null;
  vendor_notes: string | null;
  created_at: string;
  updated_at: string;
  // Computed client-side from order_items, not a DB column - which
  // vendor(s) this return's items belong to, for the admin vendor filter.
  vendorIds: string[];
  // Same computation, but the vendor_order_id(s) instead of vendor_id(s) -
  // what a full VendorOrderDetailsDialog-style view needs to fetch the
  // rest of the order (almost always exactly one, but a return can in
  // principle touch items from more than one vendor_order).
  vendorOrderIds: string[];
}

export interface ReturnItem {
  order_item_id: string;
  product_title: string;
  quantity: number;
  size?: string | null;
  color?: string | null;
  price?: number;
  // Required for every new submission (return or exchange) - proof the
  // tag is still attached. Optional in the type only so old rows
  // (submitted before this existed) don't fail to render.
  photo_url?: string;
  // All evidence photos for the item (photo_url mirrors the first, for
  // rows/readers from before multiple photos existed).
  photo_urls?: string[];
  // Per-item exchange target, replacing the old request-level
  // exchange_details.new_size/new_color - a request can hold items from
  // different products, which couldn't share one target meaningfully.
  exchange_to?: {
    size: string | null;
    color: string | null;
  };
}

export interface ExchangeDetails {
  // Legacy request-level target, superseded by ReturnItem.exchange_to -
  // kept only so old rows still display correctly.
  new_size?: string;
  new_color?: string;
  notes?: string;
}

export function useReturnRequests(isAdmin: boolean = false) {
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReturnRequests();
  }, [isAdmin]);

  const fetchReturnRequests = async () => {
    try {
      const { data, error } = await supabase
        .from("return_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const requests = (data || []) as unknown as ReturnRequest[];

      // return_requests.items is a JSON snapshot of order_item_ids, not a
      // live FK, so vendor attribution needs a separate lookup against the
      // relevant orders' order_items.
      const orderIds = [...new Set(requests.map((r) => r.order_id))];
      let vendorByOrderItemId = new Map<string, string | null>();
      let vendorOrderByOrderItemId = new Map<string, string | null>();
      if (orderIds.length > 0) {
        const { data: items } = await supabase
          .from("order_items")
          .select("id, vendor_id, vendor_order_id")
          .in("order_id", orderIds);
        vendorByOrderItemId = new Map((items || []).map((i) => [i.id, i.vendor_id]));
        vendorOrderByOrderItemId = new Map((items || []).map((i) => [i.id, i.vendor_order_id]));
      }

      setReturnRequests(
        requests.map((r) => ({
          ...r,
          vendorIds: [
            ...new Set(
              (r.items || [])
                .map((i) => vendorByOrderItemId.get(i.order_item_id))
                .filter((v): v is string => !!v)
            ),
          ],
          vendorOrderIds: [
            ...new Set(
              (r.items || [])
                .map((i) => vendorOrderByOrderItemId.get(i.order_item_id))
                .filter((v): v is string => !!v)
            ),
          ],
        }))
      );
    } catch (error) {
      console.error("Error fetching return requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const createReturnRequest = async (request: {
    order_id: string;
    request_type: "return" | "exchange";
    reason: string;
    additional_notes?: string;
    items: ReturnItem[];
    exchange_details?: ExchangeDetails;
    evidence_video_url?: string | null;
  }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to submit a return request");
        return false;
      }

      const { error } = await supabase
        .from("return_requests")
        .insert({
          ...request,
          user_id: session.user.id,
          items: request.items as unknown as any,
          exchange_details: request.exchange_details as unknown as any,
        });

      if (error) {
        if (error.message?.includes("Photo evidence is required")) {
          toast.error("Please add at least one photo for every selected item");
          return false;
        }
        throw error;
      }
      toast.success("Return request submitted successfully!");
      await fetchReturnRequests();
      return true;
    } catch (error) {
      console.error("Error creating return request:", error);
      toast.error("Failed to submit return request");
      return false;
    }
  };

  const updateReturnStatus = async (
    id: string,
    status: ReturnRequest["status"],
    adminNotes?: string,
    refundAmount?: number
  ) => {
    try {
      const updateData: Record<string, any> = { status };
      if (adminNotes !== undefined) updateData.admin_notes = adminNotes;
      if (refundAmount !== undefined) updateData.refund_amount = refundAmount;

      const { error } = await supabase
        .from("return_requests")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      setReturnRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updateData } : r))
      );
      toast.success("Return request updated!");
      return true;
    } catch (error) {
      console.error("Error updating return request:", error);
      toast.error("Failed to update return request");
      return false;
    }
  };

  const vendorRespond = async (id: string, decision: "approved" | "rejected", note: string) => {
    const { data, error } = await supabase.rpc("vendor_respond_to_return", {
      _request_id: id,
      _decision: decision,
      _note: note,
    });
    if (error) {
      toast.error(error.message || "Couldn't save your response");
      return null;
    }
    const updated = data as unknown as Partial<ReturnRequest>;
    setReturnRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    toast.success(decision === "approved" ? "Request accepted" : "Request rejected");
    return updated;
  };

  const cancelReturnRequest = async (id: string) => {
    try {
      const { error } = await supabase
        .from("return_requests")
        .update({ status: "cancelled" })
        .eq("id", id);

      if (error) throw error;

      setReturnRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "cancelled" as const } : r))
      );
      toast.success("Return request cancelled");
      return true;
    } catch (error) {
      console.error("Error cancelling return request:", error);
      toast.error("Failed to cancel return request");
      return false;
    }
  };

  return {
    returnRequests,
    loading,
    createReturnRequest,
    updateReturnStatus,
    vendorRespond,
    cancelReturnRequest,
    refetch: fetchReturnRequests,
  };
}

export function returnItemPhotos(item: ReturnItem): string[] {
  if (item.photo_urls?.length) return item.photo_urls;
  return item.photo_url ? [item.photo_url] : [];
}
