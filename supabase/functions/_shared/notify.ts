import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Deep links for notifications: clicking one opens the exact page, tab and
// item it's about. The frontend reads ?tab= (and &sub= for nested tabs) and
// ?focus= (the item to open/highlight). Keep in sync with nlink() and
// vendor_payout_account_link() in the notification_deep_links migration.
export const links = {
  vendorOrder: (vendorOrderId: string) => `/vendor?tab=orders&focus=${vendorOrderId}`,
  vendorReturn: (returnRequestId: string) => `/vendor?tab=returns&focus=${returnRequestId}`,
  vendorPayout: (vendorOrderId?: string) => `/vendor?tab=payouts${vendorOrderId ? `&focus=${vendorOrderId}` : ""}`,
  vendorPayoutAccount: () => `/vendor?tab=payouts&focus=account`,
  adminOrder: (vendorOrderId: string) => `/admin?tab=orders&focus=${vendorOrderId}`,
  adminReturn: (returnRequestId: string) => `/admin?tab=returns&focus=${returnRequestId}`,
  adminPayouts: () => `/admin?tab=vendor-payouts`,
  adminVendor: () => `/admin?tab=vendors&sub=applications`,
  customerOrder: (orderId: string) => `/orders?focus=${orderId}`,
};

interface NotificationInput {
  type: string;
  title: string;
  body: string;
  link: string;
  category?: "order" | "other";
}

export async function notifyUsers(supabase: SupabaseClient, userIds: string[], n: NotificationInput) {
  if (!userIds.length) return;
  const { error } = await supabase.from("notifications").insert(
    userIds.map((user_id) => ({
      user_id,
      category: n.category ?? "order",
      type: n.type,
      title: n.title,
      body: n.body,
      link_url: n.link,
    })),
  );
  if (error) console.error("notifyUsers failed", n.type, error);
}

export async function notifyVendorMembers(supabase: SupabaseClient, vendorId: string, n: NotificationInput) {
  const { data } = await supabase.from("vendor_members").select("user_id").eq("vendor_id", vendorId);
  await notifyUsers(supabase, (data ?? []).map((m) => m.user_id), n);
}

export async function notifyAllAdmins(supabase: SupabaseClient, n: NotificationInput) {
  const { data } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  await notifyUsers(supabase, (data ?? []).map((a) => a.user_id), { category: "other", ...n });
}
