begin;

create table public.clinic_patients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  birth_date date,
  phone text not null default '' check (length(phone) <= 40),
  created_at timestamptz not null default now()
);
create table public.clinic_visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.clinic_patients(id),
  visit_date date not null,
  reason text not null check (length(trim(reason)) between 1 and 160),
  anamnesis text not null default '' check (length(anamnesis) <= 30000),
  plan text not null default '' check (length(plan) <= 15000),
  transcript text not null default '' check (length(transcript) <= 60000),
  created_at timestamptz not null default now()
);
create index clinic_visits_patient_idx on public.clinic_visits(patient_id,visit_date desc);
alter table public.clinic_tasks add column patient_id uuid references public.clinic_patients(id);
create index clinic_tasks_patient_idx on public.clinic_tasks(patient_id);
alter table public.clinic_patients enable row level security;
alter table public.clinic_visits enable row level security;
revoke all on public.clinic_patients,public.clinic_visits from anon,authenticated;
grant select on public.clinic_patients,public.clinic_visits to authenticated;
grant insert (name,birth_date,phone), update (name,birth_date,phone) on public.clinic_patients to authenticated;
grant insert (patient_id,visit_date,reason,anamnesis,plan,transcript), update (visit_date,reason,anamnesis,plan,transcript) on public.clinic_visits to authenticated;
grant insert (patient_id) on public.clinic_tasks to authenticated;

create policy "Clinic directory" on public.clinic_patients for all to authenticated
using (exists(select 1 from public.clinic_members))
with check (exists(select 1 from public.clinic_members));
create policy "Physician visits" on public.clinic_visits for all to authenticated
using (exists(select 1 from public.clinic_members where name='Dra. Mayara'))
with check (exists(select 1 from public.clinic_members where name='Dra. Mayara'));

alter policy "Clinic members use tasks" on public.clinic_tasks
using (exists(select 1 from public.clinic_members where clinic_tasks.patient_id is null or name='Dra. Mayara'))
with check (exists(select 1 from public.clinic_members where clinic_tasks.patient_id is null or name='Dra. Mayara'));

alter policy "Clinic members use attachments" on public.clinic_attachments
using (exists(select 1 from public.clinic_tasks where id=clinic_attachments.task_id))
with check (exists(select 1 from public.clinic_tasks where id=clinic_attachments.task_id));

alter policy "MOOV clinic read" on storage.objects using (
  bucket_id='moov-clinic-private'
  and exists(select 1 from public.clinic_tasks where id::text=split_part(storage.objects.name,'/',1))
);
alter policy "MOOV clinic cleanup of unattached files" on storage.objects using (
  bucket_id='moov-clinic-private'
  and exists(select 1 from public.clinic_tasks where id::text=split_part(storage.objects.name,'/',1))
  and not exists(select 1 from public.clinic_attachments where object_path=storage.objects.name)
);

commit;
