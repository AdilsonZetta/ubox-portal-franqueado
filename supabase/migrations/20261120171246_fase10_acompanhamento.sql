-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

create table public.acompanhamento_registros (
  id text primary key default gen_random_uuid()::text,
  unidade_id text not null check (char_length(unidade_id) between 1 and 64),
  unidade_nome text not null check (char_length(unidade_nome) between 2 and 120),
  data timestamptz not null check (isfinite(data)),
  tipo text not null check (tipo in ('visita', 'reuniao', 'call')),
  notas text not null check (char_length(notas) between 2 and 4000),
  compartilhado boolean not null,
  gerado_por_ia boolean not null,
  ia_modelo text not null,
  autor_uid uuid not null references public.usuarios(id),
  autor_nome text not null check (char_length(autor_nome) between 2 and 120),
  criado_em timestamptz not null,
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null,
  check (app.marketing_ia_ok(gerado_por_ia, ia_modelo))
);

create table public.acompanhamento_passos (
  id text primary key default gen_random_uuid()::text,
  registro_id text not null check (char_length(registro_id) between 1 and 64),
  unidade_id text not null,
  descricao text not null check (char_length(descricao) between 2 and 1000),
  responsavel text not null check (char_length(responsavel) between 2 and 120),
  prazo timestamptz not null check (isfinite(prazo)),
  status text not null check (status in ('aberto', 'concluido_unidade', 'validado', 'reaberto')),
  compartilhado boolean not null,
  comentario_unidade text not null check (char_length(comentario_unidade) <= 1000),
  comentario_franqueadora text not null check (char_length(comentario_franqueadora) <= 1000),
  criado_em timestamptz not null,
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null
);

create index acompanhamento_registros_unidade_idx on public.acompanhamento_registros (unidade_id);
create index acompanhamento_passos_unidade_idx on public.acompanhamento_passos (unidade_id);
create index acompanhamento_passos_registro_idx on public.acompanhamento_passos (registro_id);

-- Acompanhamento da própria unidade independe dos módulos liberados.
create function app.da_unidade_acompanhada(p_unidade text, p_so_franqueado boolean default false)
returns boolean language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and app.unidade_ativa(u) and u.unidade_id = p_unidade
    and (u.papel = 'franqueado' or (not p_so_franqueado and u.papel = 'equipe_franqueado'))
  from app.perfil() u
$$;

-- Invoker: a consulta ao pai também está sujeita ao RLS.
create function app.registro_compartilhado_com(p_registro text, p_unidade text)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.acompanhamento_registros r
    where r.id = p_registro and r.unidade_id = p_unidade and r.compartilhado
  )
$$;

alter table public.acompanhamento_registros enable row level security;
alter table public.acompanhamento_passos enable row level security;

revoke all on public.acompanhamento_registros, public.acompanhamento_passos from public, anon, authenticated;
grant select, insert, update on public.acompanhamento_registros, public.acompanhamento_passos to authenticated;

create policy acompanhamento_registros_ler on public.acompanhamento_registros for select to authenticated
  using ((select app.gere_acompanhamento()) or (compartilhado and app.da_unidade_acompanhada(unidade_id)));
create policy acompanhamento_registros_criar on public.acompanhamento_registros for insert to authenticated
  with check ((select app.gere_acompanhamento()));
create policy acompanhamento_registros_editar on public.acompanhamento_registros for update to authenticated
  using ((select app.gere_acompanhamento())) with check ((select app.gere_acompanhamento()));

create policy acompanhamento_passos_ler on public.acompanhamento_passos for select to authenticated
  using ((select app.gere_acompanhamento()) or (
    compartilhado and app.da_unidade_acompanhada(unidade_id)
    and app.registro_compartilhado_com(registro_id, unidade_id)
  ));
create policy acompanhamento_passos_criar on public.acompanhamento_passos for insert to authenticated
  with check ((select app.gere_acompanhamento()));
create policy acompanhamento_passos_editar on public.acompanhamento_passos for update to authenticated
  using ((select app.gere_acompanhamento()) or (
    compartilhado and app.da_unidade_acompanhada(unidade_id, true)
    and app.registro_compartilhado_com(registro_id, unidade_id)
  ))
  with check ((select app.gere_acompanhamento()) or (
    compartilhado and app.da_unidade_acompanhada(unidade_id, true)
    and app.registro_compartilhado_com(registro_id, unidade_id)
  ));

