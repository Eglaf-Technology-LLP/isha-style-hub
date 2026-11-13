-- Super admin (client, 13 Nov 2026): an admin who also sees the screens
-- hidden for everyone else (src/lib/hiddenFeatures.ts, useShown). It is a
-- second role next to 'admin' - a super admin has both rows, so every admin
-- check and policy keeps working as it is. Changes no data.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Compared as text below: a new enum value can't be used in the same
-- transaction that adds it.
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'super_admin'
  )
$$;

-- Only a super admin may give or take away the super admin role (other
-- admins could otherwise grant it to themselves). Every other role is managed
-- exactly as before; reading roles is untouched.
CREATE POLICY "Only super admins grant super admin"
  ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (role::text <> 'super_admin' OR public.is_super_admin(auth.uid()));

CREATE POLICY "Only super admins change super admin"
  ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (role::text <> 'super_admin' OR public.is_super_admin(auth.uid()))
  WITH CHECK (role::text <> 'super_admin' OR public.is_super_admin(auth.uid()));

CREATE POLICY "Only super admins remove super admin"
  ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (role::text <> 'super_admin' OR public.is_super_admin(auth.uid()));
