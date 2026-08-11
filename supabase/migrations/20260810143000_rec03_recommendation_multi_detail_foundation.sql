-- REC-03: canonical multi-detail recommendations, durable finalization, and safe publication.

create or replace function public.validate_recommendation_items(p_items jsonb, p_canonical boolean default null)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parent jsonb;
  v_detail jsonb;
  v_entry jsonb;
  v_details jsonb;
  v_status text;
  v_action text;
  v_id text;
  v_parent_id text;
  v_ids text[] := '{}';
  v_orders integer[];
  v_parent_orders integer[] := '{}';
  v_detail_orders integer[];
  v_is_canonical boolean;
  v_number numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Rekomendasi wajib berupa array yang tidak kosong.' using errcode = '22023';
  end if;

  v_is_canonical := coalesce(p_canonical, exists (
    select 1 from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) = 'object'
      and (item ? 'id' or item ? 'order' or item ? 'status' or item ? 'applicant_original' or item ? 'details')
  ));

  if v_is_canonical then
    for v_parent in select value from jsonb_array_elements(p_items)
    loop
      if jsonb_typeof(v_parent) <> 'object' or jsonb_typeof(v_parent->'id') <> 'string'
         or nullif(btrim(v_parent->>'id'), '') is null then
        raise exception 'Parent canonical wajib memiliki stable string id.' using errcode = '22023';
      end if;
      v_parent_id := btrim(v_parent->>'id');
      if v_parent_id = any(v_ids) then
        raise exception 'ID parent rekomendasi duplikat: %', v_parent_id using errcode = '23505';
      end if;
      v_ids := array_append(v_ids, v_parent_id);
      if not (v_parent ?& array['order','status','applicant_original','location','pic','rejection_reason','details'])
         or jsonb_typeof(v_parent->'order') <> 'number'
         or (v_parent->>'order')::numeric < 0
         or trunc((v_parent->>'order')::numeric) <> (v_parent->>'order')::numeric
         or jsonb_typeof(v_parent->'status') <> 'string'
         or jsonb_typeof(v_parent->'applicant_original') <> 'object'
         or not ((v_parent->'applicant_original') ?& array['name','quantity','notes'])
         or jsonb_typeof(v_parent#>'{applicant_original,name}') <> 'string'
         or nullif(btrim(v_parent#>>'{applicant_original,name}'),'') is null
         or jsonb_typeof(v_parent#>'{applicant_original,quantity}') <> 'number'
         or (v_parent#>>'{applicant_original,quantity}')::numeric <= 0
         or trunc((v_parent#>>'{applicant_original,quantity}')::numeric) <> (v_parent#>>'{applicant_original,quantity}')::numeric
         or jsonb_typeof(v_parent#>'{applicant_original,notes}') <> 'string'
         or jsonb_typeof(v_parent->'location') <> 'string'
         or jsonb_typeof(v_parent->'pic') <> 'string'
         or jsonb_typeof(v_parent->'rejection_reason') <> 'string' then
        raise exception 'Parent canonical wajib memiliki id/order/status/applicant_original/location/PIC/rejection_reason/details dengan tipe yang valid.' using errcode = '22023';
      end if;
      if (v_parent->>'order')::integer = any(v_parent_orders) then
        raise exception 'Order parent rekomendasi duplikat.' using errcode = '23505';
      end if;
      v_parent_orders := array_append(v_parent_orders,(v_parent->>'order')::integer);
      v_status := lower(btrim(v_parent->>'status'));
      if v_status not in ('recommended', 'not_recommended') then
        raise exception 'Status parent rekomendasi tidak valid.' using errcode = '22023';
      end if;
      v_details := v_parent->'details';
      if jsonb_typeof(v_details) <> 'array' then
        raise exception 'Details parent rekomendasi wajib berupa array.' using errcode = '22023';
      end if;
      if v_status = 'recommended' and jsonb_array_length(v_details) = 0 then
        raise exception 'Parent recommended wajib memiliki minimal satu detail.' using errcode = '22023';
      end if;
      if v_status = 'not_recommended' and (
        nullif(btrim(coalesce(v_parent->>'location', v_parent->>'lokasi', '')), '') is null
        or nullif(btrim(coalesce(v_parent->>'pic', v_parent->>'person_in_charge', '')), '') is null
        or nullif(btrim(coalesce(v_parent->>'rejection_reason', v_parent->>'reason', '')), '') is null
      ) then
        raise exception 'Parent not_recommended wajib memiliki location, PIC, dan rejection_reason.' using errcode = '22023';
      end if;

      for v_detail in select value from jsonb_array_elements(v_details)
      loop
        if jsonb_typeof(v_detail) <> 'object' then
          raise exception 'Detail rekomendasi wajib berupa object.' using errcode = '22023';
        end if;
        if jsonb_typeof(v_detail->'id') <> 'string' then
          raise exception 'Detail canonical wajib memiliki stable string id.' using errcode = '22023';
        end if;
        v_id := nullif(btrim(v_detail->>'id'), '');
        if v_id is null then
          raise exception 'Detail canonical wajib memiliki stable id.' using errcode = '22023';
        end if;
        if v_id = any(v_ids) then
          raise exception 'ID rekomendasi duplikat: %', v_id using errcode = '23505';
        end if;
        v_ids := array_append(v_ids, v_id);
        if (v_detail ? 'parent_item_id' and jsonb_typeof(v_detail->'parent_item_id') <> 'string')
           or nullif(btrim(coalesce(v_detail->>'parent_item_id', v_parent_id)), '') is distinct from v_parent_id then
          raise exception 'Detail tidak konsisten dengan parent rekomendasi.' using errcode = '22023';
        end if;
        if not (v_detail ?& array['order','name','quantity','action','description','description_manually_edited','notes','attachments','reference_links'])
           or jsonb_typeof(v_detail->'order') <> 'number'
           or (v_detail->>'order')::numeric < 0
           or trunc((v_detail->>'order')::numeric) <> (v_detail->>'order')::numeric
           or jsonb_typeof(v_detail->'action') <> 'string'
           or jsonb_typeof(v_detail->'name') <> 'string'
           or nullif(btrim(v_detail->>'name'), '') is null
           or jsonb_typeof(v_detail->'description') <> 'string'
           or jsonb_typeof(v_detail->'description_manually_edited') <> 'boolean'
           or jsonb_typeof(v_detail->'notes') <> 'string'
           or (v_detail ? 'location' and jsonb_typeof(v_detail->'location') <> 'string')
           or (v_detail ? 'pic' and jsonb_typeof(v_detail->'pic') <> 'string') then
          raise exception 'Detail canonical wajib memiliki id/order/name/quantity/action/description/edit flag/notes/arrays dengan tipe yang valid.' using errcode = '22023';
        end if;
        if jsonb_typeof(v_detail->'quantity') <> 'number'
           or (v_detail->>'quantity')::numeric <= 0
           or trunc((v_detail->>'quantity')::numeric) <> (v_detail->>'quantity')::numeric then
          raise exception 'Quantity detail wajib bilangan bulat positif.' using errcode = '22023';
        end if;
        v_action := lower(btrim(coalesce(v_detail->>'action', v_detail->>'recommendation_action', '')));
        if v_action not in ('purchase_new', 'replace', 'service') then
          raise exception 'Action detail rekomendasi tidak valid.' using errcode = '22023';
        end if;
        v_detail_orders := coalesce(v_detail_orders,'{}');
        if (v_detail->>'order')::integer = any(v_detail_orders) then
          raise exception 'Order detail rekomendasi duplikat.' using errcode = '23505';
        end if;
        v_detail_orders := array_append(v_detail_orders,(v_detail->>'order')::integer);
        if v_detail ? 'estimated_price' and v_detail->'estimated_price' <> 'null'::jsonb then
          if jsonb_typeof(v_detail->'estimated_price') <> 'number' or (v_detail->>'estimated_price')::numeric < 0 then
            raise exception 'Estimated price wajib angka nonnegative.' using errcode = '22023';
          end if;
        end if;

        foreach v_entry in array array[v_detail->'attachments', v_detail->'reference_links']
        loop
          if v_entry is null then
            continue;
          end if;
          if jsonb_typeof(v_entry) <> 'array' then
            raise exception 'Attachments dan reference_links wajib berupa array.' using errcode = '22023';
          end if;
          v_orders := '{}';
          for v_entry in select value from jsonb_array_elements(v_entry)
          loop
            if jsonb_typeof(v_entry) <> 'object'
               or jsonb_typeof(v_entry->'id') <> 'string'
               or nullif(btrim(v_entry->>'id'), '') is null
               or jsonb_typeof(v_entry->'order') <> 'number'
               or (v_entry->>'order')::numeric < 0
               or trunc((v_entry->>'order')::numeric) <> (v_entry->>'order')::numeric
               or (v_entry ? 'storage_path' and jsonb_typeof(v_entry->'storage_path') <> 'string')
               or (v_entry ? 'path' and jsonb_typeof(v_entry->'path') <> 'string')
               or (v_entry ? 'url' and jsonb_typeof(v_entry->'url') <> 'string')
               or (nullif(btrim(coalesce(v_entry->>'storage_path', v_entry->>'path', '')), '') is null
                   and nullif(btrim(v_entry->>'url'), '') is null) then
              raise exception 'Attachment/reference wajib memiliki stable id, order, dan path atau URL.' using errcode = '22023';
            end if;
            if (v_entry->>'order')::integer = any(v_orders) then
              raise exception 'Order attachment/reference duplikat.' using errcode = '23505';
            end if;
            if btrim(v_entry->>'id') = any(v_ids) then
              raise exception 'ID attachment/reference duplikat: %', btrim(v_entry->>'id') using errcode = '23505';
            end if;
            v_ids := array_append(v_ids, btrim(v_entry->>'id'));
            v_orders := array_append(v_orders, (v_entry->>'order')::integer);
          end loop;
        end loop;
      end loop;
      v_detail_orders := '{}';
    end loop;
    return;
  end if;

  -- Legacy rows remain readable: validate supplied business values, but do not require stable IDs.
  for v_parent in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_parent) <> 'object' then
      raise exception 'Row rekomendasi legacy wajib berupa object.' using errcode = '22023';
    end if;
    v_details := case
      when jsonb_typeof(v_parent->'recommendation_details') = 'array' then v_parent->'recommendation_details'
      when jsonb_typeof(v_parent->'details') = 'array' then v_parent->'details'
      else jsonb_build_array(v_parent)
    end;
    if jsonb_array_length(v_details) = 0 then
      v_action := lower(btrim(coalesce(v_parent->>'recommendation_action', v_parent->>'action', v_parent->>'status', '')));
      if v_action not in ('not_recommended','tidak_direkomendasikan','tidak direkomendasikan','rejected','ditolak')
         and lower(coalesce(v_parent->>'is_recommended','true')) <> 'false' then
        raise exception 'Array detail rekomendasi legacy tidak boleh kosong.' using errcode = '22023';
      end if;
      if nullif(btrim(coalesce(v_parent->>'rejection_reason',v_parent->>'reason',v_parent->>'alasan','')),'') is null
         or nullif(btrim(coalesce(v_parent->>'location',v_parent->>'lokasi','')),'') is null
         or nullif(btrim(coalesce(v_parent->>'pic',v_parent->>'person_in_charge','')),'') is null then
        raise exception 'Rekomendasi legacy ditolak wajib memiliki location, PIC, dan alasan.' using errcode = '22023';
      end if;
    end if;
    for v_detail in select value from jsonb_array_elements(v_details)
    loop
      v_action := lower(btrim(coalesce(v_detail->>'recommendation_action', v_detail->>'action', v_detail->>'status', '')));
      if v_action = '' then
        raise exception 'Action/status rekomendasi legacy wajib diisi.' using errcode = '22023';
      end if;
      if v_action not in (
        'purchase_new', 'beli_baru', 'beli baru', 'replace', 'ganti', 'service', 'servis',
        'not_recommended', 'tidak_direkomendasikan', 'tidak direkomendasikan', 'rejected', 'ditolak'
      ) then
        raise exception 'Action rekomendasi legacy tidak valid.' using errcode = '22023';
      end if;
      if v_action in ('not_recommended', 'tidak_direkomendasikan', 'tidak direkomendasikan', 'rejected', 'ditolak')
         or lower(coalesce(v_detail->>'is_recommended', 'true')) = 'false' then
        if nullif(btrim(coalesce(v_detail->>'rejection_reason', v_detail->>'reason', v_detail->>'alasan', '')), '') is null
           or nullif(btrim(coalesce(v_detail->>'location', v_detail->>'lokasi', '')), '') is null
           or nullif(btrim(coalesce(v_detail->>'pic', v_detail->>'person_in_charge', '')), '') is null then
          raise exception 'Rekomendasi legacy ditolak wajib memiliki location, PIC, dan alasan.' using errcode = '22023';
        end if;
      else
        if nullif(btrim(coalesce(v_detail->>'name', v_detail->>'detail_name', v_detail->>'nama_barang', v_detail->>'nama', '')), '') is null then
          raise exception 'Nama rekomendasi legacy wajib diisi.' using errcode = '22023';
        end if;
        begin
          v_number := coalesce(v_detail->>'quantity', v_detail->>'jumlah')::numeric;
          if v_number <= 0 or trunc(v_number) <> v_number then raise exception using errcode = '22023'; end if;
        exception when others then
          raise exception 'Quantity rekomendasi legacy wajib bilangan bulat positif.' using errcode = '22023';
        end;
      end if;
    end loop;
  end loop;
end;
$$;

create unique index if not exists notifications_rec03_dedupe_idx
on public.notifications (user_id, (data->>'event_type'), (data->>'dedupe_key'))
where data->>'event_type' in ('recommendation_initial_finalized', 'recommendation_revision_waiting_requester')
  and nullif(data->>'dedupe_key', '') is not null;

create or replace function public.complete_recommendation_task(p_task_id uuid, p_child_surat_id uuid)
returns public.surat_recommendation_tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  v_task public.surat_recommendation_tasks;
  v_child public.surat_registrasi%rowtype;
  v_input jsonb;
  v_items jsonb;
  v_context_task text;
  v_child_reservation text;
  v_parent jsonb;
  v_status text;
  v_rejected integer := 0;
  v_total integer := 0;
  v_now timestamptz;
  v_affected integer;
begin
  if v_actor is null then raise exception 'Sesi login tidak tersedia.' using errcode = '28000'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_actor and p.is_active is true) then
    raise exception 'Profil aktif tidak tersedia.' using errcode='42501';
  end if;
  select exists (
    select 1 from public.profiles p where p.id = v_actor
      and p.role::text in ('admin', 'super_admin') and p.is_active is true
  ) into v_is_admin;
  select * into v_task from public.surat_recommendation_tasks where id = p_task_id for update;
  if not found then raise exception 'Tugas rekomendasi tidak ditemukan.' using errcode = 'P0002'; end if;
  if not (v_task.claimed_by = v_actor or v_is_admin) then
    raise exception 'Tugas rekomendasi dikunci user lain.' using errcode = '42501';
  end if;
  if v_task.status = 'submitted' then
    if v_task.submitted_surat_id = p_child_surat_id then return v_task; end if;
    raise exception 'Tugas rekomendasi sudah diselesaikan dengan surat lain.' using errcode = '55000';
  end if;
  if v_task.status not in ('claimed', 'revision_requested') then
    raise exception 'Tugas rekomendasi belum dapat diselesaikan dari status %.', v_task.status using errcode = '55000';
  end if;
  select * into v_child from public.surat_registrasi c
  where c.id = p_child_surat_id and (c.created_by = v_actor or v_is_admin);
  if not found then raise exception 'Surat rekomendasi tidak valid.' using errcode = '42501'; end if;

  v_input := coalesce(v_child.form_input_data, '{}'::jsonb);
  if lower(coalesce(v_input->>'linked_document_type', '')) <> 'recommendation'
     or nullif(v_input->>'linked_parent_surat_id', '') is distinct from v_task.parent_surat_id::text then
    raise exception 'Surat child bukan rekomendasi untuk parent tugas ini.' using errcode = '22023';
  end if;
  v_context_task := nullif(coalesce(v_input->>'task_id', v_input->>'recommendation_task_id', v_input#>>'{linked_context,task_id}'), '');
  v_child_reservation := nullif(coalesce(to_jsonb(v_child)->>'reservation_id', v_input->>'reservation_id'), '');
  if v_context_task is not null and v_context_task <> p_task_id::text then
    raise exception 'Task context child tidak sesuai.' using errcode = '22023';
  end if;
  if v_child_reservation is distinct from v_task.reservation_id::text then
    raise exception 'Child tidak terikat pada reservation tugas.' using errcode = '22023';
  end if;

    if v_input ? 'recommendation_multi_detail' then
      if jsonb_typeof(v_input->'recommendation_multi_detail') <> 'object'
         or jsonb_typeof(v_input#>'{recommendation_multi_detail,version}') <> 'number'
         or (v_input#>>'{recommendation_multi_detail,version}')::numeric <> 1
         or not ((v_input->'recommendation_multi_detail') ? 'items') then
      raise exception 'Payload recommendation_multi_detail canonical tidak valid.' using errcode = '22023';
    end if;
    v_items := v_input#>'{recommendation_multi_detail,items}';
    perform public.validate_recommendation_items(v_items,true);
  else
    v_items := v_input->'recommendation_items';
    perform public.validate_recommendation_items(v_items,false);
  end if;
  for v_parent in select value from jsonb_array_elements(v_items)
  loop
    v_total := v_total + 1;
    v_status := regexp_replace(lower(btrim(coalesce(v_parent->>'status', v_parent->>'recommendation_status', v_parent->>'recommendation_action', ''))),'[[:space:]_-]+','_','g');
    if v_status in ('not_recommended', 'tidak_direkomendasikan', 'rejected', 'ditolak')
       or lower(coalesce(v_parent->>'is_recommended', 'true')) = 'false' then
      v_rejected := v_rejected + 1;
    end if;
  end loop;
  v_now := clock_timestamp();
  update public.surat_linked_documents set status = 'cancelled', updated_at = v_now
  where parent_surat_id = v_task.parent_surat_id and link_type = 'recommendation'
    and status = 'active' and child_surat_id <> p_child_surat_id;
  insert into public.surat_linked_documents(parent_surat_id, child_surat_id, link_type, required_before_step, created_by)
  values(v_task.parent_surat_id, p_child_surat_id, 'recommendation', v_task.required_before_step, v_actor)
  on conflict(parent_surat_id, child_surat_id, link_type) do update
  set status = 'active', required_before_step = excluded.required_before_step, updated_at = v_now;
  update public.surat_reservations set status = 'USED', reserved_by = coalesce(reserved_by, v_actor)
  where id = v_task.reservation_id and status in ('PENDING', 'USED');
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then raise exception 'Reservation tugas tidak tersedia atau tidak dapat digunakan.' using errcode='55000'; end if;
  update public.surat_recommendation_tasks
  set status = 'submitted', submitted_surat_id = p_child_surat_id, submitted_at = v_now
  where id = p_task_id returning * into v_task;
  return v_task;
end;
$$;

create or replace function public.finalize_recommendation_revision_if_needed(p_child_surat_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_task public.surat_recommendation_tasks;
  v_child public.surat_registrasi%rowtype;
  v_parent public.surat_registrasi%rowtype;
  v_event public.surat_revision_events%rowtype;
  v_items jsonb;
  v_item jsonb;
  v_status text;
  v_rejections jsonb := '[]'::jsonb;
  v_summary text;
  v_fingerprint text;
  v_old_fingerprint text;
  v_dedupe text;
begin
  select * into v_child from public.surat_registrasi where id = p_child_surat_id;
  if not found or upper(coalesce(v_child.status::text, '')) not in ('DONE', 'SELESAI', 'COMPLETED') then return false; end if;
  select * into v_task from public.surat_recommendation_tasks
  where submitted_surat_id = p_child_surat_id and status = 'submitted'
  order by updated_at desc limit 1 for update;
  if not found then return false; end if;
  select * into v_parent from public.surat_registrasi where id = v_task.parent_surat_id for update;
  if not found then return false; end if;
  if v_child.form_input_data ? 'recommendation_multi_detail' then
    if jsonb_typeof(v_child.form_input_data->'recommendation_multi_detail') <> 'object'
       or jsonb_typeof(v_child.form_input_data#>'{recommendation_multi_detail,version}') <> 'number'
       or (v_child.form_input_data#>>'{recommendation_multi_detail,version}')::numeric <> 1 then
      raise exception 'Payload recommendation_multi_detail canonical tidak valid.' using errcode='22023';
    end if;
    v_items:=v_child.form_input_data#>'{recommendation_multi_detail,items}';
    perform public.validate_recommendation_items(v_items,true);
  else
    v_items:=v_child.form_input_data->'recommendation_items';
    perform public.validate_recommendation_items(v_items,false);
  end if;
  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_status := regexp_replace(lower(btrim(coalesce(v_item->>'status', v_item->>'recommendation_status', v_item->>'recommendation_action', ''))),'[[:space:]_-]+','_','g');
    if v_status in ('not_recommended', 'tidak_direkomendasikan', 'rejected', 'ditolak')
       or lower(coalesce(v_item->>'is_recommended', 'true')) = 'false' then
      v_rejections := v_rejections || jsonb_build_array(jsonb_build_object(
        'parent_id', coalesce(v_item->>'id', v_item->>'parent_item_id'),
        'status', 'not_recommended',
        'reason', coalesce(v_item->>'rejection_reason', v_item->>'reason', v_item->>'alasan', '')
      ));
    end if;
  end loop;
  select string_agg(coalesce(nullif(r->>'parent_id', ''), 'item') || ': ' || coalesce(nullif(btrim(r->>'reason'), ''), 'tanpa alasan'), '; ' order by r::text)
  into v_summary from jsonb_array_elements(v_rejections) r;
  select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_object('status', r->>'status', 'reason', btrim(coalesce(r->>'reason', ''))) order by r::text), '[]'::jsonb)::text, 'sha256'), 'hex')
  into v_fingerprint from jsonb_array_elements(v_rejections) r;
  update public.surat_registrasi set data_snapshot = jsonb_set(
    jsonb_set(coalesce(data_snapshot, '{}'::jsonb), '{recommendation}', jsonb_build_object(
      'task_id', v_task.id, 'child_surat_id', p_child_surat_id, 'items', v_items,
      'finalized_at', clock_timestamp(), 'not_recommended_count', jsonb_array_length(v_rejections),
      'all_not_recommended', jsonb_array_length(v_items) > 0 and jsonb_array_length(v_rejections) = jsonb_array_length(v_items)
    ), true), '{recommendation_decisions}', v_items, true
  ), updated_at = clock_timestamp() where id = v_parent.id;
  select * into v_event from public.surat_revision_events
  where surat_id = v_parent.id and ((target_type = 'recommendation' and status = 'open')
    or (status = 'awaiting_requester' and changes->>'recommendation_child_surat_id' = p_child_surat_id::text))
  order by created_at desc limit 1 for update;
  if not found then
    v_dedupe := 'recommendation-initial:' || v_task.id::text || ':' || p_child_surat_id::text;
    insert into public.notifications(user_id, type, title, message, data, link)
    select v_parent.created_by, case when jsonb_array_length(v_rejections)>0 then 'warning' else 'info' end,
      'Rekomendasi Selesai', 'Rekomendasi untuk "' || coalesce(v_parent.judul_surat, '') || '" sudah selesai.' ||
      case when v_summary is null then '' else ' Parent ditolak: ' || v_summary end,
      jsonb_build_object('surat_id',v_parent.id,'recommendation_task_id',v_task.id,'recommendation_child_surat_id',p_child_surat_id,
        'event_type','recommendation_initial_finalized','dedupe_key',v_dedupe,'rejections',v_rejections,'rejection_fingerprint',v_fingerprint),
      '/surat/monitoring' where v_parent.created_by is not null on conflict do nothing;
    return true;
  end if;
  v_old_fingerprint := v_event.changes->>'recommendation_rejection_fingerprint';
  if v_event.status = 'awaiting_requester' and v_old_fingerprint is not distinct from v_fingerprint then return true; end if;
  update public.surat_revision_events set status='awaiting_requester', target_type='requester', target_user_ids=array[v_parent.created_by],
    changes=coalesce(changes,'{}'::jsonb)||jsonb_build_object('resolution_note','Rekomendasi revisi sudah selesai dan ditandatangani ulang.',
      'resolved_by_worker',v_actor,'resolved_by_worker_at',clock_timestamp(),'recommendation_child_surat_id',p_child_surat_id,
      'recommendation_rejections',v_rejections,'recommendation_rejection_fingerprint',v_fingerprint)
  where id=v_event.id;
  update public.surat_registrasi set data_snapshot=jsonb_set(coalesce(data_snapshot,'{}'::jsonb),'{revision}',jsonb_build_object(
    'event_id',v_event.id,'target_type','requester','target_user_ids',array[v_parent.created_by],
    'reason',v_event.reason,'awaiting_requester_acceptance',true,'recommendation_rejection_fingerprint',v_fingerprint),true),updated_at=clock_timestamp()
  where id=v_parent.id;
  v_dedupe := 'recommendation-revision:' || v_event.id::text;
  insert into public.notifications(user_id,type,title,message,data,link)
  select v_parent.created_by,'warning','Rekomendasi Revisi Selesai','Rekomendasi revisi untuk "'||coalesce(v_parent.judul_surat,'')||'" sudah selesai.'||
    case when v_summary is null then '' else ' Parent ditolak: '||v_summary end,
    jsonb_build_object('surat_id',v_parent.id,'recommendation_task_id',v_task.id,'recommendation_child_surat_id',p_child_surat_id,
      'revision_event_id',v_event.id,'event_type','recommendation_revision_waiting_requester','dedupe_key',v_dedupe,
      'rejections',v_rejections,'rejection_fingerprint',v_fingerprint),'/surat/monitoring'
  where v_parent.created_by is not null
  on conflict(user_id,(data->>'event_type'),(data->>'dedupe_key')) where data->>'event_type' in ('recommendation_initial_finalized','recommendation_revision_waiting_requester') and nullif(data->>'dedupe_key','') is not null
  do update set message=excluded.message,data=excluded.data where public.notifications.data->>'rejection_fingerprint' is distinct from excluded.data->>'rejection_fingerprint';
  return true;
end;
$$;

alter function public.finalize_recommendation_revision_if_needed(uuid)
rename to finalize_recommendation_revision_internal;

create or replace function public.finalize_recommendation_revision_if_needed(p_child_surat_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Sesi login tidak tersedia.' using errcode='28000'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_actor and p.is_active is true) then
    raise exception 'Profil aktif tidak tersedia.' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.surat_registrasi c
    left join public.surat_recommendation_tasks t on t.submitted_surat_id=c.id
    where c.id=p_child_surat_id and (
      c.created_by=v_actor or t.claimed_by=v_actor
      or exists(select 1 from public.surat_signatures s where s.surat_id=c.id and s.user_id=v_actor)
       or exists(select 1 from public.profiles p where p.id=v_actor and p.role::text in ('admin','super_admin') and p.is_active is true)
    )
  ) then raise exception 'Tidak berwenang memfinalisasi rekomendasi ini.' using errcode='42501'; end if;
  return public.finalize_recommendation_revision_internal(p_child_surat_id);
end;
$$;

create or replace function public.finalize_recommendation_on_child_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.finalize_recommendation_revision_internal(new.id);
  return new;
end;
$$;
drop trigger if exists finalize_recommendation_after_child_completion on public.surat_registrasi;
create trigger finalize_recommendation_after_child_completion
after update of status on public.surat_registrasi for each row
when (upper(coalesce(old.status::text,'')) not in ('DONE','SELESAI','COMPLETED') and upper(coalesce(new.status::text,'')) in ('DONE','SELESAI','COMPLETED'))
execute function public.finalize_recommendation_on_child_completion();

alter table public.document_pdf_jobs add column if not exists recommendation_content_fingerprint text;
alter table public.document_pdf_jobs add column if not exists render_payload jsonb;
alter table public.document_pdf_jobs add column if not exists lease_token uuid;
alter table public.document_pdf_jobs add column if not exists lease_expires_at timestamptz;

create or replace function public.recommendation_pdf_render_payload(p_surat_id uuid,p_source_file_path text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'version',1,
    'workbook_source',jsonb_build_object('bucket','dokumen_surat','path',p_source_file_path),
    'parent_workbook_source',jsonb_build_object('bucket','dokumen_surat','path',p.file_path),
    'child_input',coalesce(c.form_input_data,'{}'::jsonb),
    'child_snapshot_input',coalesce(c.data_snapshot->'input',c.data_snapshot,'{}'::jsonb),
    'parent_input',coalesce(p.form_input_data,'{}'::jsonb),
    'parent_snapshot_input',coalesce(p.data_snapshot->'input',p.data_snapshot,'{}'::jsonb),
    'attachment_refs',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'file_url',a.file_url,'file_size',a.file_size,'file_type',a.file_type
    ) order by a.id) from public.surat_attachments a where a.surat_id=c.id),'[]'::jsonb),
    'parent_attachment_refs',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'file_url',a.file_url,'file_size',a.file_size,'file_type',a.file_type
    ) order by a.id) from public.surat_attachments a where a.surat_id=p.id),'[]'::jsonb)
  )
  from public.surat_registrasi c
  join public.surat_linked_documents l on l.child_surat_id=c.id and l.link_type='recommendation' and l.status='active'
  join public.surat_registrasi p on p.id=l.parent_surat_id
  where c.id=p_surat_id and c.file_path=p_source_file_path
$$;

create or replace function public.recommendation_content_fingerprint(p_render_payload jsonb)
returns text language sql immutable security definer set search_path = '' as $$
  select encode(extensions.digest(p_render_payload::text,'sha256'),'hex')
$$;

create or replace function public.recommendation_pdf_is_current(p_child_surat_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.surat_registrasi c
    join public.document_pdf_jobs j on j.surat_id=c.id and j.signature_id is null
    cross join lateral (select public.recommendation_pdf_render_payload(c.id,c.file_path) as render_payload) current_render
    where c.id=p_child_surat_id and upper(coalesce(c.status::text,'')) in ('DONE','SELESAI','COMPLETED')
      and nullif(btrim(coalesce(c.pdf_path,'')),'') is not null and j.status='done'
      and j.source_file_path=c.file_path and j.pdf_url=c.pdf_path
      and j.render_payload=current_render.render_payload
      and j.recommendation_content_fingerprint=public.recommendation_content_fingerprint(current_render.render_payload)
  )
$$;

create or replace function public.guard_recommendation_child_final_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if upper(coalesce(old.status::text,'')) not in ('DONE','SELESAI','COMPLETED')
     and upper(coalesce(new.status::text,'')) in ('DONE','SELESAI','COMPLETED')
     and exists(select 1 from public.surat_linked_documents l where l.child_surat_id=new.id and l.link_type='recommendation' and l.status='active')
     and not exists(
       select 1 from public.document_pdf_jobs j
       cross join lateral (select public.recommendation_pdf_render_payload(new.id,new.file_path) as render_payload) current_render
       where j.surat_id=new.id and j.signature_id is null and j.status='done'
         and j.source_file_path=new.file_path and j.pdf_url=new.pdf_path
         and j.render_payload=current_render.render_payload
         and j.recommendation_content_fingerprint=public.recommendation_content_fingerprint(current_render.render_payload)
     ) then
    raise exception 'Dokumen rekomendasi hanya dapat selesai melalui publikasi PDF canonical.' using errcode='55000';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_recommendation_child_final_status on public.surat_registrasi;
create trigger guard_recommendation_child_final_status before update of status on public.surat_registrasi
for each row execute function public.guard_recommendation_child_final_status();

create or replace function public.guard_parent_approval_for_recommendation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.current_step > old.current_step
      or (upper(coalesce(old.status::text,'')) not in ('DONE','SELESAI','COMPLETED')
          and upper(coalesce(new.status::text,'')) in ('DONE','SELESAI','COMPLETED')))
     and exists (
    select 1 from public.surat_recommendation_tasks t where t.parent_surat_id=new.id
      and t.status<>'cancelled' and new.current_step>=t.required_before_step
      and not exists (select 1 from public.surat_linked_documents l join public.surat_registrasi c on c.id=l.child_surat_id
        where l.parent_surat_id=new.id and l.link_type='recommendation' and l.status='active'
          and public.recommendation_pdf_is_current(c.id))
  ) then raise exception 'Dokumen rekomendasi wajib selesai sebelum approval tahap ini.' using errcode='55000'; end if;
  return new;
