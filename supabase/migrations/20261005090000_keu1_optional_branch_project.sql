-- KEU 1 Cabang may use an own-office project; headquarters remains project-free.
-- Preserve existing reservation, scope, entity and actor validation verbatim.
begin;
do $patch$
declare
  v_definition text := replace(pg_get_functiondef('public.enforce_surat_registration_branch_project()'::regprocedure), E'\r\n', E'\n');
  v_old text := $body$if v_is_keu1 and new.project_id is not null then
    raise exception 'Form KEU 1 tidak menggunakan proyek.' using errcode = '22023';
  end if;$body$;
  v_new text := $body$if v_is_keu1 and new.project_id is not null then
    if v_kedudukan = 'Pusat' then
      raise exception 'Kas kecil kantor pusat tidak menggunakan proyek.' using errcode = '22023';
    end if;
    if v_marker->>'fund_without_project' is distinct from 'false' then
      raise exception 'Kas kecil dengan proyek tidak boleh memakai penanda tanpa proyek.' using errcode = '22023';
    end if;
  end if;$body$;
begin
  if position(v_old in v_definition) > 0 then
    execute replace(v_definition, v_old, v_new);
  elsif position(v_new in v_definition) = 0 then
    raise exception 'Unknown KEU 1 project guard; review before applying.';
  end if;
end;
$patch$;
commit;
