begin;

alter table public.clinic_attachments
  add column if not exists exam_modality text not null default 'laboratorial'
  check (exam_modality in ('laboratorial','ultrassom'));
grant insert (exam_modality) on public.clinic_attachments to authenticated;
grant update (patient_id) on public.clinic_tasks to authenticated;

create or replace function public.clinic_protect_task_patient()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.patient_id is not null and new.patient_id is distinct from old.patient_id then
    raise exception 'O paciente de uma pendência clínica vinculada não pode ser trocado.';
  end if;
  return new;
end;
$$;

drop trigger if exists clinic_protect_task_patient on public.clinic_tasks;
create trigger clinic_protect_task_patient
before update of patient_id on public.clinic_tasks
for each row execute function public.clinic_protect_task_patient();
revoke execute on function public.clinic_protect_task_patient() from public, anon, authenticated;

commit;
