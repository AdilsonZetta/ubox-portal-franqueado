alter table public.usuarios
  add column area text check (area in (
    'marketing', 'operacao', 'financeiro', 'juridico', 'sistemas', 'implantacao',
    'expansao', 'treinamento', 'comercial', 'outros'
  )),
  add constraint usuarios_area_rede check (area is null or papel in ('admin', 'equipe_franqueadora'));

create table public.usuarios_papel_historico (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios on delete cascade,
  de public.papel not null,
  para public.papel not null,
  autor_id uuid not null references public.usuarios,
  criado_em timestamptz not null default now()
);

-- Trava também operações diretas e cascatas vindas de auth.users.
create function app.usuarios_proteger_admin_ativo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.papel = 'admin' and app.conta_ativa(old) then
    if (case when tg_op = 'DELETE' then true else new.papel <> 'admin' or not app.conta_ativa(new) end) then
      -- Reavalia as linhas depois de esperar os locks de alterações concorrentes.
      perform 1 from public.usuarios u
      where u.id <> old.id and u.papel = 'admin' and u.ativo and not u.recusado
      order by u.id for update;
      if not found then
        raise exception 'A rede precisa de pelo menos um admin ativo.';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger usuarios_proteger_admin_ativo
before update or delete on public.usuarios
for each row execute function app.usuarios_proteger_admin_ativo();

create function public.definir_admin(p_uid uuid, p_admin boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  alvo public.usuarios;
  novo public.papel;
begin
  if not app.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  perform 1 from public.usuarios u where u.papel = 'admin' order by u.id for update;
  if not app.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select u.* into alvo from public.usuarios u where u.id = p_uid for update;

  if p_admin is null then raise exception 'Informe o papel desejado.'; end if;
  if p_admin then
    if not found or alvo.papel <> 'equipe_franqueadora' or not app.conta_ativa(alvo) then
      raise exception 'Só pessoas da equipe da franqueadora podem virar admin.';
    end if;
    novo := 'admin';
  else
    if not found or alvo.papel <> 'admin' then raise exception 'Essa pessoa não é admin.'; end if;
    novo := 'equipe_franqueadora';
  end if;

  update public.usuarios set papel = novo, atualizado_em = now() where id = alvo.id;
  insert into public.usuarios_papel_historico (usuario_id, de, para, autor_id)
  values (alvo.id, alvo.papel, novo, (select auth.uid()));
end;
$$;

create table public.demandas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(btrim(titulo)) >= 2 and char_length(titulo) <= 140),
  descricao text not null default '' check (char_length(descricao) <= 6000),
  area text check (area in (
    'marketing', 'operacao', 'financeiro', 'juridico', 'sistemas', 'implantacao',
    'expansao', 'treinamento', 'comercial', 'outros'
  )),
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta', 'urgente')),
  prazo date,
  status text not null default 'a_fazer' check (status in ('a_fazer', 'em_andamento', 'aguardando', 'concluida')),
  anexos jsonb not null default '[]' check (app.chamado_anexos_validos(anexos)),
  criado_por uuid not null references public.usuarios,
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluida_em timestamptz
);

create table public.demanda_responsaveis (
  demanda_id uuid references public.demandas on delete cascade,
  usuario_id uuid references public.usuarios on delete cascade,
  primary key (demanda_id, usuario_id)
);
create index demanda_responsaveis_usuario_idx on public.demanda_responsaveis (usuario_id);

create table public.demanda_eventos (
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid not null references public.demandas on delete cascade,
  tipo text not null check (tipo in ('criacao', 'comentario', 'status', 'responsaveis', 'edicao')),
  texto text not null check (char_length(btrim(texto)) between 1 and 2000),
  autor_id uuid not null references public.usuarios,
  autor_nome text,
  criado_em timestamptz not null default now()
);
create index demanda_eventos_demanda_criado_idx on public.demanda_eventos (demanda_id, criado_em);

create function app.demanda_rede() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.conta_ativa(u) and coalesce(u.papel in ('admin', 'equipe_franqueadora'), false)
  from app.perfil() u
$$;

create function app.demanda_pode_ler(d public.demandas) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.eh_admin() or (app.demanda_rede() and (
    d.criado_por = (select auth.uid())
    or exists (
      select 1 from public.demanda_responsaveis r
      where r.demanda_id = d.id and r.usuario_id = (select auth.uid())
    )
    or (d.area is not null and d.area = (app.perfil()).area)
  ))
