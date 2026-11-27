import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useStaffRole } from "@/hooks/useStaffRole";
import { STAFF_ONLY_MODE, staffRedirect } from "@/lib/staffMode";

// Keeps signed-in admins in the admin area and boutiques in the vendor area
// (STAFF_ONLY_MODE). While a signed-in user's role is still loading nothing
// is shown, so staff never glimpse the storefront.
export function StaffOnlyGate({ children }: { children: ReactNode }) {
  const { role, loading } = useStaffRole();
  const location = useLocation();
  if (!STAFF_ONLY_MODE) return <>{children}</>;
  const spinner = (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
  if (loading) return spinner;
  const to = staffRedirect(role, location.pathname);
  if (!to) return <>{children}</>;
  // The spinner stays up while moving to the right area (no empty frame).
  return (
    <>
      <Navigate to={to} replace />
      {spinner}
    </>
  );
}
