revoke all on function public.create_ohda_profile() from public, anon, authenticated;
revoke all on function public.touch_ohda_updated_at() from public, anon, authenticated;
revoke all on function public.record_ohda_deal_status() from public, anon, authenticated;

revoke all on function public.is_ohda_admin() from public, anon;
grant execute on function public.is_ohda_admin() to authenticated;
