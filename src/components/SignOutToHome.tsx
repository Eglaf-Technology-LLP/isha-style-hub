import { CommonActions, useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';
import { useSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// After signing out, wherever it happens (Profile, the consent screen, an
// expired session), the Home tab opens - as on the website (Live-Vendor
// src/components/auth/SignOutToHome.tsx, client corrections 15 Nov 2026,
// 2.1.2 b). The stack is replaced, so Back can't reopen a signed-in screen.
// A boutique / admin account that the app signs straight back out was never
// signed in here, so it stays on the sign-in screen with its message.
export function SignOutToHome() {
  const navigation = useNavigation();
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(event => {
      if (event !== 'SIGNED_OUT') return;
      if (useSession.getState().status !== 'signed-in') return;
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [
            { name: 'Tabs', state: { index: 0, routes: [{ name: 'Home' }] } },
          ],
        }),
      );
    });
    return () => subscription.unsubscribe();
  }, [navigation]);
  return null;
}
