import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type MembershipPlan = "monthly" | "annual";
export type MembershipStatus = "active" | "cancelled" | "expired";

export interface Membership {
  id: string;
  user_id: string;
  plan: MembershipPlan;
  status: MembershipStatus;
  started_at: string;
  expires_at: string;
  auto_renew: boolean;
  amount_paid: number;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export const MEMBERSHIP_PLANS: Record<MembershipPlan, { price: number; days: number; label: string }> = {
  monthly: { price: 199, days: 30, label: "Monthly" },
  annual: { price: 1499, days: 365, label: "Annual" },
};

export const INSIDER_BENEFITS = [
  "Free shipping on every order (no minimum)",
  "Extra 10% off on all orders",
  "2x loyalty points on every purchase",
  "Early access to sales & new launches",
  "Free returns and exchanges",
  "Priority customer support",
];

export function useMembership() {
  const { user } = useAuth();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchMembership = useCallback(async () => {
    if (!user) {
      setMembership(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("memberships")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) console.error("fetch membership", error);
    setMembership((data as Membership) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchMembership();
  }, [fetchMembership]);

  const subscribe = async (plan: MembershipPlan) => {
    if (!user) {
      toast.error("Please sign in to subscribe");
      return;
    }
    setActionLoading(true);
    const { price, days } = MEMBERSHIP_PLANS[plan];
    const expires = new Date();
    expires.setDate(expires.getDate() + days);
    const { error } = await supabase.from("memberships").insert({
      user_id: user.id,
      plan,
      status: "active",
      expires_at: expires.toISOString(),
      amount_paid: price,
      auto_renew: true,
    });
    setActionLoading(false);
    if (error) {
      toast.error("Could not start membership: " + error.message);
      return;
    }
    toast.success("Welcome to AllBoutiqs Insider! 🎉");
    await fetchMembership();
  };

  const cancel = async () => {
    if (!membership) return;
    setActionLoading(true);
    const { error } = await supabase
      .from("memberships")
      .update({ status: "cancelled", auto_renew: false, cancelled_at: new Date().toISOString() })
      .eq("id", membership.id);
    setActionLoading(false);
    if (error) {
      toast.error("Could not cancel: " + error.message);
      return;
    }
    toast.success("Membership cancelled. You'll keep benefits until expiry.");
    await fetchMembership();
  };

  const toggleAutoRenew = async () => {
    if (!membership) return;
    const { error } = await supabase
      .from("memberships")
      .update({ auto_renew: !membership.auto_renew })
      .eq("id", membership.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await fetchMembership();
  };

  const isActive = !!membership && new Date(membership.expires_at) > new Date();

  return { membership, isActive, loading, actionLoading, subscribe, cancel, toggleAutoRenew, refetch: fetchMembership };
}
