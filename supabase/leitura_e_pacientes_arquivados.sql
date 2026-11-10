begin;

alter table public.clinic_attachments add column if not exists read_at timestamptz;
alter table public.clinic_patients add column if not exists archived_at timestamptz;

grant update (read_at) on public.clinic_attachments to authenticated;
grant update (archived_at) on public.clinic_patients to authenticated;

notify pgrst, 'reload schema';

commit;
