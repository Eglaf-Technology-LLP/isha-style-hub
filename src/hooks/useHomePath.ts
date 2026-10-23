import { useStaffRole } from "./useStaffRole";

// "Home" for whoever is signed in: admins -> admin dashboard, boutiques ->
// vendor dashboard, shoppers and guests -> the store's landing page.
export function useHomePath(): string {
  const { role } = useStaffRole();
  return role === "admin" ? "/admin" : role === "vendor" ? "/vendor" : "/";
}