end;
$$;
drop trigger if exists guard_parent_approval_for_recommendation on public.surat_registrasi;
create trigger guard_parent_approval_for_recommendation before update of current_step,status on public.surat_registrasi
for each row execute function public.guard_parent_approval_for_recommendation();

create or replace function public.guard_parent_signature_for_recommendation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(old.is_signed,false)=false and coalesce(new.is_signed,false)=true and exists (
    select 1 from public.surat_registrasi p join public.surat_recommendation_tasks t on t.parent_surat_id=p.id
    where p.id=new.surat_id and t.status<>'cancelled' and p.current_step>=t.required_before_step
      and not exists (select 1 from public.surat_linked_documents l join public.surat_registrasi c on c.id=l.child_surat_id
        where l.parent_surat_id=p.id and l.link_type='recommendation' and l.status='active'
          and public.recommendation_pdf_is_current(c.id))
  ) then raise exception 'Dokumen rekomendasi wajib selesai sebelum approval tahap ini.' using errcode='55000'; end if;
  return new;
end;
$$;
drop trigger if exists guard_parent_signature_for_recommendation on public.surat_signatures;
create trigger guard_parent_signature_for_recommendation before update of is_signed on public.surat_signatures
for each row execute function public.guard_parent_signature_for_recommendation();

