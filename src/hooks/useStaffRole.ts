import { useAuth } from "./useAuth";
import { useAdmin } from "./useAdmin";
import { useVendor } from "./useVendor";
import type { StaffRole } from "@/lib/staffMode";

// Who is signed in: an admin (wins if also a boutique member), a boutique
// member, a shopper, or nobody.
export function useStaffRole(): { role: StaffRole; loading: boolean } {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { vendor, loading: vendorLoading } = useVendor();
  if (authLoading) return { role: "guest", loading: true };
  if (!user) return { role: "guest", loading: false };
  if (adminLoading || vendorLoading) return { role: "customer", loading: true };
  return { role: isAdmin ? "admin" : vendor ? "vendor" : "customer", loading: false };
}