create function app.acompanhamento_registro_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
declare
  eu public.usuarios := app.perfil();
begin
  if not app.da_api() then return new; end if;

  if tg_op = 'INSERT' then
    -- A unidade só precisa existir no cadastro inicial. O histórico sobrevive à sua exclusão.
    if not app.gere_acompanhamento()
      or not exists (select 1 from public.unidades u where u.id = new.unidade_id)
      or (new.autor_uid is not null and new.autor_uid is distinct from eu.id)
      or (new.autor_nome is not null and new.autor_nome is distinct from eu.nome) then
      raise exception 'Unidade ou autoria do registro inválida.' using errcode = '42501';
    end if;
    new.autor_uid := auth.uid();
    new.autor_nome := eu.nome;
  elsif row(new.id, new.unidade_id, new.unidade_nome, new.autor_uid, new.autor_nome)
      is distinct from row(old.id, old.unidade_id, old.unidade_nome, old.autor_uid, old.autor_nome) then
    raise exception 'Identificador, unidade e autoria do registro são imutáveis.' using errcode = '42501';
  end if;
  return new;
end
$$;

create function app.acompanhamento_passo_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
declare
  gere boolean := app.gere_acompanhamento();
  pai public.acompanhamento_registros;
begin
  if not app.da_api() then return new; end if;

  if tg_op = 'UPDATE' and row(new.id, new.registro_id, new.unidade_id)
      is distinct from row(old.id, old.registro_id, old.unidade_id) then
    raise exception 'Identificador, registro e unidade do passo são imutáveis.' using errcode = '42501';
  end if;

  if gere then
    -- Impede que outra gravação mude o compartilhamento do pai durante a validação do passo.
    select r.* into pai from public.acompanhamento_registros r where r.id = new.registro_id for share;
    if not found or pai.compartilhado is distinct from new.compartilhado then
      raise exception 'O passo precisa acompanhar o compartilhamento do registro.' using errcode = '42501';
    end if;

    if tg_op = 'INSERT' then
      if pai.unidade_id is distinct from new.unidade_id or new.status is distinct from 'aberto'
        or new.comentario_unidade is distinct from '' then
        raise exception 'Unidade, status ou comentário inicial do passo inválido.' using errcode = '42501';
      end if;
    elsif new.comentario_unidade is distinct from old.comentario_unidade
      or (old.status = 'validado' and row(new.descricao, new.responsavel, new.prazo, new.comentario_franqueadora)
        is distinct from row(old.descricao, old.responsavel, old.prazo, old.comentario_franqueadora))
      or (new.status is distinct from old.status and (
        old.status = 'concluido_unidade' and new.status in ('validado', 'reaberto')
      ) is not true)
      or (new.status = 'reaberto' and old.status <> 'reaberto' and char_length(new.comentario_franqueadora) < 2) then
      raise exception 'Alteração do passo pela franqueadora inválida.' using errcode = '42501';
    end if;
  elsif tg_op = 'INSERT' or not (
      app.da_unidade_acompanhada(old.unidade_id, true) and old.compartilhado
      and app.registro_compartilhado_com(old.registro_id, old.unidade_id)
      and old.status in ('aberto', 'reaberto') and new.status = 'concluido_unidade'
      and char_length(new.comentario_unidade) >= 2
      and row(new.descricao, new.responsavel, new.prazo, new.compartilhado, new.comentario_franqueadora)
        is not distinct from row(old.descricao, old.responsavel, old.prazo, old.compartilhado, old.comentario_franqueadora)
    ) is true then
    raise exception 'Alteração do passo pela unidade inválida.' using errcode = '42501';
  end if;
  return new;
end
$$;

create function app.acompanhamento_carimbar() returns trigger
language plpgsql set search_path = '' as $$
declare
  eu public.usuarios := app.perfil();
  agora timestamptz := statement_timestamp();
