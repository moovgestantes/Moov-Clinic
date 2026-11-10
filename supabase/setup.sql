begin;

create table public.clinic_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null unique check (name in ('Bia', 'Dra. Mayara'))
);

create table public.clinic_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 160),
  notes text not null default '' check (length(notes) <= 4000),
  assignee text references public.clinic_members(name) on delete set null,
  priority text not null default 'media' check (priority in ('baixa', 'media', 'alta')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index clinic_tasks_created_idx on public.clinic_tasks (created_at desc, id);

create table public.clinic_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.clinic_tasks(id),
  object_path text not null unique check (object_path = task_id::text || '/' || id::text),
  filename text not null check (length(filename) between 1 and 240),
  mime text not null check (mime in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  kind text not null check (kind in ('documento', 'exame')),
  extraction text not null check (extraction in ('none', 'text', 'ocr', 'manual')),
  findings jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array' and jsonb_array_length(findings) <= 100),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index clinic_attachments_task_idx on public.clinic_attachments(task_id);

alter table public.clinic_members enable row level security;
alter table public.clinic_tasks enable row level security;
alter table public.clinic_attachments enable row level security;
revoke all on public.clinic_members, public.clinic_tasks, public.clinic_attachments from anon, authenticated;
grant select on public.clinic_members to authenticated;
grant select on public.clinic_tasks, public.clinic_attachments to authenticated;
grant insert (title, notes, assignee, priority) on public.clinic_tasks to authenticated;
grant update (title, notes, assignee, priority, completed_at) on public.clinic_tasks to authenticated;
grant insert (id, task_id, object_path, filename, mime, kind, extraction, findings) on public.clinic_attachments to authenticated;
grant update (findings, reviewed_at) on public.clinic_attachments to authenticated;

create policy "Own clinic membership" on public.clinic_members for select to authenticated
using (user_id = (select auth.uid()));
create policy "Clinic members use tasks" on public.clinic_tasks for all to authenticated
using (exists (select 1 from public.clinic_members)) with check (exists (select 1 from public.clinic_members));
create policy "Clinic members use attachments" on public.clinic_attachments for all to authenticated
using (exists (select 1 from public.clinic_members)) with check (exists (select 1 from public.clinic_members));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('moov-clinic-private','moov-clinic-private',false,12582912,array['application/pdf','image/png','image/jpeg','image/webp']);
create policy "MOOV clinic upload" on storage.objects for insert to authenticated
with check (bucket_id = 'moov-clinic-private'
  and exists (select 1 from public.clinic_members)
  and exists (select 1 from public.clinic_tasks where id::text = split_part(name,'/',1)));
create policy "MOOV clinic read" on storage.objects for select to authenticated
using (bucket_id = 'moov-clinic-private' and exists (select 1 from public.clinic_members));
create policy "MOOV clinic cleanup of unattached files" on storage.objects for delete to authenticated
using (bucket_id = 'moov-clinic-private' and exists (select 1 from public.clinic_members)
  and not exists (select 1 from public.clinic_attachments where object_path = storage.objects.name));

commit;