create unique index if not exists document_pdf_jobs_active_recommendation_idx
on public.document_pdf_jobs(surat_id,source_file_path,recommendation_content_fingerprint)
where signature_id is null and recommendation_content_fingerprint is not null and status in ('queued','processing');

create or replace function public.enqueue_recommendation_pdf_on_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_fingerprint text; v_payload jsonb;
begin
  if not exists(select 1 from public.surat_linked_documents l where l.child_surat_id=new.id and l.link_type='recommendation' and l.status='active') then
    return new;
  end if;
  -- Publishing PDF_PENDING changes status and pdf_path together; that publication must not enqueue itself.
  if upper(coalesce(old.status::text,''))='PDF_PENDING'
     and upper(coalesce(new.status::text,'')) in ('DONE','SELESAI','COMPLETED')
     and new.pdf_path is distinct from old.pdf_path then return new; end if;
  if nullif(btrim(coalesce(new.file_path,'')),'') is null then
    raise exception 'File stamped rekomendasi wajib tersedia sebelum PDF_PENDING.' using errcode='22023';
  end if;
  v_payload:=public.recommendation_pdf_render_payload(new.id,new.file_path);
  if v_payload is null then raise exception 'Snapshot render rekomendasi tidak ditemukan.' using errcode='P0002'; end if;
  v_fingerprint:=public.recommendation_content_fingerprint(v_payload);
  insert into public.document_pdf_jobs(surat_id,signature_id,source_file_path,requested_by,recommendation_content_fingerprint,render_payload)
  values(new.id,null,new.file_path,new.created_by,v_fingerprint,v_payload)
  on conflict(surat_id,source_file_path,recommendation_content_fingerprint)
    where signature_id is null and recommendation_content_fingerprint is not null and status in ('queued','processing')
  do nothing;
  return new;
