-- Fase 1 (revisão, LOW): app.travar_primeiro_admin podia ser chamada direto por authenticated e
-- plantar a trava sem promover ninguém, fechando para sempre o caminho do 1º admin.
-- Agora: a função recusa chamada fora de gatilho, perde o EXECUTE de authenticated e só roda
-- pelo gatilho AFTER UPDATE (security definer) disparado pela promoção que o BEFORE já validou.
-- Feito por Grok Bot no Cursor (Antigravity sem cota).

create or replace function app.travar_primeiro_admin(p_uid uuid, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Só dentro do gatilho da promoção, nunca por chamada direta.
  if pg_trigger_depth() = 0 then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_uid is distinct from (select auth.uid()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  insert into public.admin_lock (id, uid, email) values ('adminCriado', p_uid, p_email);
exception when unique_violation then
  raise exception 'O primeiro admin já foi criado.' using errcode = '42501';
end
$$;
revoke all on function app.travar_primeiro_admin(uuid, text) from public, anon, authenticated;

-- Roda como dono (definer); quem dispara não precisa de EXECUTE em função de gatilho.
create function app.usuarios_trava_primeiro_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.travar_primeiro_admin(new.id, new.email);
  return null;
end
$$;
revoke all on function app.usuarios_trava_primeiro_admin() from public, anon, authenticated;

create or replace function app.usuarios_antes_update() returns trigger
language plpgsql set search_path = '' as $$
declare
  eu public.usuarios;
  mudou text[];
  ok boolean := false;
begin
  if not app.da_api() then return new; end if;
  new.atualizado_em := now();
  if new.id <> old.id or new.criado_em <> old.criado_em or new.firebase_uid is distinct from old.firebase_uid then
    raise exception 'Campo imutável.' using errcode = '42501';
  end if;
  select array_agg(n.key) into mudou
  from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value and n.key <> 'atualizado_em';
  mudou := coalesce(mudou, '{}');
  eu := app.perfil();

  -- 1) A própria pessoa muda só o nome.
  if old.id = (select auth.uid()) and mudou <@ array['nome']
     and new.email = coalesce((select auth.jwt()) ->> 'email', new.email) then
    ok := true;
  end if;

  -- 2) Primeiro admin: franqueado inativo se promove enquanto não existe a trava.
  if not ok and old.id = (select auth.uid()) and not app.admin_travado()
     and old.papel = 'franqueado' and not old.ativo and new.papel = 'admin' and new.ativo
     and mudou <@ array['papel', 'ativo'] then
    -- A trava é gravada pelo gatilho AFTER usuarios_trava_primeiro_admin, no mesmo comando.
    ok := true;
  end if;

  -- 3) Admin ativo: tudo, menos papel, e-mail, criação e quem criou.
  if not ok and app.eh_admin()
     and new.papel = old.papel and new.email = old.email
     and (old.criado_por is null or new.criado_por is not distinct from old.criado_por)
     and app.modulos_cabem(new.unidade_id, new.modulos_liberados) then
    ok := true;
  end if;

  -- 4) Franqueado edita a própria equipe: nome, ativo e módulos (dentro dos dele).
  if not ok and eu.id is not null and app.franqueado_da_equipe(old.unidade_id, old.papel)
     and new.papel = 'equipe_franqueado'
     and mudou <@ array['nome', 'ativo', 'modulos_liberados']
     and new.modulos_liberados <@ eu.modulos_liberados
     and app.modulos_cabem(new.unidade_id, new.modulos_liberados) then
    ok := true;
  end if;

  if not ok then
    raise exception 'Sem permissão para essa alteração.' using errcode = '42501';
  end if;
  return new;
end
$$;


-- Só promoções feitas pela API (o BEFORE só deixa a do 1º admin); migração/service_role não travam.
create trigger usuarios_trava_primeiro_admin
  after update on public.usuarios
  for each row
  when (old.papel is distinct from 'admin' and new.papel = 'admin' and app.da_api())
  execute function app.usuarios_trava_primeiro_admin();
