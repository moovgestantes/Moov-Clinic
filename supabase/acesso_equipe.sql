begin;

alter policy "Physician visits" on public.clinic_visits
using (exists(select 1 from public.clinic_members))
with check (exists(select 1 from public.clinic_members));

alter policy "Clinic members use tasks" on public.clinic_tasks
using (exists(select 1 from public.clinic_members))
with check (exists(select 1 from public.clinic_members));

create or replace function public.clinic_guard_exam_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived_at is distinct from old.archived_at and not exists (
    select 1 from public.clinic_members where user_id = (select auth.uid())
  ) then
    raise exception 'Somente a equipe pode excluir ou restaurar anexos.' using errcode = '42501';
  end if;
  return new;
end;
$$;

grant update (filename) on public.clinic_attachments to authenticated;

commit;
