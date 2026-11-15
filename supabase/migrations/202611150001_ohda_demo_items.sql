create table if not exists public.ohda_demo_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

alter table public.ohda_demo_items enable row level security;
revoke all on table public.ohda_demo_items from anon, authenticated;
grant insert on table public.ohda_demo_items to anon, authenticated;

drop policy if exists ohda_demo_items_anon_insert on public.ohda_demo_items;
create policy ohda_demo_items_anon_insert
  on public.ohda_demo_items
  for insert
  to anon
  with check (char_length(name) between 1 and 120);
