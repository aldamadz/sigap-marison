begin;

-- KEU does not offer the PGD fund-type choice. Preserve the vendor contract
-- with a server-authored internal type, including confirmation/revision paths.
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
       or coalesce(v_row->>'jumlah','') !~ '^[0-9]{1,16}$'
       or coalesce(v_row->>'estimasi_harga_satuan','') !~ '^[0-9]{1,16}$' then
      raise exception 'KEU10 item description/unit/quantity/price is invalid' using errcode = '22023';
    end if;
    v_qty := (v_row->>'jumlah')::numeric;
    v_price := (v_row->>'estimasi_harga_satuan')::numeric;
    v_line := v_qty * v_price; v_total := v_total + v_line;
    if v_qty < 1 or v_qty > 9007199254740991 or v_price > 9007199254740991
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

-- No stored document, frozen PDF payload, signature or historical snapshot is rewritten.
notify pgrst, 'reload schema';
commit;
