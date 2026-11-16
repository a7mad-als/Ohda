create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  phone text,
  iban text,
  country text not null default 'الكويت',
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_iban_format check (
    iban is null or iban = '' or (
      country = 'الكويت'
      and iban ~ '^KW[0-9A-Z]{28}$'
      and char_length(iban) = 30
    )
  )
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  created_by uuid not null references public.profiles(id),
  seller_id uuid references public.profiles(id),
  buyer_id uuid references public.profiles(id),
  item_name text not null check (char_length(item_name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 3000),
  category text not null check (category in ('جوال', 'إلكترونيات', 'ساعة', 'أثاث', 'سيارة', 'أخرى')),
  amount numeric(12, 3) not null check (amount > 0 and amount <= 1000000),
  currency text not null default 'KWD' check (currency = 'KWD'),
  fee_amount numeric(9, 3) not null default 0 check (fee_amount >= 0),
  fee_payer text not null check (fee_payer in ('buyer', 'seller', 'split')),
  inspection_hours smallint not null check (inspection_hours in (24, 48, 72)),
  delivery_method text not null check (delivery_method in ('in_person', 'delivery')),
  delivery_carrier text,
  tracking_number text,
  delivery_photo_path text,
  photo_paths text[] not null default '{}',
  status text not null default 'awaiting_acceptance'
    check (status in (
      'awaiting_acceptance', 'awaiting_payment', 'payment_pending', 'funded',
      'shipped', 'delivered', 'inspection', 'disputed', 'capture_pending',
      'completed', 'cancelled', 'refunded'
    )),
  inspection_started_at timestamptz,
  inspection_deadline timestamptz,
  dispute_reason text,
  live_seller_approved boolean not null default false,
  live_buyer_approved boolean not null default false,
  payment_provider text check (payment_provider in ('tap', 'stripe')),
  payment_reference text,
  payment_state text not null default 'unpaid'
    check (payment_state in ('unpaid', 'pending', 'authorized', 'captured', 'voided', 'refunded', 'failed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_distinct_parties check (seller_id is null or buyer_id is null or seller_id <> buyer_id),
  constraint deals_photo_limit check (cardinality(photo_paths) <= 5),
  constraint deals_creator_is_party check (created_by = seller_id or created_by = buyer_id)
);

create index if not exists deals_seller_created_idx on public.deals (seller_id, created_at desc);
create index if not exists deals_buyer_created_idx on public.deals (buyer_id, created_at desc);
create index if not exists deals_status_deadline_idx on public.deals (status, inspection_deadline);
create index if not exists deals_code_idx on public.deals (code);

create table if not exists public.deal_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null check (char_length(event_type) between 1 and 80),
  old_status text,
  new_status text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists deal_events_timeline_idx on public.deal_events (deal_id, created_at);

create table if not exists public.deal_messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists deal_messages_timeline_idx on public.deal_messages (deal_id, created_at);

create table if not exists public.deal_ratings (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  recipient_id uuid not null references public.profiles(id),
  stars smallint not null check (stars between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (deal_id, author_id),
  check (author_id <> recipient_id)
);

create table if not exists public.deal_payments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  provider text not null check (provider in ('tap', 'stripe')),
  provider_reference text not null unique,
  amount numeric(12, 3) not null check (amount > 0),
  currency text not null check (currency in ('KWD', 'USD')),
  state text not null default 'pending'
    check (state in ('pending', 'authorized', 'captured', 'voided', 'refunded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_payout_records (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null unique references public.deals(id),
  seller_id uuid not null references public.profiles(id),
  gross_amount numeric(12, 3) not null check (gross_amount >= 0),
  fee_amount numeric(9, 3) not null check (fee_amount >= 0),
  net_amount numeric(12, 3) not null check (net_amount >= 0),
  note text not null default '' check (char_length(note) <= 1000),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.waitlist_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null check (feature in (
    'hawiyati_verification', 'smart_assistant', 'calendar_reminder',
    'sahel_transfer', 'certified_inspection', 'courier_tracking'
  )),
  created_at timestamptz not null default now(),
  unique (user_id, feature)
);

create or replace function public.is_ohda_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

create or replace function public.create_ohda_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, country)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'country', 'الكويت')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ohda_auth_user_profile on auth.users;
create trigger ohda_auth_user_profile
  after insert on auth.users
  for each row execute function public.create_ohda_profile();

create or replace function public.touch_ohda_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_ohda_updated_at();

drop trigger if exists deals_touch_updated_at on public.deals;
create trigger deals_touch_updated_at
  before update on public.deals
  for each row execute function public.touch_ohda_updated_at();

drop trigger if exists deal_payments_touch_updated_at on public.deal_payments;
create trigger deal_payments_touch_updated_at
  before update on public.deal_payments
  for each row execute function public.touch_ohda_updated_at();

create or replace function public.record_ohda_deal_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    insert into public.deal_events (deal_id, actor_id, event_type, old_status, new_status)
    values (new.id, (select auth.uid()), 'status_changed', old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists deals_record_status on public.deals;
create trigger deals_record_status
  after update of status on public.deals
  for each row execute function public.record_ohda_deal_status();

alter table public.profiles enable row level security;
alter table public.deals enable row level security;
alter table public.deal_events enable row level security;
alter table public.deal_messages enable row level security;
alter table public.deal_ratings enable row level security;
alter table public.deal_payments enable row level security;
alter table public.admin_payout_records enable row level security;
alter table public.waitlist_interests enable row level security;

drop policy if exists ohda_profiles_read on public.profiles;
create policy ohda_profiles_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_ohda_admin());

drop policy if exists ohda_profiles_insert_self on public.profiles;
create policy ohda_profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and role = 'user');

drop policy if exists ohda_profiles_update_self on public.profiles;
create policy ohda_profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_ohda_admin())
  with check (id = (select auth.uid()) or public.is_ohda_admin());

