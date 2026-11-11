begin;

alter table public.clinic_tasks
  add column if not exists checklist jsonb not null default '[]'::jsonb
  check (jsonb_typeof(checklist) = 'array');

grant insert (checklist), update (checklist) on public.clinic_tasks to authenticated;

notify pgrst, 'reload schema';

commit;
