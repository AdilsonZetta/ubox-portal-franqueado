-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
-- Cada ação do Checklist grava uma linha. As regras usam get() do modelo,
-- sem getAfter() ou existsAfter(); uma RPC de lote não é necessária.

create function app.gere_checklist(u public.usuarios) returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and
    (u.papel = 'admin' or (u.papel = 'equipe_franqueadora' and app.tem_modulo(u, 'checklist')))
$$;

create function app.unidade_checklist(u public.usuarios) returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and u.papel in ('franqueado', 'equipe_franqueado')
    and app.tem_modulo(u, 'checklist') and app.unidade_ativa(u)
$$;

create function app.gere_auditoria() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.conta_ativa(u) and
    (u.papel = 'admin' or (u.papel = 'equipe_franqueadora' and app.tem_modulo(u, 'auditoria')))
  from app.perfil() u
$$;

create table public.checklist_modelos (
  id text primary key default gen_random_uuid()::text,
  titulo text not null check (char_length(titulo) between 2 and 120),
  descricao text not null default '' check (char_length(descricao) <= 1000),
  tipo text not null check (tipo in ('abertura', 'fechamento', 'limpeza', 'inauguracao', 'vistoria', 'outro')),
  frequencia text not null check (frequencia in ('diaria', 'semanal', 'mensal', 'avulsa')),
  itens jsonb not null,
  total_itens integer not null check (total_itens between 1 and 60),
  peso_total integer not null check (peso_total between total_itens and total_itens::bigint * 10),
  versao integer not null default 1 check (versao >= 1),
  publico boolean not null default true,
  unidades text[] not null default '{}' check (app.lista_unidades_marketing_ok(unidades)),
  ativo boolean not null default true,
  gerado_por_ia boolean not null default false,
  ia_modelo text not null default '',
  criado_em timestamptz not null,
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null,
  check (case when jsonb_typeof(itens) = 'array' then jsonb_array_length(itens) = total_itens else false end),
  check (publico = (cardinality(unidades) = 0)),
  check (app.marketing_ia_ok(gerado_por_ia, ia_modelo))
);

create table public.checklist_execucoes (
  id text primary key default gen_random_uuid()::text,
  modelo_id text not null check (char_length(modelo_id) between 1 and 64),
  modelo_titulo text not null,
  modelo_versao integer not null,
  tipo text not null,
  frequencia text not null,
  unidade_id text not null,
  unidade_nome text not null,
  uid uuid not null references public.usuarios(id),
  nome text not null,
  respostas jsonb not null check (jsonb_typeof(respostas) = 'array'),
  total_itens integer not null,
  qtd_ok integer not null,
  qtd_nao_ok integer not null,
  qtd_na integer not null,
  pontos_obtidos integer not null,
  pontos_possiveis integer not null,
  score integer not null,
  obs_geral text not null default '' check (char_length(obs_geral) <= 2000),
  obs_proprietario text not null default '',
  obs_proprietario_por uuid references public.usuarios(id),
  obs_proprietario_nome text not null default '',
  obs_proprietario_em timestamptz,
  criado_em timestamptz not null
);

create index checklist_execucoes_unidade_data_idx on public.checklist_execucoes (unidade_id, criado_em desc);
create index checklist_execucoes_data_idx on public.checklist_execucoes (criado_em desc);

-- A soma por item permanece no cliente, como nas regras do Firestore.
create function app.totais_checklist_ok(e public.checklist_execucoes, peso_total integer) returns boolean
language sql immutable set search_path = '' as $$
  select e.qtd_ok >= 0 and e.qtd_nao_ok >= 0 and e.qtd_na >= 0
    and e.qtd_ok::bigint + e.qtd_nao_ok + e.qtd_na = e.total_itens
    and e.pontos_obtidos >= e.qtd_ok
    and e.pontos_possiveis::bigint - e.pontos_obtidos >= e.qtd_nao_ok
    and e.pontos_possiveis <= peso_total
    and e.pontos_possiveis <= (e.qtd_ok::bigint + e.qtd_nao_ok) * 10
    and e.pontos_obtidos <= e.qtd_ok::bigint * 10
    and (e.qtd_nao_ok = 0) = (e.pontos_obtidos = e.pontos_possiveis)
    and e.score = case when e.pontos_possiveis = 0 then 100
      else floor(e.pontos_obtidos::numeric * 100 / e.pontos_possiveis) end
