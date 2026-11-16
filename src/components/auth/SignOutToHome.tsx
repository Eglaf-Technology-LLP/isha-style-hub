import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// After signing out, wherever it happens (header menu, account page, admin,
// warehouse, the consent screen, or another tab), the Home page opens
// (client corrections, 15 Nov 2026, 2.1.2 b). Replaces the history entry,
// so Back doesn't return to a signed-in page.
export function SignOutToHome() {
  const navigate = useNavigate();
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") navigate("/", { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);
  return null;
}