drop policy if exists ohda_deals_read_participant on public.deals;
create policy ohda_deals_read_participant on public.deals
  for select to authenticated
  using (seller_id = (select auth.uid()) or buyer_id = (select auth.uid()) or public.is_ohda_admin());

drop policy if exists ohda_events_read_participant on public.deal_events;
create policy ohda_events_read_participant on public.deal_events
  for select to authenticated
  using (
    public.is_ohda_admin()
    or exists (
      select 1 from public.deals d
      where d.id = deal_id
        and (d.seller_id = (select auth.uid()) or d.buyer_id = (select auth.uid()))
    )
  );

drop policy if exists ohda_messages_read_participant on public.deal_messages;
create policy ohda_messages_read_participant on public.deal_messages
  for select to authenticated
  using (
    public.is_ohda_admin()
    or exists (
      select 1 from public.deals d
      where d.id = deal_id
        and (d.seller_id = (select auth.uid()) or d.buyer_id = (select auth.uid()))
    )
  );

drop policy if exists ohda_messages_insert_participant on public.deal_messages;
create policy ohda_messages_insert_participant on public.deal_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.deals d
      where d.id = deal_id
        and (d.seller_id = (select auth.uid()) or d.buyer_id = (select auth.uid()))
    )
  );

drop policy if exists ohda_ratings_read_participant on public.deal_ratings;
create policy ohda_ratings_read_participant on public.deal_ratings
  for select to authenticated
  using (author_id = (select auth.uid()) or recipient_id = (select auth.uid()) or public.is_ohda_admin());

drop policy if exists ohda_ratings_insert_author on public.deal_ratings;
create policy ohda_ratings_insert_author on public.deal_ratings
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.deals d
      where d.id = deal_id
        and d.status = 'completed'
        and (
          (d.seller_id = (select auth.uid()) and d.buyer_id = recipient_id)
          or (d.buyer_id = (select auth.uid()) and d.seller_id = recipient_id)
        )
    )
  );

drop policy if exists ohda_payments_read_participant on public.deal_payments;
create policy ohda_payments_read_participant on public.deal_payments
  for select to authenticated
  using (
    public.is_ohda_admin()
    or exists (
      select 1 from public.deals d
      where d.id = deal_id
        and (d.seller_id = (select auth.uid()) or d.buyer_id = (select auth.uid()))
    )
  );

drop policy if exists ohda_payouts_admin_read on public.admin_payout_records;
create policy ohda_payouts_admin_read on public.admin_payout_records
  for select to authenticated
  using (public.is_ohda_admin());

drop policy if exists ohda_waitlist_insert_self on public.waitlist_interests;
create policy ohda_waitlist_insert_self on public.waitlist_interests
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists ohda_waitlist_read_self_or_admin on public.waitlist_interests;
create policy ohda_waitlist_read_self_or_admin on public.waitlist_interests
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_ohda_admin());

revoke all on public.profiles, public.deals, public.deal_events,
  public.deal_messages, public.deal_ratings, public.deal_payments,
  public.admin_payout_records, public.waitlist_interests from anon, authenticated;

grant select, insert on public.profiles to authenticated;
grant update (display_name, phone, iban, country) on public.profiles to authenticated;
grant select on public.deals, public.deal_events, public.deal_payments to authenticated;
grant select, insert on public.deal_messages, public.deal_ratings to authenticated;
grant select, insert on public.waitlist_interests to authenticated;
grant select on public.admin_payout_records to authenticated;
grant execute on function public.is_ohda_admin() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ohda-deal-photos',
  'ohda-deal-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists ohda_deal_photos_read_participant on storage.objects;
create policy ohda_deal_photos_read_participant on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ohda-deal-photos'
    and exists (
      select 1 from public.deals d
      where d.id::text = (storage.foldername(name))[2]
        and (d.seller_id = (select auth.uid()) or d.buyer_id = (select auth.uid()) or public.is_ohda_admin())
    )
  );

drop policy if exists ohda_deal_photos_insert_participant on storage.objects;
create policy ohda_deal_photos_insert_participant on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ohda-deal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.deals d
      where d.id::text = (storage.foldername(name))[2]
        and (d.seller_id = (select auth.uid()) or d.buyer_id = (select auth.uid()))
    )
  );

drop policy if exists ohda_deal_photos_delete_owner on storage.objects;
create policy ohda_deal_photos_delete_owner on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ohda-deal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
