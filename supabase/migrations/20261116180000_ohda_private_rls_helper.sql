create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

alter function public.is_ohda_admin() set schema private;

revoke all on function private.is_ohda_admin() from public, anon;
grant execute on function private.is_ohda_admin() to authenticated;
