create publication supabase_realtime;
alter table public.surat_attachments enable row level security;
alter table public.surat_revision_events add column actor_id uuid;
alter table public.surat_revision_events enable row level security;
create table public.surat_linked_documents(id uuid primary key);
create table public.surat_recommendation_tasks(id uuid primary key);
create table public.activity_logs(id uuid primary key);
alter table public.surat_linked_documents enable row level security;
alter table public.surat_recommendation_tasks enable row level security;
alter table public.activity_logs enable row level security;

-- Legacy verifier is present in deployed databases; assert its bypass is closed.
create function public.verify_surat_signature(p_sig_id uuid,p_note text default null)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.surat_signatures set verification_status='verified' where id=p_sig_id;
  return true;
end $$;

insert into public.profiles(id,full_name,job_title,office_id,department_id)
values('48400000-0000-4000-8000-000000000001','Usman Huda','Staff HRD & GA',
  '20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');
insert into public.master_forms(id,nama_form,nomor_form)
values('48400000-0000-4000-8000-000000000002','Form PGD',' FM-UAI.PGD-01-00');
insert into public.form_usages(id,form_id,name,request_category,scope_type,status)
values('48400000-0000-4000-8000-000000000003','48400000-0000-4000-8000-000000000002','Pengajuan Dana - Kantor Pusat','non_asset','pusat','active');
insert into public.form_usage_steps(id,usage_id,step_order,role_name,label,signer_department_id,action_type,candidate_scope)
values('48400000-0000-4000-8000-000000000004','48400000-0000-4000-8000-000000000003',1,'memeriksa','Mgr. HRD & GA',
  '30000000-0000-4000-8000-000000000002','approval','head_office');
insert into public.form_usage_step_users values('48400000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000007');