end;
$$;
drop trigger if exists enqueue_recommendation_pdf_after_pending on public.surat_registrasi;
drop trigger if exists enqueue_recommendation_pdf_after_status on public.surat_registrasi;
create trigger enqueue_recommendation_pdf_after_status after update of status on public.surat_registrasi
for each row when (
  upper(coalesce(old.status::text,'')) is distinct from upper(coalesce(new.status::text,''))
  and upper(coalesce(new.status::text,'')) in ('PDF_PENDING','DONE','SELESAI','COMPLETED')
)
execute function public.enqueue_recommendation_pdf_on_status();

create or replace function public.enqueue_recommendation_pdf_job(p_surat_id uuid,p_source_file_path text,p_requested_by uuid,p_refresh boolean default false)
returns public.document_pdf_jobs language plpgsql security definer set search_path = '' as $$
declare v_job public.document_pdf_jobs; v_fingerprint text; v_payload jsonb;
begin
  if not exists(select 1 from public.surat_registrasi c where c.id=p_surat_id and c.file_path=p_source_file_path
    and upper(coalesce(c.status::text,'')) in ('PDF_PENDING','DONE','SELESAI','COMPLETED')
    and exists(select 1 from public.surat_linked_documents l where l.child_surat_id=c.id and l.link_type='recommendation' and l.status='active')) then
    raise exception 'Surat rekomendasi belum final, tidak tertaut, atau source sudah berubah.' using errcode='55000';
  end if;
  v_payload:=public.recommendation_pdf_render_payload(p_surat_id,p_source_file_path);
  if v_payload is null then raise exception 'Snapshot render rekomendasi tidak ditemukan.' using errcode='P0002'; end if;
  v_fingerprint:=public.recommendation_content_fingerprint(v_payload);
  select * into v_job from public.document_pdf_jobs where surat_id=p_surat_id and signature_id is null
    and source_file_path=p_source_file_path and recommendation_content_fingerprint=v_fingerprint
    and status in ('queued','processing') order by created_at desc limit 1 for update;
  if found then return v_job; end if;
  insert into public.document_pdf_jobs(surat_id,signature_id,source_file_path,status,requested_by,refresh,recommendation_content_fingerprint,render_payload)
  values(p_surat_id,null,p_source_file_path,'queued',p_requested_by,p_refresh,v_fingerprint,v_payload) returning * into v_job;
  return v_job;
