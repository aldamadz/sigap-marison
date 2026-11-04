begin;

-- Keep the original exact-snapshot gate as the primary path and rollback reference.
do $$
begin
  if to_regprocedure('unit_allocation_internal.has_valid_review_pre_external_addendum(uuid,jsonb)') is null then
    if to_regprocedure('unit_allocation_internal.has_valid_review(uuid,jsonb)') is null then
      raise exception 'Partial Unit review prerequisite missing';
    end if;
    alter function unit_allocation_internal.has_valid_review(uuid,jsonb)
      rename to has_valid_review_pre_external_addendum;
  end if;
end $$;

create or replace function unit_allocation_internal.without_addendum_values(p_units jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select case when jsonb_typeof(p_units)='array' then (
    select coalesce(jsonb_agg(jsonb_set(u.value,'{allocation_detail}',
      (u.value->'allocation_detail')-'struktur_atas'-'struktur_bawah') order by u.ordinality),'[]'::jsonb)
    from jsonb_array_elements(p_units) with ordinality u(value,ordinality)
  ) end
$$;

create or replace function unit_allocation_internal.has_preserved_external_addendum_review(p_surat_id uuid,p_input jsonb)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.surat_registrasi d
    join public.surat_unit_allocation_history h on h.surat_id=d.id
    join public.surat_signatures s on s.id=h.signature_id and s.surat_id=h.surat_id
    join public.surat_revision_events e on e.surat_id=d.id
      and e.id::text=d.data_snapshot#>>'{external_revision_current,revision_event_id}'
    join public.external_submission_decision_events decision on decision.surat_id=d.id
      and decision.id::text=e.changes->>'external_decision_event_id'
      and decision.event_id::text=e.changes->>'external_event_id'
    join public.surat_external_revision_history archive on archive.surat_id=d.id
      and archive.decision_event_id=decision.id and archive.generation=decision.revision_generation
    where d.id=p_surat_id and d.form_input_data=p_input
      and d.status in ('PROSES','SELESAI','DONE')
      and lower(coalesce(p_input->>'request_mode',p_input->>'request_category',''))='unit'
      and e.status='resolved' and e.resolved_by is not null and e.resolved_at is not null
      and e.changes->>'external_submission_revision'='true'
      and decision.decision='revision_required'
      and archive.generation::text=e.changes->>'revision_generation'
      and archive.generation::text=d.data_snapshot#>>'{external_revision_current,generation}'
      and coalesce(e.changes->>'restart_step','') ~ '^[1-9][0-9]{0,3}$'
      and s.step_order < case when coalesce(e.changes->>'restart_step','') ~ '^[1-9][0-9]{0,3}$'
        then (e.changes->>'restart_step')::integer else 0 end
      and not exists(select 1 from public.external_submission_decision_events later
        where later.surat_id=d.id and later.decision='revision_required' and later.revision_generation>archive.generation)
      and s.verification_status='verified' and s.is_signed is true
      and s.verified_by=h.actor_id and s.verified_at=h.verified_at
      and nullif(trim(s.verification_note),'') is not distinct from h.note
      and length(trim(coalesce(h.note,'')))>=5
      and h.allocated_count<h.requested_count
      and h.requested_count::text=p_input->>'requested_unit_count'
      and h.allocated_count=jsonb_array_length(case when jsonb_typeof(p_input->'allocated_units')='array'
        then p_input->'allocated_units' else '[]'::jsonb end)
      and h.request_snapshot=jsonb_build_object('requested_project',p_input->'requested_project',
        'requested_unit_count',p_input->'requested_unit_count')
      and h.allocation_snapshot->'allocated_project'=p_input->'allocated_project'
      and h.allocation_snapshot->'allocated_by_signature_id'=p_input->'allocated_by_signature_id'
      -- Everything except these two financial fields remains part of the receipt.
      and unit_allocation_internal.without_addendum_values(h.allocation_snapshot->'allocated_units')
        =unit_allocation_internal.without_addendum_values(p_input->'allocated_units')
      and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p_input->'allocated_units')='array'
          then p_input->'allocated_units' else '[]'::jsonb end) u(value)
        where jsonb_typeof(u.value->'allocation_detail') is distinct from 'object'
          or coalesce(u.value#>>'{allocation_detail,struktur_atas}','') !~ '^([0-9]{1,15})?$'
          or coalesce(u.value#>>'{allocation_detail,struktur_bawah}','') !~ '^([0-9]{1,15})?$')
      -- The corrected allocation must already exist in the immutable external
      -- version; this is not permission to edit financial fields after resubmission.
      and archive.document_snapshot#>'{form_input_data,allocated_units}'=p_input->'allocated_units'
      and archive.document_snapshot#>'{form_input_data,allocated_project}'=p_input->'allocated_project'
      and archive.document_snapshot#>'{form_input_data,allocated_by_signature_id}'=p_input->'allocated_by_signature_id'
      and archive.document_snapshot#>'{form_input_data,requested_project}'=p_input->'requested_project'
      and archive.document_snapshot#>'{form_input_data,requested_unit_count}'=p_input->'requested_unit_count'
      and exists(select 1 from jsonb_array_elements(archive.signatures_snapshot) preserved(value)
        where preserved.value->>'id'=s.id::text and preserved.value->>'is_signed'='true'
          and preserved.value->>'verification_status'='verified'
          and preserved.value->>'verified_by'=h.actor_id::text
          and preserved.value->'verified_at'=to_jsonb(h.verified_at)
          and nullif(trim(preserved.value->>'verification_note'),'') is not distinct from h.note)
  )
$$;

create or replace function unit_allocation_internal.has_valid_review(p_surat_id uuid,p_input jsonb)
returns boolean language sql stable security definer set search_path='' as $$
  select unit_allocation_internal.has_valid_review_pre_external_addendum(p_surat_id,p_input)
    or unit_allocation_internal.has_preserved_external_addendum_review(p_surat_id,p_input)
$$;

revoke all on function unit_allocation_internal.without_addendum_values(jsonb),
  unit_allocation_internal.has_preserved_external_addendum_review(uuid,jsonb),
  unit_allocation_internal.has_valid_review(uuid,jsonb),
  unit_allocation_internal.has_valid_review_pre_external_addendum(uuid,jsonb)
  from public,anon,authenticated,service_role;
grant usage on schema unit_allocation_internal to postgres;
grant execute on function unit_allocation_internal.without_addendum_values(jsonb),
  unit_allocation_internal.has_preserved_external_addendum_review(uuid,jsonb),
  unit_allocation_internal.has_valid_review(uuid,jsonb),
  unit_allocation_internal.has_valid_review_pre_external_addendum(uuid,jsonb) to postgres;

notify pgrst,'reload schema';
commit;
