REVOKE EXECUTE ON FUNCTION public.is_vendor_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_vendor_member(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_vendor_member(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_vendor_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_vendor_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_vendor_id(uuid) FROM authenticated;