exception when unique_violation then
  select * into v_job from public.document_pdf_jobs where surat_id=p_surat_id and signature_id is null
    and source_file_path=p_source_file_path and recommendation_content_fingerprint=v_fingerprint
    and status in ('queued','processing') order by created_at desc limit 1;
  return v_job;
end;
$$;

create or replace function public.claim_document_pdf_jobs(p_worker_id text,p_limit integer,p_max_attempts integer,p_lock_timeout interval default interval '5 minutes')
returns setof public.document_pdf_jobs language plpgsql security definer set search_path = '' as $$
begin
  if nullif(btrim(coalesce(p_worker_id,'')),'') is null or p_limit<1 or p_max_attempts<1 or p_lock_timeout<=interval '0 seconds' then
    raise exception 'Parameter claim PDF tidak valid.' using errcode='22023';
  end if;
  update public.document_pdf_jobs set status='failed',error_message=coalesce(error_message,'Maximum PDF attempts exhausted'),
    finished_at=coalesce(finished_at,clock_timestamp()),updated_at=clock_timestamp()
  where status in ('queued','processing') and attempt_count>=p_max_attempts
    and (status='queued' or locked_at is null or lease_expires_at is null or lease_expires_at<=clock_timestamp());
  return query
  with candidates as (
    select id from public.document_pdf_jobs
    where status in ('queued','processing') and attempt_count<p_max_attempts
      and (status='queued' or locked_at is null or lease_expires_at is null or lease_expires_at<=clock_timestamp())
    order by created_at for update skip locked limit p_limit
  ), claimed as (
    update public.document_pdf_jobs j set status='processing',locked_by=p_worker_id,locked_at=clock_timestamp(),
      lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+p_lock_timeout,
      attempt_count=j.attempt_count+1,error_message=null,updated_at=clock_timestamp()
    from candidates c where j.id=c.id returning j.*
  ) select * from claimed;
