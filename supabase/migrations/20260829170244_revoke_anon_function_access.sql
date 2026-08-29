/*
  # Revoke anon EXECUTE on SECURITY DEFINER functions
  Supabase grants EXECUTE to anon by default privileges, so REVOKE ... FROM PUBLIC
  is not sufficient. These functions are never called by signed-out users.
*/
REVOKE EXECUTE ON FUNCTION public.respond_to_invitation(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_active_season(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_master_product_on_hand() FROM anon, authenticated;
