begin;
alter table public.clinic_attachments add column if not exists exam_date date;
grant insert (exam_date), update (exam_date) on public.clinic_attachments to authenticated;
commit;