end;
$$;

create or replace function public.fail_document_pdf_job(p_job_id uuid,p_lease_token uuid,p_error_message text,p_max_attempts integer)
returns public.document_pdf_jobs language plpgsql security definer set search_path = '' as $$
declare v_job public.document_pdf_jobs;
begin
  if p_lease_token is null or p_max_attempts<1 then raise exception 'Lease dan batas percobaan wajib diisi.' using errcode='22023'; end if;
  select * into v_job from public.document_pdf_jobs where id=p_job_id for update;
  if not found then raise exception 'Job PDF tidak ditemukan.' using errcode='P0002'; end if;
  if v_job.status in ('queued','failed','done') and v_job.lease_token=p_lease_token then return v_job; end if;
  if v_job.status<>'processing' or v_job.lease_token is distinct from p_lease_token
     or v_job.lease_expires_at is null or v_job.lease_expires_at<=clock_timestamp() then
    raise exception 'Lease job PDF sudah tidak berlaku.' using errcode='42501';
  end if;
  update public.document_pdf_jobs set status=case when attempt_count>=p_max_attempts then 'failed' else 'queued' end,
    error_message=left(coalesce(nullif(p_error_message,''),'Gagal membuat PDF.'),2000),
    finished_at=case when attempt_count>=p_max_attempts then clock_timestamp() else null end,updated_at=clock_timestamp()
  where id=p_job_id returning * into v_job;
  return v_job;
end;
$$;

drop function if exists public.publish_document_pdf_job(uuid,text,text,text,text);
create function public.publish_document_pdf_job(p_job_id uuid,p_source_file_path text,p_content_fingerprint text,p_pdf_url text,p_lease_token uuid)
returns public.document_pdf_jobs language plpgsql security definer set search_path = '' as $$
declare v_job public.document_pdf_jobs; v_surat public.surat_registrasi%rowtype; v_current_payload jsonb; v_current_fingerprint text;
begin
  if nullif(btrim(coalesce(p_source_file_path,'')),'') is null or nullif(btrim(coalesce(p_pdf_url,'')),'') is null
     or p_lease_token is null then raise exception 'Source, URL PDF, dan lease wajib diisi.' using errcode='22023'; end if;
  select * into v_job from public.document_pdf_jobs where id=p_job_id for update;
  if not found then raise exception 'Job PDF tidak ditemukan.' using errcode='P0002'; end if;
  select * into v_surat from public.surat_registrasi where id=v_job.surat_id for update;
  if not found then raise exception 'Surat sumber PDF tidak ditemukan.' using errcode='P0002'; end if;
  if v_job.status='done' then
    if v_job.lease_token=p_lease_token and v_job.source_file_path=p_source_file_path
       and v_job.recommendation_content_fingerprint=p_content_fingerprint and v_job.pdf_url=p_pdf_url then return v_job; end if;
    raise exception 'Job PDF sudah dipublikasikan dengan pointer berbeda.' using errcode='55000';
  end if;
  if v_job.status<>'processing' or v_job.lease_token is distinct from p_lease_token
     or v_job.lease_expires_at is null or v_job.lease_expires_at<=clock_timestamp() then
    raise exception 'Worker tidak memiliki lease job PDF yang aktif.' using errcode='42501';
  end if;
  v_current_payload:=public.recommendation_pdf_render_payload(v_job.surat_id,v_job.source_file_path);
  v_current_fingerprint:=public.recommendation_content_fingerprint(v_current_payload);
  if v_job.signature_id is not null or v_job.recommendation_content_fingerprint is distinct from p_content_fingerprint
     or v_job.render_payload is distinct from v_current_payload or v_current_fingerprint is distinct from p_content_fingerprint
     or v_job.source_file_path is distinct from p_source_file_path or v_surat.file_path is distinct from p_source_file_path then
    raise exception 'Sumber PDF sudah berubah; publikasi stale ditolak.' using errcode='40001';
  end if;
  update public.document_pdf_jobs set status='done',pdf_url=p_pdf_url,error_message=null,
    updated_at=clock_timestamp(),finished_at=clock_timestamp() where id=p_job_id returning * into v_job;
  update public.surat_registrasi set pdf_path=p_pdf_url,
    status=case when upper(coalesce(status::text,''))='PDF_PENDING' then 'DONE' else status end,
    updated_at=clock_timestamp()
  where id=v_job.surat_id and upper(coalesce(status::text,'')) in ('PDF_PENDING','DONE','SELESAI','COMPLETED');
  if not found then raise exception 'Surat rekomendasi tidak lagi final.' using errcode='40001'; end if;
  return v_job;
end;
$$;

create or replace function public.complete_document_pdf_job(p_job_id uuid,p_pdf_url text,p_lease_token uuid)
returns public.document_pdf_jobs language plpgsql security definer set search_path = '' as $$
declare v_job public.document_pdf_jobs; v_surat public.surat_registrasi%rowtype; v_signature public.surat_signatures%rowtype;
begin
  if nullif(btrim(coalesce(p_pdf_url,'')),'') is null or p_lease_token is null then
    raise exception 'URL PDF dan lease wajib diisi.' using errcode='22023';
  end if;
  select * into v_job from public.document_pdf_jobs where id=p_job_id for update;
  if not found then raise exception 'Job PDF tidak ditemukan.' using errcode='P0002'; end if;
  if v_job.signature_id is null and v_job.recommendation_content_fingerprint is not null then
    raise exception 'Job PDF rekomendasi canonical wajib dipublikasikan melalui publish_document_pdf_job.' using errcode='22023';
  end if;
  if v_job.status='done' then
    if v_job.lease_token=p_lease_token and v_job.pdf_url=p_pdf_url then return v_job; end if;
    raise exception 'Job PDF sudah diselesaikan dengan pointer berbeda.' using errcode='55000';
  end if;
  if v_job.status<>'processing' or v_job.lease_token is distinct from p_lease_token
     or v_job.lease_expires_at is null or v_job.lease_expires_at<=clock_timestamp() then
    raise exception 'Worker tidak memiliki lease job PDF yang aktif.' using errcode='42501';
  end if;
  select * into v_surat from public.surat_registrasi where id=v_job.surat_id for update;
  if not found then raise exception 'Surat sumber PDF tidak ditemukan.' using errcode='P0002'; end if;
  if v_job.signature_id is not null then
    select * into v_signature from public.surat_signatures
    where id=v_job.signature_id and surat_id=v_job.surat_id for update;
    if not found then raise exception 'Tanda tangan sumber PDF tidak ditemukan.' using errcode='P0002'; end if;
    update public.surat_signatures set pdf_path_snap=p_pdf_url,file_path_snap=null where id=v_signature.id;
  else
    update public.surat_registrasi set pdf_path=p_pdf_url,updated_at=clock_timestamp() where id=v_surat.id;
  end if;
  update public.document_pdf_jobs set status='done',pdf_url=p_pdf_url,error_message=null,locked_by=null,locked_at=null,
    updated_at=clock_timestamp(),finished_at=clock_timestamp()
  where id=p_job_id returning * into v_job;
  return v_job;