$$;

create function app.demanda_pode_editar(d public.demandas) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.demanda_rede() and (app.eh_admin() or d.criado_por = (select auth.uid()))
$$;

alter table public.usuarios_papel_historico enable row level security;
alter table public.demandas enable row level security;
alter table public.demanda_responsaveis enable row level security;
alter table public.demanda_eventos enable row level security;

create policy usuarios_papel_historico_le on public.usuarios_papel_historico
for select to authenticated using ((select app.eh_admin()));
create policy demandas_le on public.demandas
for select to authenticated using (app.demanda_pode_ler(demandas));
create policy demanda_responsaveis_le on public.demanda_responsaveis
for select to authenticated using (exists (
  select 1 from public.demandas d where d.id = demanda_responsaveis.demanda_id
));
create policy demanda_eventos_le on public.demanda_eventos
for select to authenticated using (exists (
  select 1 from public.demandas d where d.id = demanda_eventos.demanda_id
));

create function app.demanda_validar_responsaveis(p_area text, p_responsaveis uuid[]) returns void
language plpgsql set search_path = '' as $$
declare
  total integer;
begin
  if p_area is null and coalesce(cardinality(p_responsaveis), 0) = 0 then
    raise exception 'Escolha uma área ou pelo menos uma pessoa responsável.';
  end if;
  perform 1 from public.usuarios u
  where u.id = any(p_responsaveis) and u.papel in ('admin', 'equipe_franqueadora') and app.conta_ativa(u)
  order by u.id for share;
  get diagnostics total = row_count;
  if total <> (select count(*) from (select distinct unnest(p_responsaveis)) ids) then
    raise exception 'Escolha apenas pessoas ativas da franqueadora como responsáveis.';
  end if;
end;
$$;

create function app.demanda_registrar(p_id uuid, p_tipo text, p_texto text) returns void
language sql set search_path = '' as $$
  insert into public.demanda_eventos (demanda_id, tipo, texto, autor_id, autor_nome, criado_em)
  values (p_id, p_tipo, p_texto, (select auth.uid()), (app.perfil()).nome, clock_timestamp())
$$;

