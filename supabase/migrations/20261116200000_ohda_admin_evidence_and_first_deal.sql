alter table public.deals
  add column if not exists dispute_evidence_paths text[] not null default '{}';

create or replace function private.ohda_first_deal_free()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.deals d
    where d.seller_id = new.created_by or d.buyer_id = new.created_by
  ) then
    new.fee_amount := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists ohda_first_deal_fee on public.deals;
create trigger ohda_first_deal_fee
  before insert on public.deals
  for each row execute function private.ohda_first_deal_free();

drop policy if exists ohda_dispute_evidence_update_buyer on public.deals;
create policy ohda_dispute_evidence_update_buyer on public.deals
  for update to authenticated
  using (buyer_id = (select auth.uid()) and status = 'disputed')
  with check (
    buyer_id = (select auth.uid())
    and status = 'disputed'
    and cardinality(coalesce(dispute_evidence_paths, '{}'::text[])) <= 5
    and not exists (
      select 1
      from unnest(coalesce(dispute_evidence_paths, '{}'::text[])) as path(value)
      where value !~ ('^' || (select auth.uid())::text || '/' || id::text || '/[^/]+$')
    )
  );
grant update (dispute_evidence_paths) on public.deals to authenticated;

drop policy if exists ohda_payouts_admin_insert on public.admin_payout_records;
create policy ohda_payouts_admin_insert on public.admin_payout_records
  for insert to authenticated
  with check (
    private.is_ohda_admin()
    and recorded_by = (select auth.uid())
    and exists (
      select 1
      from public.deals d
      where d.id = public.admin_payout_records.deal_id
        and d.status = 'completed'
        and d.seller_id = public.admin_payout_records.seller_id
        and public.admin_payout_records.gross_amount = d.amount
        and public.admin_payout_records.fee_amount = d.fee_amount
        and public.admin_payout_records.net_amount = greatest(d.amount - d.fee_amount, 0)
    )
  );
grant insert on public.admin_payout_records to authenticated;
