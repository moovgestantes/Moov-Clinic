begin;

create or replace function public.clinic_register_patient_from_exam(
  task_id uuid, patient_name text, patient_birth_date date
)
returns public.clinic_patients
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.clinic_tasks;
  patient public.clinic_patients;
  clean_name text := regexp_replace(btrim(patient_name), '[[:space:]]+', ' ', 'g');
  normalized_name text := translate(lower(clean_name), 'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
begin
  if not exists (select 1 from public.clinic_members where user_id = (select auth.uid())) then
    raise exception 'Acesso da equipe necessário.' using errcode = '42501';
  end if;

  select t.* into target
  from public.clinic_tasks t where t.id = clinic_register_patient_from_exam.task_id
  for update;

  if not found or target.patient_id is not null then
    raise exception 'A pendência não está disponível para um novo vínculo.';
  end if;

  if (select count(*) from public.clinic_attachments a
      where a.task_id = target.id and a.kind = 'exame' and a.archived_at is null) <> 1 then
    raise exception 'O cadastro pelo laudo exige uma pendência com um único exame ativo.';
  end if;

  if clean_name is null or length(clean_name) < 2 or length(clean_name) > 160
     or patient_birth_date > current_date then
    raise exception 'Confira o nome e a data de nascimento.';
  end if;

  perform pg_advisory_xact_lock(hashtext(normalized_name));
  if exists (
    select 1 from public.clinic_patients p
    where translate(lower(regexp_replace(btrim(p.name), '[[:space:]]+', ' ', 'g')),
                    'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') = normalized_name
      and (p.birth_date is null or patient_birth_date is null or p.birth_date = patient_birth_date)
  ) then
    raise exception 'Já existe um cadastro compatível. Confira os pacientes ativos e arquivados.';
  end if;

  insert into public.clinic_patients (name, birth_date)
  values (clean_name, patient_birth_date)
  returning * into patient;

  update public.clinic_tasks set patient_id = patient.id where id = target.id;
  return patient;
end;
$$;

revoke all on function public.clinic_register_patient_from_exam(uuid,text,date) from public, anon;
grant execute on function public.clinic_register_patient_from_exam(uuid,text,date) to authenticated;

notify pgrst, 'reload schema';

commit;