$$;

create function app.checklist_modelo_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
declare
  eu public.usuarios := app.perfil();
  agora timestamptz := statement_timestamp();
  versao_esperada bigint := 1;
begin
  if not app.gere_checklist(eu) then
    raise exception 'Sem permissão para gerenciar modelos.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if row(new.id, new.criado_em) is distinct from row(old.id, old.criado_em) then
      raise exception 'Identificador e data de criação são imutáveis.' using errcode = '42501';
    end if;
    versao_esperada := old.versao::bigint + case when
      row(new.itens, new.titulo, new.tipo, new.frequencia, new.peso_total) is distinct from
      row(old.itens, old.titulo, old.tipo, old.frequencia, old.peso_total) then 1 else 0 end;
  else
    if new.criado_em is not null and new.criado_em <> agora then
      raise exception 'Data de criação inválida.' using errcode = '42501';
    end if;
    new.criado_em := agora;
  end if;

  if new.versao is distinct from versao_esperada then
    raise exception 'Versão do modelo inválida.' using errcode = '42501';
  end if;
  if (new.atualizado_por is not null and new.atualizado_por is distinct from auth.uid()
      and (tg_op = 'INSERT' or new.atualizado_por is distinct from old.atualizado_por))
    or (new.atualizado_por_nome is not null and new.atualizado_por_nome is distinct from eu.nome
      and (tg_op = 'INSERT' or new.atualizado_por_nome is distinct from old.atualizado_por_nome))
    or (new.atualizado_em is not null and new.atualizado_em <> agora
      and (tg_op = 'INSERT' or new.atualizado_em is distinct from old.atualizado_em)) then
    raise exception 'Carimbo de atualização inválido.' using errcode = '42501';
  end if;
  new.atualizado_por := auth.uid();
  new.atualizado_por_nome := eu.nome;
  new.atualizado_em := agora;
  return new;
end
$$;

create function app.checklist_execucao_antes_inserir() returns trigger
language plpgsql set search_path = '' as $$
declare
  eu public.usuarios := app.perfil();
  modelo public.checklist_modelos;
  agora timestamptz := statement_timestamp();
begin
  if not (app.unidade_checklist(eu)
    and new.unidade_id is not distinct from eu.unidade_id
    and new.unidade_nome is not distinct from coalesce(eu.unidade, '')
    and (new.uid is null or new.uid = auth.uid())
    and (new.nome is null or new.nome = eu.nome)
    and (new.criado_em is null or new.criado_em = agora)
    and new.obs_proprietario is not distinct from ''
    and new.obs_proprietario_por is null
    and new.obs_proprietario_nome is not distinct from ''
    and new.obs_proprietario_em is null) then
    raise exception 'Envio de checklist inválido.' using errcode = '42501';
  end if;

  -- A consulta roda como a unidade e respeita a visibilidade do modelo.
  select * into modelo from public.checklist_modelos where id = new.modelo_id;
  if not found or not coalesce(
    modelo.ativo and (modelo.publico or new.unidade_id = any(modelo.unidades))
    and row(new.modelo_versao, new.modelo_titulo, new.tipo, new.frequencia, new.total_itens) =
        row(modelo.versao, modelo.titulo, modelo.tipo, modelo.frequencia, modelo.total_itens)
    and case when jsonb_typeof(new.respostas) = 'array'
      then jsonb_array_length(new.respostas) = modelo.total_itens else false end
    and app.totais_checklist_ok(new, modelo.peso_total), false) then
    raise exception 'Execução incompatível com o modelo ou com os totais.' using errcode = '42501';
  end if;

  new.uid := auth.uid();
  new.nome := eu.nome;
  new.criado_em := agora;
  return new;
end
$$;

create function app.checklist_execucao_antes_atualizar() returns trigger
language plpgsql set search_path = '' as $$
declare
  eu public.usuarios := app.perfil();
  agora timestamptz := statement_timestamp();
  campos_obs text[] := array['obs_proprietario', 'obs_proprietario_por', 'obs_proprietario_nome', 'obs_proprietario_em'];
