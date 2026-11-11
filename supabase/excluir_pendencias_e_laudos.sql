begin;

create table if not exists public.clinic_file_deletions (
  object_path text primary key
);
alter table public.clinic_file_deletions enable row level security;
revoke all on public.clinic_file_deletions from public, anon, authenticated;
grant select on public.clinic_file_deletions to authenticated;

drop policy if exists "Clinic members see pending file deletions" on public.clinic_file_deletions;
create policy "Clinic members see pending file deletions"
on public.clinic_file_deletions for select to authenticated
using (exists (select 1 from public.clinic_members m where m.user_id = (select auth.uid())));

drop policy if exists "MOOV clinic read files pending deletion" on storage.objects;
create policy "MOOV clinic read files pending deletion" on storage.objects for select to authenticated
using (bucket_id = 'moov-clinic-private' and exists (
  select 1 from public.clinic_file_deletions d where d.object_path = storage.objects.name
));

drop policy if exists "MOOV clinic remove files pending deletion" on storage.objects;
create policy "MOOV clinic remove files pending deletion" on storage.objects for delete to authenticated
using (bucket_id = 'moov-clinic-private' and exists (
  select 1 from public.clinic_file_deletions d where d.object_path = storage.objects.name
));

-- Permit cleanup of an incomplete upload by its uploader even if its task was deleted.
drop policy if exists "MOOV clinic read own incomplete uploads" on storage.objects;
create policy "MOOV clinic read own incomplete uploads" on storage.objects for select to authenticated
using (
  bucket_id = 'moov-clinic-private' and owner_id = (select auth.uid())::text
  and exists (select 1 from public.clinic_members)
  and not exists (select 1 from public.clinic_attachments a where a.object_path = storage.objects.name)
);
drop policy if exists "MOOV clinic delete own incomplete uploads" on storage.objects;
create policy "MOOV clinic delete own incomplete uploads" on storage.objects for delete to authenticated
using (
  bucket_id = 'moov-clinic-private' and owner_id = (select auth.uid())::text
  and exists (select 1 from public.clinic_members)
  and not exists (select 1 from public.clinic_attachments a where a.object_path = storage.objects.name)
);

create or replace function public.clinic_delete_records(target_task uuid, target_attachment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.clinic_members m where m.user_id = (select auth.uid())) then
    raise exception 'Acesso da equipe necessário.' using errcode = '42501';
  end if;
  if (target_task is null) = (target_attachment is null) then
    raise exception 'Informe uma pendência ou um anexo.' using errcode = '22023';
  end if;
  if target_task is not null then
    perform 1 from public.clinic_tasks t where t.id = target_task for update;
  end if;

  with removed as (
    delete from public.clinic_attachments a
    where a.task_id = target_task or a.id = target_attachment
    returning a.object_path
  )
  insert into public.clinic_file_deletions (object_path)
  select object_path from removed on conflict do nothing;

  if target_task is not null then
    delete from public.clinic_tasks t where t.id = target_task;
  end if;
end;
$$;

create or replace function public.clinic_confirm_file_deletions(paths text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if not exists (select 1 from public.clinic_members m where m.user_id = (select auth.uid())) then
    raise exception 'Acesso da equipe necessário.' using errcode = '42501';
  end if;
  delete from public.clinic_file_deletions d
  where d.object_path = any(paths) and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'moov-clinic-private' and o.name = d.object_path
  );
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.clinic_delete_records(uuid,uuid) from public, anon;
revoke all on function public.clinic_confirm_file_deletions(text[]) from public, anon;
grant execute on function public.clinic_delete_records(uuid,uuid) to authenticated;
grant execute on function public.clinic_confirm_file_deletions(text[]) to authenticated;

notify pgrst, 'reload schema';

commit;
