alter table public.checklist_modelos
  add column horario_liberacao text
    check (horario_liberacao ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

create function app.checklist_horario_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.horario_liberacao is not distinct from old.horario_liberacao then
      return new;
    end if;
  elsif new.horario_liberacao is null then
    return new;
  end if;
  if (app.perfil()).papel is distinct from 'admin' then
    raise exception 'Somente o administrador da franqueadora pode definir o horário.' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger checklist_horario_antes_gravar
  before insert or update on public.checklist_modelos
  for each row when (app.da_api()) execute function app.checklist_horario_antes_gravar();

create function app.checklist_horario_antes_enviar() returns trigger
language plpgsql set search_path = '' as $$
declare
  horario text;
begin
  select horario_liberacao into horario
    from public.checklist_modelos where id = new.modelo_id;
  if horario is not null
    and (statement_timestamp() at time zone 'America/Sao_Paulo')::time < horario::time then
    raise exception 'O checklist pode ser enviado a partir de % (horário de Brasília).', horario using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger checklist_horario_antes_enviar
  before insert on public.checklist_execucoes
  for each row when (app.da_api()) execute function app.checklist_horario_antes_enviar();

revoke execute on function app.checklist_horario_antes_gravar(), app.checklist_horario_antes_enviar()
  from public, anon, authenticated;