end;
$$;

create or replace function public.handle_approve_surat_v2(p_sig_id uuid,p_surat_id uuid,p_note text,p_file_path text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_current_step integer; v_signature_step integer; v_total_steps integer;
  v_created_by uuid; v_no_surat text; v_judul_surat text; v_is_done boolean:=false;
  v_verification_required boolean:=false; v_verification_status text:='not_required'; v_surat public.surat_registrasi%rowtype; v_is_recommendation boolean:=false;
begin
  if v_actor is null then raise exception 'Tidak terautentikasi' using errcode='28000'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_actor and p.is_active is true) then
    raise exception 'Profil aktif tidak tersedia.' using errcode='42501';
  end if;
  select sr.* into v_surat from public.surat_registrasi sr where sr.id=p_surat_id and sr.status='PROSES' for update;
  if not found then raise exception 'Surat tidak ditemukan atau sudah selesai'; end if;
  v_current_step:=v_surat.current_step; v_created_by:=v_surat.created_by; v_no_surat:=v_surat.no_surat; v_judul_surat:=v_surat.judul_surat;
  select ss.step_order,ss.verification_required,ss.verification_status into v_signature_step,v_verification_required,v_verification_status
  from public.surat_signatures ss where ss.id=p_sig_id and ss.surat_id=p_surat_id and ss.user_id=v_actor and ss.is_signed=false for update;
  if not found then raise exception 'Tanda tangan tidak tersedia untuk user ini'; end if;
  if v_signature_step<>v_current_step then raise exception 'Tahap tanda tangan belum aktif atau sudah diproses'; end if;
  if v_verification_required and v_verification_status<>'verified' then raise exception 'Data pengajuan belum diperiksa tim pemeriksa'; end if;
  select count(*) into v_total_steps from public.surat_signatures where surat_id=p_surat_id;
  v_is_recommendation:=v_current_step>=v_total_steps and exists(select 1 from public.surat_linked_documents l where l.child_surat_id=p_surat_id and l.link_type='recommendation' and l.status='active');
  update public.surat_signatures set is_signed=true,signed_at=now(),catatan=p_note,file_path_snap=p_file_path,status='APPROVED' where id=p_sig_id;
  if v_current_step>=v_total_steps then
    update public.surat_registrasi set file_path=p_file_path,status=case when v_is_recommendation then 'PDF_PENDING' else 'DONE' end,updated_at=now() where id=p_surat_id;
    v_is_done:=not v_is_recommendation;
  else
    update public.surat_registrasi set file_path=p_file_path,current_step=v_current_step+1,updated_at=now() where id=p_surat_id;
    update public.surat_signatures set available_at=coalesce(available_at,now()) where surat_id=p_surat_id and step_order=v_current_step+1 and is_signed=false;
  end if;
  if v_is_done and v_created_by is not null then insert into public.notifications(user_id,type,title,message,data,link) values
    (v_created_by,'success','Dokumen Selesai Disetujui','Dokumen "'||coalesce(v_judul_surat,'')||'" ('||coalesce(v_no_surat,'')||') telah menyelesaikan seluruh tahap persetujuan.',
     jsonb_build_object('surat_id',p_surat_id,'no_surat',v_no_surat,'judul',v_judul_surat,'file_path',p_file_path),'/surat/monitoring'); end if;
  return json_build_object('success',true,'isDone',v_is_done,'pdfPending',v_is_recommendation);
end;
$$;

drop index if exists public.file_view_tokens_recommendation_logical_idx;
create index if not exists file_view_tokens_recommendation_lookup_idx
on public.file_view_tokens(surat_id,purpose) where purpose='external_marison_recommendation_pdf';

alter table public.file_view_tokens add column if not exists revoked_at timestamptz;
alter table public.file_view_tokens add column if not exists revoked_by uuid;
alter table public.file_view_tokens add column if not exists revoke_reason text;
alter table public.file_view_tokens add column if not exists last_accessed_at timestamptz;

create table if not exists public.file_view_token_audit(
  id bigint generated always as identity primary key, token_id uuid not null references public.file_view_tokens(id), token_hash text not null, surat_id uuid, purpose text not null,
  action text not null check(action in ('created','resolved','revoked')), actor_id uuid, reason text, created_at timestamptz not null default clock_timestamp()
);
alter table public.file_view_token_audit enable row level security;
revoke all on table public.file_view_token_audit from public,anon,authenticated;

create or replace function public.ensure_recommendation_file_view_token(p_token_hash text,p_surat_id uuid,p_bucket text,p_object_path text,p_storage_origin text,p_requested_by uuid)
returns public.file_view_tokens language plpgsql security definer set search_path='' as $$
declare v_token public.file_view_tokens;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Hash token tidak valid.' using errcode='22023'; end if;
  if p_requested_by is null then
    if coalesce(auth.role(),'') <> 'service_role' and session_user <> 'postgres' then raise exception 'Service role is required' using errcode='42501'; end if;
  elsif not exists(select 1 from public.profiles p where p.id=p_requested_by and p.role::text='admin' and p.is_active=true and p.deleted_at is null) then
    raise exception 'Active admin is required' using errcode='42501';
  end if;
  if not public.recommendation_pdf_is_current(p_surat_id) then
    raise exception 'Active final recommendation PDF is required' using errcode='55000';
  end if;
  insert into public.file_view_tokens(token_hash,bucket,object_path,storage_origin,requested_by,surat_id,purpose,expires_at)
  values(p_token_hash,p_bucket,p_object_path,p_storage_origin,p_requested_by,p_surat_id,'external_marison_recommendation_pdf',null)
  on conflict(token_hash) do nothing;
  select * into v_token from public.file_view_tokens where token_hash=p_token_hash;
  if v_token.id is null or v_token.surat_id is distinct from p_surat_id
     or v_token.purpose is distinct from 'external_marison_recommendation_pdf' or v_token.revoked_at is not null then
    raise exception 'Hash token sudah digunakan atau token rekomendasi sudah dicabut.' using errcode='55000';
  end if;
  insert into public.file_view_token_audit(token_id,token_hash,surat_id,purpose,action,actor_id)
  select v_token.id,v_token.token_hash,p_surat_id,v_token.purpose,'created',p_requested_by
  where not exists(select 1 from public.file_view_token_audit a where a.token_hash=v_token.token_hash and a.action='created');
  return v_token;
end;
$$;

