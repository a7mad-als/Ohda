create or replace function public.ohda_api(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_deal public.deals%rowtype;
  v_role text;
  v_code text;
  v_amount numeric(12, 3);
  v_fee numeric(9, 3);
  v_provider text;
  v_reference text;
  v_reason text;
  v_old_status text;
  v_admin boolean := false;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول أولاً.';
  end if;

  if p_action = 'create' then
    v_role := p_payload ->> 'role';
    v_amount := (p_payload ->> 'amount')::numeric;
    if v_role not in ('seller', 'buyer') then raise exception 'اختر دورك في الصفقة.'; end if;
    if v_amount <= 0 or v_amount > 1000000 then raise exception 'المبلغ غير صحيح.'; end if;
    if char_length(coalesce(p_payload ->> 'item_name', '')) not between 1 and 120 then
      raise exception 'اسم الغرض غير صحيح.';
    end if;
    if jsonb_typeof(coalesce(p_payload -> 'photo_paths', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_payload -> 'photo_paths', '[]'::jsonb)) > 5 then
      raise exception 'الحد الأعلى خمس صور.';
    end if;
    v_fee := case
      when p_payload ->> 'category' = 'سيارة' then 3.000
      when v_amount <= 50 then 0.250
      when v_amount <= 250 then 0.500
      when v_amount <= 1000 then 1.000
      when v_amount <= 5000 then 2.000
      else 3.000
    end;
    if not exists (
      select 1 from public.deals d
      where (d.seller_id = v_uid or d.buyer_id = v_uid) and d.completed_at is not null
    ) then
      v_fee := 0;
    end if;
    if p_payload ->> 'fee_payer' not in ('buyer', 'seller', 'split') then
      raise exception 'طريقة دفع العمولة غير صحيحة.';
    end if;
    loop
      v_code := upper(encode(extensions.gen_random_bytes(3), 'hex'));
      exit when not exists (select 1 from public.deals d where d.code = v_code);
    end loop;
    insert into public.deals (
      code, created_by, seller_id, buyer_id, item_name, description, category,
      amount, fee_amount, fee_payer, inspection_hours, delivery_method, photo_paths
    ) values (
      v_code, v_uid,
      case when v_role = 'seller' then v_uid else null end,
      case when v_role = 'buyer' then v_uid else null end,
      btrim(p_payload ->> 'item_name'),
      coalesce(p_payload ->> 'description', ''),
      p_payload ->> 'category',
      v_amount,
      v_fee,
      p_payload ->> 'fee_payer',
      (p_payload ->> 'inspection_hours')::smallint,
      p_payload ->> 'delivery_method',
      coalesce(array(select jsonb_array_elements_text(coalesce(p_payload -> 'photo_paths', '[]'::jsonb))), '{}')
    ) returning * into v_deal;
    insert into public.deal_events (deal_id, actor_id, event_type, new_status)
    values (v_deal.id, v_uid, 'deal_created', v_deal.status);
    return to_jsonb(v_deal);

  elsif p_action = 'join' then
    select * into v_deal
    from public.deals d
    where d.code = upper(btrim(p_payload ->> 'code'))
      and d.status = 'awaiting_acceptance'
    for update;
    if not found or (v_deal.seller_id is not null and v_deal.buyer_id is not null)
       or v_deal.created_by = v_uid then
      raise exception 'رابط الدعوة غير متاح أو لا يمكن استخدامه بهذا الحساب.';
    end if;
    if v_deal.seller_id is null then
      update public.deals set seller_id = v_uid where id = v_deal.id returning * into v_deal;
    elsif v_deal.buyer_id is null then
      update public.deals set buyer_id = v_uid where id = v_deal.id returning * into v_deal;
    else
      raise exception 'اكتمل طرفا الصفقة.';
    end if;
    insert into public.deal_events (deal_id, actor_id, event_type, details)
    values (v_deal.id, v_uid, 'party_joined', jsonb_build_object('role', case when v_deal.seller_id = v_uid then 'seller' else 'buyer' end));
    return to_jsonb(v_deal);

  elsif p_action = 'attach_photos' then
    if jsonb_typeof(coalesce(p_payload -> 'photo_paths', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_payload -> 'photo_paths', '[]'::jsonb)) > 5 then
      raise exception 'الحد الأعلى خمس صور.';
    end if;
    update public.deals set
      photo_paths = array(select jsonb_array_elements_text(coalesce(p_payload -> 'photo_paths', '[]'::jsonb)))
    where id = (p_payload ->> 'deal_id')::uuid
      and created_by = v_uid and status = 'awaiting_acceptance'
    returning * into v_deal;
    if not found then raise exception 'لا يمكن تعديل صور الصفقة الآن.'; end if;
    return to_jsonb(v_deal);

  elsif p_action = 'accept' then
    select * into v_deal from public.deals where id = (p_payload ->> 'deal_id')::uuid for update;
    if not found or v_deal.status <> 'awaiting_acceptance'
       or v_deal.created_by = v_uid
       or (v_deal.seller_id <> v_uid and v_deal.buyer_id <> v_uid) then
      raise exception 'لا يمكن قبول شروط هذه الصفقة.';
    end if;
    update public.deals set status = 'awaiting_payment' where id = v_deal.id returning * into v_deal;
    return to_jsonb(v_deal);

  elsif p_action = 'payment_pending' then
    update public.deals set status = 'payment_pending', payment_state = 'pending'
    where id = (p_payload ->> 'deal_id')::uuid
      and buyer_id = v_uid and status = 'awaiting_payment'
    returning * into v_deal;
    if not found then raise exception 'الصفقة غير جاهزة للدفع.'; end if;
    return to_jsonb(v_deal);

  elsif p_action = 'funded' then
    v_provider := p_payload ->> 'provider';
    v_reference := p_payload ->> 'reference';
    if v_provider not in ('tap', 'stripe') or coalesce(v_reference, '') = '' then
      raise exception 'بيانات الدفع غير مكتملة.';
    end if;
    update public.deals set
      status = 'funded',
      payment_state = 'authorized',
      payment_provider = v_provider,
      payment_reference = v_reference
    where id = (p_payload ->> 'deal_id')::uuid
      and buyer_id = v_uid and status = 'payment_pending'
    returning * into v_deal;
    if not found then raise exception 'تعذر ربط الحجز بالصفقة.'; end if;
    insert into public.deal_payments (deal_id, provider, provider_reference, amount, currency, state)
    values (v_deal.id, v_provider, v_reference, v_deal.amount, 'KWD', 'authorized')
    on conflict (provider_reference) do nothing;
    return to_jsonb(v_deal);

  elsif p_action = 'ship' then
    update public.deals set
      status = 'shipped',
      delivery_carrier = nullif(btrim(p_payload ->> 'carrier'), ''),
      tracking_number = nullif(btrim(p_payload ->> 'tracking_number'), ''),
      delivery_photo_path = nullif(p_payload ->> 'photo_path', '')
    where id = (p_payload ->> 'deal_id')::uuid
      and seller_id = v_uid and delivery_method = 'delivery' and status = 'funded'
    returning * into v_deal;
    if not found then raise exception 'لا يمكن تسجيل الشحن الآن.'; end if;
    return to_jsonb(v_deal);

  elsif p_action = 'deliver_in_person' then
    update public.deals set
      status = 'inspection',
      inspection_started_at = now(),
      inspection_deadline = now() + make_interval(hours => inspection_hours)
    where id = (p_payload ->> 'deal_id')::uuid
      and seller_id = v_uid and delivery_method = 'in_person' and status = 'funded'
    returning * into v_deal;
    if not found then raise exception 'لا يمكن تسجيل التسليم الحضوري الآن.'; end if;
    return to_jsonb(v_deal);

  elsif p_action = 'received' then
    update public.deals set
      status = 'inspection',
      inspection_started_at = now(),
      inspection_deadline = now() + make_interval(hours => inspection_hours)
    where id = (p_payload ->> 'deal_id')::uuid
      and buyer_id = v_uid and delivery_method = 'delivery' and status = 'shipped'
    returning * into v_deal;
    if not found then raise exception 'الصفقة ليست بانتظار تأكيد الوصول.'; end if;
    return to_jsonb(v_deal);

  elsif p_action = 'dispute' then
    v_reason := btrim(coalesce(p_payload ->> 'reason', ''));
    if char_length(v_reason) < 5 or char_length(v_reason) > 1000 then
      raise exception 'اكتب سبب المشكلة (من 5 إلى 1000 حرف).';
    end if;
    update public.deals set status = 'disputed', dispute_reason = v_reason
    where id = (p_payload ->> 'deal_id')::uuid
      and buyer_id = v_uid and status = 'inspection'
    returning * into v_deal;
    if not found then raise exception 'لا يمكن فتح نزاع على هذه الصفقة.'; end if;
    return to_jsonb(v_deal);

  elsif p_action = 'void_payment' then
    update public.deals set payment_state = 'voided'
    where id = (p_payload ->> 'deal_id')::uuid
      and (seller_id = v_uid or buyer_id = v_uid)
      and status in ('payment_pending', 'funded')
      and payment_state in ('pending', 'authorized')
    returning * into v_deal;
    if not found then raise exception 'لا يوجد حجز قابل للإبطال.'; end if;
    update public.deal_payments set state = 'voided'
    where deal_id = v_deal.id and state in ('pending', 'authorized');
    return to_jsonb(v_deal);

  elsif p_action = 'cancel' then
    update public.deals set status = 'cancelled', payment_state = case when payment_state = 'unpaid' then 'unpaid' else 'voided' end
    where id = (p_payload ->> 'deal_id')::uuid
      and (seller_id = v_uid or buyer_id = v_uid)
      and status in ('awaiting_acceptance', 'awaiting_payment', 'payment_pending', 'funded')
      and payment_state in ('unpaid', 'voided')
    returning * into v_deal;
    if not found then raise exception 'لا يمكن إلغاء الصفقة قبل إبطال الحجز التجريبي.'; end if;
    return to_jsonb(v_deal);

  elsif p_action = 'complete' then
    update public.deals set status = 'completed', payment_state = 'captured', completed_at = now()
    where id = (p_payload ->> 'deal_id')::uuid
      and buyer_id = v_uid and status = 'inspection'
    returning * into v_deal;
    if not found then raise exception 'الصفقة غير جاهزة للإتمام.'; end if;
    update public.deal_payments set state = 'captured'
    where deal_id = v_deal.id and state = 'authorized';
    return to_jsonb(v_deal);

  elsif p_action = 'expire' then
    update public.deals set status = 'completed', payment_state = 'captured', completed_at = now()
    where id = (p_payload ->> 'deal_id')::uuid
      and (seller_id = v_uid or buyer_id = v_uid)
      and status = 'inspection' and inspection_deadline <= now()
    returning * into v_deal;
    if not found then raise exception 'لم تنتهِ مدة الفحص بعد.'; end if;
    update public.deal_payments set state = 'captured'
    where deal_id = v_deal.id and state = 'authorized';
    return to_jsonb(v_deal);

  elsif p_action = 'live_approve' then
    select * into v_deal from public.deals where id = (p_payload ->> 'deal_id')::uuid for update;
    if not found or v_deal.delivery_method <> 'in_person' or v_deal.status <> 'funded'
       or (v_deal.seller_id <> v_uid and v_deal.buyer_id <> v_uid) then
      raise exception 'الموافقة المباشرة غير متاحة لهذه الصفقة.';
    end if;
    update public.deals set
      live_seller_approved = live_seller_approved or seller_id = v_uid,
      live_buyer_approved = live_buyer_approved or buyer_id = v_uid
    where id = v_deal.id returning * into v_deal;
    return to_jsonb(v_deal);

  elsif p_action = 'live_complete' then
    update public.deals set status = 'completed', payment_state = 'captured', completed_at = now()
    where id = (p_payload ->> 'deal_id')::uuid
      and (seller_id = v_uid or buyer_id = v_uid)
      and delivery_method = 'in_person' and status = 'funded'
      and live_seller_approved and live_buyer_approved
    returning * into v_deal;
    if not found then raise exception 'لم يوافق الطرفان على الصفقة بعد.'; end if;
    update public.deal_payments set state = 'captured' where deal_id = v_deal.id and state = 'authorized';
    return to_jsonb(v_deal);

  elsif p_action in ('resolve_buyer', 'resolve_seller') then
    v_admin := private.is_ohda_admin();
    if not v_admin then raise exception 'هذه العملية للمشرف فقط.'; end if;
    select * into v_deal from public.deals where id = (p_payload ->> 'deal_id')::uuid for update;
    if not found or v_deal.status <> 'disputed' then raise exception 'لا يوجد نزاع مفتوح.'; end if;
    v_old_status := v_deal.status;
    if p_action = 'resolve_buyer' then
      update public.deals set status = 'refunded', payment_state = 'refunded'
      where id = v_deal.id returning * into v_deal;
      update public.deal_payments set state = 'refunded' where deal_id = v_deal.id and state = 'authorized';
    else
      update public.deals set status = 'completed', payment_state = 'captured', completed_at = now()
      where id = v_deal.id returning * into v_deal;
      update public.deal_payments set state = 'captured' where deal_id = v_deal.id and state = 'authorized';
    end if;
    insert into public.deal_events (deal_id, actor_id, event_type, old_status, new_status, details)
    values (v_deal.id, v_uid, 'dispute_resolved', v_old_status, v_deal.status, jsonb_build_object('note', coalesce(p_payload ->> 'note', '')));
    return to_jsonb(v_deal);

  else
    raise exception 'الإجراء المطلوب غير معروف.';
  end if;
end;
$$;

revoke all on function public.ohda_api(text, jsonb) from public, anon;
grant execute on function public.ohda_api(text, jsonb) to authenticated;

drop policy if exists ohda_profiles_read on public.profiles;
create policy ohda_profiles_read on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or private.is_ohda_admin()
    or exists (
      select 1 from public.deals d
      where (d.seller_id = profiles.id or d.buyer_id = profiles.id)
        and (d.seller_id = (select auth.uid()) or d.buyer_id = (select auth.uid()))
    )
  );