create function public.criar_demanda(p_titulo text, p_descricao text, p_area text,
  p_prioridade text, p_prazo date, p_responsaveis uuid[], p_anexos jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  demanda_id uuid;
begin
  if app.demanda_rede() is not true then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  perform app.demanda_validar_responsaveis(p_area, p_responsaveis);
  insert into public.demandas (titulo, descricao, area, prioridade, prazo, anexos, criado_por, criado_por_nome)
  values (btrim(p_titulo), coalesce(p_descricao, ''), p_area, p_prioridade, p_prazo,
    coalesce(p_anexos, '[]'), (select auth.uid()), (app.perfil()).nome)
  returning id into demanda_id;
  insert into public.demanda_responsaveis (demanda_id, usuario_id)
  select distinct demanda_id, r.uid from unnest(p_responsaveis) r(uid);
  perform app.demanda_registrar(demanda_id, 'criacao', 'Demanda criada.');
  return demanda_id;
end;
$$;

create function public.atualizar_demanda(p_id uuid, p_titulo text, p_descricao text, p_area text,
  p_prioridade text, p_prazo date, p_responsaveis uuid[], p_anexos jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  demanda public.demandas;
  responsaveis uuid[];
  mudou_dados boolean;
  mudou_responsaveis boolean;
begin
  select d.* into demanda from public.demandas d where d.id = p_id for update;
  if not found or app.demanda_pode_editar(demanda) is not true then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  perform app.demanda_validar_responsaveis(p_area, p_responsaveis);

  select array(select distinct uid from unnest(p_responsaveis) r(uid) order by uid) into responsaveis;
  mudou_responsaveis := responsaveis is distinct from array(
    select r.usuario_id from public.demanda_responsaveis r where r.demanda_id = p_id order by r.usuario_id
  );
  mudou_dados := (demanda.titulo, demanda.descricao, demanda.area, demanda.prioridade, demanda.prazo, demanda.anexos)
    is distinct from (btrim(p_titulo), coalesce(p_descricao, ''), p_area, p_prioridade, p_prazo, coalesce(p_anexos, '[]'));

  if mudou_dados or mudou_responsaveis then
    update public.demandas set titulo = btrim(p_titulo), descricao = coalesce(p_descricao, ''),
      area = p_area, prioridade = p_prioridade, prazo = p_prazo, anexos = coalesce(p_anexos, '[]'),
      atualizado_em = now() where id = p_id;
  end if;
  if mudou_dados then
    perform app.demanda_registrar(p_id, 'edicao', 'Dados da demanda atualizados.');
  end if;
  if mudou_responsaveis then
    delete from public.demanda_responsaveis where demanda_id = p_id and not (usuario_id = any(responsaveis));
    insert into public.demanda_responsaveis (demanda_id, usuario_id)
    select p_id, uid from unnest(responsaveis) r(uid) on conflict do nothing;
    perform app.demanda_registrar(p_id, 'responsaveis', 'Pessoas responsáveis atualizadas.');
  end if;
end;
$$;

create function public.mudar_status_demanda(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  demanda public.demandas;
  rotulos constant jsonb := '{"a_fazer":"A fazer","em_andamento":"Em andamento","aguardando":"Aguardando","concluida":"Concluída"}';
begin
  select d.* into demanda from public.demandas d where d.id = p_id for update;
  if not found or app.demanda_pode_ler(demanda) is not true then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if (rotulos ->> p_status) is null then raise exception 'Escolha um status válido.'; end if;
  if demanda.status = p_status then return; end if;

  update public.demandas set status = p_status, atualizado_em = now(),
    concluida_em = case when p_status = 'concluida' then now() end
  where id = p_id;
  perform app.demanda_registrar(p_id, 'status', (rotulos ->> demanda.status) || ' → ' || (rotulos ->> p_status));
end;
$$;

create function public.comentar_demanda(p_id uuid, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  demanda public.demandas;
begin
  select d.* into demanda from public.demandas d where d.id = p_id for update;
  if not found or app.demanda_pode_ler(demanda) is not true then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_texto is null or char_length(btrim(p_texto)) not between 1 and 2000 then
    raise exception 'Escreva um comentário de até 2.000 caracteres.';
  end if;
  perform app.demanda_registrar(p_id, 'comentario', btrim(p_texto));
  update public.demandas set atualizado_em = now() where id = p_id;
end;
$$;

create function public.excluir_demanda(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.eh_admin() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  delete from public.demandas where id = p_id;
end;
$$;

create function public.listar_pessoas_rede()
returns table (id uuid, nome text, papel public.papel, area text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.nome, u.papel, u.area from public.usuarios u
  where (select app.demanda_rede()) and app.conta_ativa(u) and u.papel in ('admin', 'equipe_franqueadora')
  order by u.nome, u.id
$$;

create function public.minhas_demandas_abertas() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.demandas d
  where (select app.demanda_rede()) and d.status <> 'concluida' and (
    d.area = (select (app.perfil()).area) or exists (
      select 1 from public.demanda_responsaveis r
      where r.demanda_id = d.id and r.usuario_id = (select auth.uid())
    )
  )
$$;

revoke all on public.usuarios_papel_historico, public.demandas, public.demanda_responsaveis, public.demanda_eventos
from public, anon, authenticated;
grant select on public.usuarios_papel_historico, public.demandas, public.demanda_responsaveis, public.demanda_eventos
to authenticated;

revoke all on function app.usuarios_proteger_admin_ativo(), app.demanda_rede(),
  app.demanda_pode_ler(public.demandas), app.demanda_pode_editar(public.demandas),
  app.demanda_validar_responsaveis(text, uuid[]), app.demanda_registrar(uuid, text, text)
from public, anon, authenticated;
grant execute on function app.demanda_pode_ler(public.demandas) to authenticated;

revoke all on function public.definir_admin(uuid, boolean),
  public.criar_demanda(text, text, text, text, date, uuid[], jsonb),
  public.atualizar_demanda(uuid, text, text, text, text, date, uuid[], jsonb),
  public.mudar_status_demanda(uuid, text), public.comentar_demanda(uuid, text),
  public.excluir_demanda(uuid), public.listar_pessoas_rede(), public.minhas_demandas_abertas()
from public, anon, authenticated;
grant execute on function public.definir_admin(uuid, boolean),
  public.criar_demanda(text, text, text, text, date, uuid[], jsonb),
  public.atualizar_demanda(uuid, text, text, text, text, date, uuid[], jsonb),
  public.mudar_status_demanda(uuid, text), public.comentar_demanda(uuid, text),
  public.excluir_demanda(uuid), public.listar_pessoas_rede(), public.minhas_demandas_abertas()
to authenticated;
