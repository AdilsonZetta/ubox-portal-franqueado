alter table public.demandas
  add column if not exists destino text not null default 'interna' check (destino in ('interna', 'unidade')),
  add column if not exists unidade_id text references public.unidades(id) on delete cascade,
  add column if not exists grupo_id uuid;
alter table public.demandas drop constraint if exists demandas_destino_unidade_check;
alter table public.demandas add constraint demandas_destino_unidade_check
  check ((destino = 'interna') = (unidade_id is null));

create index if not exists demandas_unidade_idx on public.demandas (unidade_id);
create index if not exists demandas_grupo_idx on public.demandas (grupo_id);

alter table public.demanda_responsaveis add column if not exists usuario_nome text;
update public.demanda_responsaveis r set usuario_nome = u.nome
from public.usuarios u where u.id = r.usuario_id and r.usuario_nome is null;

create or replace function app.demanda_tem_pessoas_unidade(d public.demandas) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.demanda_responsaveis r
    join public.usuarios u on u.id = r.usuario_id
    where r.demanda_id = d.id and u.unidade_id = d.unidade_id
      and u.papel in ('franqueado', 'equipe_franqueado')
  )
$$;

create or replace function app.demanda_pode_ler(d public.demandas) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.eh_admin()
    or (app.demanda_rede() and (d.criado_por = u.id or r.atribuida or d.area = u.area))
    or (
      d.destino = 'unidade' and app.conta_ativa(u) and app.unidade_ativa(u)
      and u.papel in ('franqueado', 'equipe_franqueado') and u.unidade_id = d.unidade_id
      and (u.papel = 'franqueado' or r.atribuida or not app.demanda_tem_pessoas_unidade(d))
    )
  from app.perfil() u
  cross join lateral (
    select exists (
      select 1 from public.demanda_responsaveis dr where dr.demanda_id = d.id and dr.usuario_id = u.id
    ) as atribuida
  ) r
$$;

-- Campos calculados do PostgREST recebem a linha da demanda. Releia a linha
-- persistida para aplicar a autorização também em chamadas diretas à função.
create or replace function public.tem_responsaveis_unidade(d public.demandas) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.demanda_tem_pessoas_unidade(real)
  from public.demandas real where real.id = d.id and app.demanda_pode_ler(real)
$$;

create or replace function public.demanda_unidade_nome(d public.demandas) returns text
language sql stable security definer set search_path = '' as $$
  select u.nome from public.demandas real
  join public.unidades u on u.id = real.unidade_id
  where real.id = d.id and app.demanda_pode_ler(real)
$$;