create or replace function public.revoke_recommendation_file_view_token(p_surat_id uuid,p_reason text,p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_token public.file_view_tokens; v_revoked boolean:=false;
begin
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Alasan pencabutan wajib diisi.' using errcode='22023'; end if;
  if p_actor is null then
    if coalesce(auth.role(),'') <> 'service_role' and session_user <> 'postgres' then raise exception 'Service role is required' using errcode='42501'; end if;
  elsif not exists(select 1 from public.profiles p where p.id=p_actor and p.role::text='admin' and p.is_active=true and p.deleted_at is null) then
    raise exception 'Active admin is required' using errcode='42501';
  end if;
  for v_token in update public.file_view_tokens set revoked_at=clock_timestamp(),revoked_by=p_actor,revoke_reason=p_reason
    where surat_id=p_surat_id and purpose='external_marison_recommendation_pdf' and revoked_at is null returning * loop
    v_revoked:=true;
    insert into public.file_view_token_audit(token_id,token_hash,surat_id,purpose,action,actor_id,reason)
    values(v_token.id,v_token.token_hash,p_surat_id,'external_marison_recommendation_pdf','revoked',p_actor,p_reason);
  end loop;
  return v_revoked;
end;
$$;

drop function if exists public.consume_file_view_token(text);
create function public.consume_file_view_token(p_token_hash text)
returns table(token_id uuid,surat_id uuid,bucket text,object_path text,storage_origin text)
language plpgsql security definer set search_path = '' as $$
declare v_token public.file_view_tokens%rowtype;
begin
  select fvt.* into v_token from public.file_view_tokens fvt
  where fvt.token_hash=p_token_hash and fvt.revoked_at is null and (fvt.expires_at is null or fvt.expires_at>now())
    and (fvt.consumed_at is null or fvt.purpose in ('email','external_marison','external_marison_recommendation_pdf'))
  order by fvt.created_at desc limit 1;
  if not found then return; end if;
  if v_token.purpose not in ('email','external_marison','external_marison_recommendation_pdf') then
    update public.file_view_tokens fvt set consumed_at=now() where fvt.token_hash=p_token_hash;
  end if;
  if v_token.purpose='external_marison_recommendation_pdf' then
    select current_ref.bucket,current_ref.object_path,current_ref.storage_origin
      into v_token.bucket,v_token.object_path,v_token.storage_origin
    from public.surat_linked_documents l
    join public.surat_registrasi child on child.id=l.child_surat_id
    cross join lateral (select
      case when split_part(child.pdf_path,'/',1) in ('dokumen_surat','lampiran_surat') then split_part(child.pdf_path,'/',1) else v_token.bucket end as bucket,
      case when split_part(child.pdf_path,'/',1) in ('dokumen_surat','lampiran_surat') then substring(child.pdf_path from position('/' in child.pdf_path)+1) else child.pdf_path end as object_path,
      v_token.storage_origin) current_ref
    where child.id=v_token.surat_id and l.link_type='recommendation' and l.status='active'
      and public.recommendation_pdf_is_current(child.id)
    for share of child,l;
    if not found then return; end if;
    update public.file_view_tokens set last_accessed_at=clock_timestamp() where id=v_token.id;
    insert into public.file_view_token_audit(token_id,token_hash,surat_id,purpose,action)
    values(v_token.id,v_token.token_hash,v_token.surat_id,v_token.purpose,'resolved');
  end if;
  token_id:=v_token.id; surat_id:=v_token.surat_id; bucket:=v_token.bucket; object_path:=v_token.object_path; storage_origin:=v_token.storage_origin; return next;
end;
$$;

drop function if exists public.mark_marison_outbound_post_started(uuid,uuid);
create function public.mark_marison_outbound_post_started(p_job_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job public.marison_outbound_dispatches%rowtype;
begin
  if p_lease_token is null then raise exception 'Lease token is required' using errcode='22023'; end if;
  select * into v_job from public.marison_outbound_dispatches where id=p_job_id for update;
  if not found or v_job.status<>'processing' or v_job.lease_token is distinct from p_lease_token
     or v_job.lease_expires_at<=clock_timestamp() or v_job.post_started_at is not null
     or v_job.payload is null or v_job.payload_body is null or v_job.payload_hash is null then
    raise exception 'Stale lease or payload is not prepared' using errcode='55000';
  end if;
  if v_job.kind='asset' and public.recommendation_all_items_rejected(v_job.surat_id) then
    update public.marison_outbound_dispatches set status='skipped',skipped_code='all_recommendations_rejected',
      skipped_reason='Seluruh parent rekomendasi aset ditolak sebelum POST; dispatch sengaja dilewati.',completed_at=clock_timestamp(),
      lease_token=null,lease_acquired_at=null,lease_expires_at=null,updated_at=clock_timestamp() where id=p_job_id;
    return jsonb_build_object('post_started',false,'skipped',true,'code','all_recommendations_rejected');
  end if;
  update public.marison_outbound_dispatches set post_started_at=clock_timestamp(),last_attempt_at=clock_timestamp(),
    lease_acquired_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() where id=p_job_id;
  return jsonb_build_object('post_started',true,'skipped',false,'code',null);
end;
$$;

revoke all on function public.validate_recommendation_items(jsonb,boolean) from public,anon,authenticated;
revoke all on function public.complete_recommendation_task(uuid,uuid) from public,anon;
revoke all on function public.finalize_recommendation_revision_if_needed(uuid) from public,anon;
revoke all on function public.finalize_recommendation_revision_internal(uuid) from public,anon,authenticated,service_role;
revoke all on function public.finalize_recommendation_on_child_completion() from public,anon,authenticated;
revoke all on function public.guard_parent_approval_for_recommendation() from public,anon,authenticated;
revoke all on function public.guard_parent_signature_for_recommendation() from public,anon,authenticated;
revoke all on function public.recommendation_pdf_is_current(uuid) from public,anon,authenticated;
revoke all on function public.guard_recommendation_child_final_status() from public,anon,authenticated;
revoke all on function public.recommendation_pdf_render_payload(uuid,text) from public,anon,authenticated;
revoke all on function public.recommendation_content_fingerprint(jsonb) from public,anon,authenticated;
revoke all on function public.enqueue_recommendation_pdf_on_status() from public,anon,authenticated;
revoke all on function public.enqueue_recommendation_pdf_job(uuid,text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.claim_document_pdf_jobs(text,integer,integer,interval) from public,anon,authenticated;
revoke all on function public.fail_document_pdf_job(uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.publish_document_pdf_job(uuid,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.complete_document_pdf_job(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.ensure_recommendation_file_view_token(text,uuid,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.revoke_recommendation_file_view_token(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.mark_marison_outbound_post_started(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_recommendation_task(uuid,uuid) to authenticated,service_role;
grant execute on function public.finalize_recommendation_revision_if_needed(uuid) to authenticated,service_role;
grant execute on function public.enqueue_recommendation_pdf_job(uuid,text,uuid,boolean) to service_role;
grant execute on function public.claim_document_pdf_jobs(text,integer,integer,interval) to service_role;
grant execute on function public.fail_document_pdf_job(uuid,uuid,text,integer) to service_role;
grant execute on function public.publish_document_pdf_job(uuid,text,text,text,uuid) to service_role;
grant execute on function public.complete_document_pdf_job(uuid,text,uuid) to service_role;
grant execute on function public.ensure_recommendation_file_view_token(text,uuid,text,text,text,uuid) to service_role;
grant execute on function public.revoke_recommendation_file_view_token(uuid,text,uuid) to service_role;
grant execute on function public.mark_marison_outbound_post_started(uuid,uuid) to service_role;
revoke all on function public.consume_file_view_token(text) from public,anon,authenticated;
grant execute on function public.consume_file_view_token(text) to service_role;
revoke all on function public.handle_approve_surat_v2(uuid,uuid,text,text) from public,anon;
grant execute on function public.handle_approve_surat_v2(uuid,uuid,text,text) to authenticated,service_role;
