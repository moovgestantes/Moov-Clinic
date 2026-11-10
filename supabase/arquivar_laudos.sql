begin;

alter table public.clinic_attachments add column if not exists archived_at timestamptz;

create or replace function public.clinic_guard_exam_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived_at is distinct from old.archived_at and (
    old.kind <> 'exame' or not exists (
      select 1 from public.clinic_members
      where user_id = (select auth.uid()) and name = 'Dra. Mayara'
    )
  ) then
    raise exception 'Somente a médica pode arquivar ou restaurar um laudo.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists clinic_guard_exam_archive on public.clinic_attachments;
create trigger clinic_guard_exam_archive
before update of archived_at on public.clinic_attachments
for each row execute function public.clinic_guard_exam_archive();
revoke execute on function public.clinic_guard_exam_archive() from public, anon, authenticated;

grant update (archived_at) on public.clinic_attachments to authenticated;
revoke delete on public.clinic_attachments from authenticated, anon, public;
drop policy if exists "Physician may delete exam files" on storage.objects;

commit;
