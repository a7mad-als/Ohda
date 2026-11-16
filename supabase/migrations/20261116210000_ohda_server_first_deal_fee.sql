create or replace function private.ohda_first_deal_free()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.fee_amount := case
    when new.category = 'سيارة' then 3.000
    when new.amount <= 50 then 0.250
    when new.amount <= 250 then 0.500
    when new.amount <= 1000 then 1.000
    when new.amount <= 5000 then 2.000
    else 3.000
  end;
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