begin
  if not app.da_api() then return new; end if;

  if tg_op = 'UPDATE' and new.criado_em is distinct from old.criado_em then
    raise exception 'A data de criação é imutável.' using errcode = '42501';
  end if;

  if (new.atualizado_por is not null and new.atualizado_por is distinct from eu.id
        and (tg_op = 'INSERT' or new.atualizado_por is distinct from old.atualizado_por))
    or (new.atualizado_por_nome is not null and new.atualizado_por_nome is distinct from eu.nome
        and (tg_op = 'INSERT' or new.atualizado_por_nome is distinct from old.atualizado_por_nome))
    or (new.atualizado_em is not null and new.atualizado_em <> agora
        and (tg_op = 'INSERT' or new.atualizado_em is distinct from old.atualizado_em))
    or (tg_op = 'INSERT' and new.criado_em is not null and new.criado_em <> agora) then
    raise exception 'Carimbo de autoria ou data inválido.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then new.criado_em := agora; end if;
  new.atualizado_por := auth.uid();
  new.atualizado_por_nome := eu.nome;
  new.atualizado_em := agora;
  return new;
end
$$;

create trigger acompanhamento_antes_registro before insert or update on public.acompanhamento_registros
  for each row execute function app.acompanhamento_registro_antes_gravar();
create trigger acompanhamento_antes_passo before insert or update on public.acompanhamento_passos
  for each row execute function app.acompanhamento_passo_antes_gravar();
create trigger acompanhamento_carimbar before insert or update on public.acompanhamento_registros
  for each row execute function app.acompanhamento_carimbar();
create trigger acompanhamento_carimbar before insert or update on public.acompanhamento_passos
  for each row execute function app.acompanhamento_carimbar();

revoke all on function app.da_unidade_acompanhada(text, boolean), app.registro_compartilhado_com(text, text),
  app.acompanhamento_registro_antes_gravar(), app.acompanhamento_passo_antes_gravar(), app.acompanhamento_carimbar()
  from public, anon, authenticated;
grant execute on function app.da_unidade_acompanhada(text, boolean),
  app.registro_compartilhado_com(text, text) to authenticated;

-- Equivalente ao lote com existsAfter/getAfter: grava o pai antes dos passos na mesma
-- transação. SECURITY INVOKER mantém as permissões, o RLS e os gatilhos de quem chama.
create function public.salvar_acompanhamento(p_registro jsonb, p_editar boolean, p_passos jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  entrada public.acompanhamento_registros;
  registro public.acompanhamento_registros;
  compartilhado_antes boolean;
begin
  if not app.gere_acompanhamento() then
    raise exception 'Sem permissão para gerenciar o acompanhamento.' using errcode = '42501';
  end if;
  entrada := jsonb_populate_record(null::public.acompanhamento_registros, p_registro);

  if p_editar then
    select r.compartilhado into compartilhado_antes
    from public.acompanhamento_registros r where r.id = entrada.id for no key update;
    if not found then
      raise exception 'Registro de acompanhamento indisponível.' using errcode = '42501';
    end if;
    update public.acompanhamento_registros r
      set data = entrada.data, tipo = entrada.tipo, notas = entrada.notas,
        compartilhado = entrada.compartilhado, gerado_por_ia = entrada.gerado_por_ia, ia_modelo = entrada.ia_modelo
      where r.id = entrada.id returning r.* into registro;

    if compartilhado_antes is distinct from registro.compartilhado then
      update public.acompanhamento_passos p set compartilhado = registro.compartilhado
        where p.registro_id = registro.id;
    end if;
  else
    entrada.id := coalesce(entrada.id, gen_random_uuid()::text);
    insert into public.acompanhamento_registros select (entrada).*
      returning * into registro;
  end if;

  insert into public.acompanhamento_passos (
    id, registro_id, unidade_id, descricao, responsavel, prazo, status, compartilhado,
    comentario_unidade, comentario_franqueadora
  )
  select coalesce(p.id, gen_random_uuid()::text), registro.id, registro.unidade_id,
    p.descricao, p.responsavel, p.prazo, 'aberto', registro.compartilhado, '', ''
  from jsonb_to_recordset(p_passos) as p(id text, descricao text, responsavel text, prazo timestamptz);

  return registro.id;
end
$$;

revoke all on function public.salvar_acompanhamento(jsonb, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_acompanhamento(jsonb, boolean, jsonb) to authenticated;
