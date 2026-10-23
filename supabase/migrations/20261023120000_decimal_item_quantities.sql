-- SUR-37: positive decimal item measurements; building counts and money stay integral.
-- Existing rows, signatures, history and permissions are not rewritten.
begin;

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
         or (v_parent#>>'{applicant_original,quantity}')::numeric > 9007199254740991
         or (v_parent#>>'{applicant_original,quantity}') !~ '^[0-9]+(\.[0-9]{1,6})?$'
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
           or (v_detail->>'quantity')::numeric > 9007199254740991
           or (v_detail->>'quantity') !~ '^[0-9]+(\.[0-9]{1,6})?$' then
          raise exception 'Quantity detail wajib angka positif, maksimal 6 desimal.' using errcode = '22023';
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
          v_number := replace(coalesce(v_detail->>'quantity', v_detail->>'jumlah'), ',', '.')::numeric;
          if v_number is null or v_number <= 0 or v_number > 9007199254740991
             or replace(coalesce(v_detail->>'quantity', v_detail->>'jumlah'), ',', '.') !~ '^[0-9]+(\.[0-9]{1,6})?$' then raise exception using errcode = '22023'; end if;
        exception when others then
          raise exception 'Quantity rekomendasi legacy wajib angka positif, maksimal 6 desimal.' using errcode = '22023';
        end;
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.normalize_keu10_input(p_input jsonb, p_config jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_row jsonb; v_items jsonb := '[]'; v_qty numeric; v_price numeric;
  v_total numeric := 0; v_line numeric; v_id text; v_ids text[] := '{}';
begin
  if not public.is_valid_keu10_config(p_config) or p_config is null
     or jsonb_typeof(p_input) is distinct from 'object'
     or not exists (select 1 from jsonb_array_elements(p_config->'purposes') purpose
       where purpose->>'code' = p_input->>'keu10_purpose_code') then
    raise exception 'KEU10 purpose/configuration is invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_input->'items') is distinct from 'array' then
    raise exception 'KEU10 items must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_input->'items') not between 1 and 100 then
    raise exception 'KEU10 requires 1 to 100 items' using errcode = '22023';
  end if;
  for v_row in select value from jsonb_array_elements(p_input->'items') loop
    if jsonb_typeof(v_row) <> 'object'
       or jsonb_typeof(v_row->'keterangan') is distinct from 'string'
       or length(btrim(v_row->>'keterangan')) not between 1 and 240
       or jsonb_typeof(v_row->'satuan') is distinct from 'string'
       or length(btrim(v_row->>'satuan')) not between 1 and 80
       or coalesce(v_row->>'jumlah','') !~ '^[0-9]{1,16}([.,][0-9]{1,6})?$'
       or coalesce(v_row->>'estimasi_harga_satuan','') !~ '^[0-9]{1,16}$' then
      raise exception 'KEU10 item description/unit/quantity/price is invalid' using errcode = '22023';
    end if;
    v_qty := replace(v_row->>'jumlah', ',', '.')::numeric;
    v_price := (v_row->>'estimasi_harga_satuan')::numeric;
    v_line := round(v_qty * v_price); v_total := v_total + v_line;
    if v_qty <= 0 or v_qty > 9007199254740991 or v_price > 9007199254740991
       or v_line > 9007199254740991 or v_total > 9007199254740991 then
      raise exception 'KEU10 amount exceeds safe integer bounds' using errcode = '22023';
    end if;
    v_id := nullif(btrim(v_row->>'id'), '');
    if v_id is not null and (length(v_id) > 100 or v_id = any(v_ids)) then
      raise exception 'KEU10 item IDs must be unique and bounded' using errcode = '22023';
    end if;
    if v_id is not null then v_ids := array_append(v_ids, v_id); end if;
    v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id',v_id,'keterangan',btrim(v_row->>'keterangan'),'jumlah',v_qty,
      'satuan',btrim(v_row->>'satuan'),'estimasi_harga_satuan',v_price,'total',v_line)));
  end loop;
  if v_total <= 0 then
    raise exception 'KEU10 Grand Total must be positive' using errcode='22023';
  end if;
  return (p_input - array['free_cash','free_cash_previous_month','keu1_free_cash',
    'keu1_free_cash_previous_month','fund_needed','kebutuhan_dana','fund_without_project',
    'status','item_status','grand_total','fund_amount','fund_type'])
    || jsonb_build_object('items',v_items,'fund_amount',v_total,'grand_total',v_total,'fund_type','operational');
end $$;

notify pgrst, 'reload schema';
commit;