begin
  if (to_jsonb(new) - campos_obs) is distinct from (to_jsonb(old) - campos_obs) then
    raise exception 'Somente a observação do proprietário pode mudar.' using errcode = '42501';
  end if;
  if not coalesce(char_length(new.obs_proprietario) between 2 and 2000, false)
    or (new.obs_proprietario_por is not null and new.obs_proprietario_por is distinct from auth.uid()
      and new.obs_proprietario_por is distinct from old.obs_proprietario_por)
    or (new.obs_proprietario_nome is distinct from eu.nome
      and new.obs_proprietario_nome is distinct from old.obs_proprietario_nome)
    or (new.obs_proprietario_em is not null and new.obs_proprietario_em <> agora
      and new.obs_proprietario_em is distinct from old.obs_proprietario_em) then
    raise exception 'Observação do proprietário inválida.' using errcode = '42501';
  end if;
  new.obs_proprietario_por := auth.uid();
  new.obs_proprietario_nome := eu.nome;
  new.obs_proprietario_em := agora;
  return new;
end
$$;

revoke all on function app.gere_checklist(public.usuarios), app.unidade_checklist(public.usuarios),
  app.gere_auditoria(), app.totais_checklist_ok(public.checklist_execucoes, integer),
  app.checklist_modelo_antes_gravar(), app.checklist_execucao_antes_inserir(),
  app.checklist_execucao_antes_atualizar() from public, anon, authenticated, service_role;
grant execute on function app.gere_checklist(public.usuarios), app.unidade_checklist(public.usuarios),
  app.gere_auditoria(), app.totais_checklist_ok(public.checklist_execucoes, integer) to authenticated;

create trigger checklist_modelo_antes_gravar before insert or update on public.checklist_modelos
  for each row when (app.da_api()) execute function app.checklist_modelo_antes_gravar();
create trigger checklist_execucao_antes_inserir before insert on public.checklist_execucoes
  for each row when (app.da_api()) execute function app.checklist_execucao_antes_inserir();
create trigger checklist_execucao_antes_atualizar before update on public.checklist_execucoes
  for each row when (app.da_api()) execute function app.checklist_execucao_antes_atualizar();

alter table public.checklist_modelos enable row level security;
alter table public.checklist_execucoes enable row level security;
revoke all on public.checklist_modelos, public.checklist_execucoes from public, anon, authenticated;
grant select, insert, update on public.checklist_modelos, public.checklist_execucoes to authenticated;

create policy checklist_modelos_leitura on public.checklist_modelos for select to authenticated
  using ((select app.gere_checklist(app.perfil())) or (select app.gere_acompanhamento())
    or (ativo and (select app.unidade_checklist(app.perfil()))
      and (publico or (select app.minha_unidade_id()) = any(unidades))));
create policy checklist_modelos_insercao on public.checklist_modelos for insert to authenticated
  with check ((select app.gere_checklist(app.perfil())));
create policy checklist_modelos_atualizacao on public.checklist_modelos for update to authenticated
  using ((select app.gere_checklist(app.perfil())))
  with check ((select app.gere_checklist(app.perfil())));

create policy checklist_execucoes_leitura on public.checklist_execucoes for select to authenticated
  using ((select app.gere_checklist(app.perfil())) or (select app.gere_auditoria())
    or (select app.gere_acompanhamento())
    or ((select app.unidade_checklist(app.perfil())) and unidade_id = (select app.minha_unidade_id())));
create policy checklist_execucoes_insercao on public.checklist_execucoes for insert to authenticated
  with check ((select app.unidade_checklist(app.perfil())) and unidade_id = (select app.minha_unidade_id()));
create policy checklist_execucoes_atualizacao on public.checklist_execucoes for update to authenticated
  using ((select app.unidade_checklist(app.perfil()) and (app.perfil()).papel = 'franqueado')
    and unidade_id = (select app.minha_unidade_id()))
  with check ((select app.unidade_checklist(app.perfil()) and (app.perfil()).papel = 'franqueado')
    and unidade_id = (select app.minha_unidade_id()));