create or replace function app.demanda_validar_pessoas(p_ids uuid[], p_unidades text[], p_rede boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  total integer;
begin
  perform 1 from public.usuarios u
  where u.id = any(p_ids) and app.conta_ativa(u) and (
    (p_rede and u.papel in ('admin', 'equipe_franqueadora'))
    or (u.papel in ('franqueado', 'equipe_franqueado') and u.unidade_id = any(p_unidades))
  )
  order by u.id for share;
  get diagnostics total = row_count;
  if total <> (select count(*) from (select distinct unnest(p_ids)) ids) then
    raise exception 'Escolha apenas pessoas ativas da franqueadora ou das unidades selecionadas, em seus respectivos campos.';
  end if;
end;
$$;

create or replace function public.criar_demanda_unidades(
  p_unidades text[], p_titulo text, p_descricao text, p_area text, p_prioridade text,
  p_prazo date, p_responsaveis_rede uuid[], p_responsaveis_unidade uuid[], p_anexos jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  grupo uuid := gen_random_uuid();
  unidades text[];
  total integer;
  copia record;
begin
  if app.demanda_rede() is not true then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  unidades := array(select distinct unnest(p_unidades) order by 1);
  if cardinality(unidades) = 0 then raise exception 'Selecione pelo menos uma unidade.'; end if;
  perform 1 from public.unidades u where u.id = any(unidades) and u.ativo order by u.id for share;
  get diagnostics total = row_count;
  if total <> cardinality(unidades) then raise exception 'Selecione apenas unidades ativas.'; end if;

  perform app.demanda_validar_pessoas(p_responsaveis_rede, '{}', true);
  perform app.demanda_validar_pessoas(p_responsaveis_unidade, unidades, false);
  for copia in
    insert into public.demandas (
      titulo, descricao, area, prioridade, prazo, anexos, criado_por, criado_por_nome, destino, unidade_id, grupo_id
    )
    select btrim(p_titulo), coalesce(p_descricao, ''), p_area, p_prioridade, p_prazo,
      coalesce(p_anexos, '[]'), (select auth.uid()), (app.perfil()).nome, 'unidade', unidade, grupo
    from unnest(unidades) as escolhidas(unidade)
    returning id, unidade_id
  loop
    insert into public.demanda_responsaveis (demanda_id, usuario_id, usuario_nome)
    select copia.id, u.id, u.nome from public.usuarios u
    where u.id = any(p_responsaveis_rede)
       or (u.id = any(p_responsaveis_unidade) and u.unidade_id = copia.unidade_id);
    perform app.demanda_registrar(copia.id, 'criacao', 'Demanda enviada à unidade.');
  end loop;
  return grupo;
end;
$$;

create or replace function public.criar_demanda(p_titulo text, p_descricao text, p_area text,
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
  insert into public.demanda_responsaveis (demanda_id, usuario_id, usuario_nome)
  select demanda_id, u.id, u.nome from public.usuarios u where u.id = any(p_responsaveis);
  perform app.demanda_registrar(demanda_id, 'criacao', 'Demanda criada.');
  return demanda_id;
end;
$$;

create or replace function public.atualizar_demanda(p_id uuid, p_titulo text, p_descricao text, p_area text,
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
  if demanda.destino = 'interna' then
    perform app.demanda_validar_responsaveis(p_area, p_responsaveis);
  else
    perform app.demanda_validar_pessoas(p_responsaveis, array[demanda.unidade_id], true);
  end if;

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
    insert into public.demanda_responsaveis (demanda_id, usuario_id, usuario_nome)
    select p_id, u.id, u.nome from public.usuarios u where u.id = any(responsaveis)
    on conflict (demanda_id, usuario_id) do update set usuario_nome = excluded.usuario_nome;
    perform app.demanda_registrar(p_id, 'responsaveis', 'Pessoas responsáveis atualizadas.');
  end if;
end;
$$;

create or replace function public.adicionar_link_demanda(p_id uuid, p_nome text, p_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  demanda public.demandas;
  novos_anexos jsonb;
begin
  select d.* into demanda from public.demandas d where d.id = p_id for update;
  if not found or app.demanda_pode_ler(demanda) is not true then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  novos_anexos := demanda.anexos || jsonb_build_array(jsonb_build_object('nome', btrim(p_nome), 'url', btrim(p_url)));
  if not app.chamado_anexos_validos(novos_anexos) or btrim(p_url) ~ '[[:space:]]' then
    raise exception 'Informe um nome e um endereço HTTPS válidos. Cada demanda aceita até 8 links.';
  end if;
  update public.demandas set anexos = novos_anexos, atualizado_em = now() where id = p_id;
  perform app.demanda_registrar(p_id, 'comentario', 'Link adicionado: ' || btrim(p_nome));
end;
$$;

create or replace function public.minhas_demandas_abertas() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.demandas d
  where d.status <> 'concluida' and case when (select app.demanda_rede()) then (
    d.area = (select (app.perfil()).area) or exists (
      select 1 from public.demanda_responsaveis r
      where r.demanda_id = d.id and r.usuario_id = (select auth.uid())
    )
  ) else app.demanda_pode_ler(d) end
$$;

create or replace function public.listar_pessoas_unidades(p_unidades text[])
returns table (id uuid, nome text, papel public.papel, unidade_id text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.nome, u.papel, u.unidade_id from public.usuarios u
  where (select app.demanda_rede()) and app.conta_ativa(u) and u.unidade_id = any(p_unidades)
    and u.papel in ('franqueado', 'equipe_franqueado')
  order by u.nome, u.id
$$;

-- Diretório para o envio, sem ampliar a política de leitura dos demais dados de unidades.
create or replace function public.listar_unidades_demanda()
returns table (id text, nome text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.nome from public.unidades u
  where (select app.demanda_rede()) and u.ativo
  order by u.nome, u.id
$$;

revoke all on function app.demanda_tem_pessoas_unidade(public.demandas),
  app.demanda_validar_pessoas(uuid[], text[], boolean) from public, anon, authenticated;

revoke all on function public.criar_demanda_unidades(text[], text, text, text, text, date, uuid[], uuid[], jsonb),
  public.adicionar_link_demanda(uuid, text, text), public.listar_pessoas_unidades(text[]),
  public.listar_unidades_demanda(), public.tem_responsaveis_unidade(public.demandas),
  public.demanda_unidade_nome(public.demandas)
from public, anon;
grant execute on function public.criar_demanda_unidades(text[], text, text, text, text, date, uuid[], uuid[], jsonb),
  public.adicionar_link_demanda(uuid, text, text), public.listar_pessoas_unidades(text[]),
  public.listar_unidades_demanda(), public.tem_responsaveis_unidade(public.demandas),
  public.demanda_unidade_nome(public.demandas)
to authenticated;
