-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

create table public.auditoria_modelos (
  id text primary key default gen_random_uuid()::text,
  titulo text not null check (char_length(titulo) between 2 and 120),
  descricao text not null default '' check (char_length(descricao) <= 1000),
  itens jsonb not null,
  total_itens integer not null check (total_itens between 1 and 80),
  peso_total integer not null check (peso_total between total_itens and total_itens::bigint * 10),
  nota_minima integer not null check (nota_minima between 0 and 100),
  versao integer not null default 1 check (versao >= 1),
  ativo boolean not null default true,
  gerado_por_ia boolean not null default false,
  ia_modelo text not null default '',
  criado_em timestamptz not null,
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null,
  check (case when jsonb_typeof(itens) = 'array' then jsonb_array_length(itens) = total_itens else false end),
  check (app.marketing_ia_ok(gerado_por_ia, ia_modelo))
);

create table public.auditorias (
  id text primary key default gen_random_uuid()::text,
  unidade_id text not null check (char_length(unidade_id) between 1 and 64),
  unidade_nome text not null check (char_length(unidade_nome) between 2 and 120),
  modelo_id text not null check (char_length(modelo_id) between 1 and 64),
  modelo_titulo text not null check (char_length(modelo_titulo) between 2 and 120),
  modelo_versao integer not null,
  modalidade text not null check (modalidade in ('visita', 'presencial', 'remota')),
  data_visita timestamptz not null,
  auditor_uid uuid not null references public.usuarios(id),
  auditor_nome text not null,
  respostas jsonb not null,
  total_itens integer not null check (total_itens between 1 and 80),
  peso_total integer not null,
  qtd_ok integer not null,
  qtd_nao_ok integer not null,
  qtd_na integer not null,
  pontos_obtidos integer not null,
  pontos_possiveis integer not null,
  score integer not null,
  nota_minima integer not null check (nota_minima between 0 and 100),
  checklist_execucao_id text not null default '' check (char_length(checklist_execucao_id) <= 64),
  checklist_score integer,
  resultado text not null,
  obs_geral text not null default '' check (char_length(obs_geral) <= 4000),
  gerado_por_ia boolean not null default false,
  ia_modelo text not null default '',
  status text not null default 'rascunho' check (status in ('rascunho', 'aguardando_ciencia', 'concluida')),
  assinatura_auditor_uid uuid references public.usuarios(id),
  assinatura_auditor_nome text not null default '',
  assinatura_auditor_em timestamptz,
  ciencia_uid uuid references public.usuarios(id),
  ciencia_nome text not null default '',
  ciencia_em timestamptz,
  contestacao text not null default '' check (char_length(contestacao) <= 2000),
  criado_em timestamptz not null,
  atualizado_em timestamptz not null,
  check (case when jsonb_typeof(respostas) = 'array' then jsonb_array_length(respostas) = total_itens else false end),
  check (app.marketing_ia_ok(gerado_por_ia, ia_modelo)),
  -- Os totais são validados pelos mesmos limites das regras. A soma por resposta fica no cliente.
  check (
    qtd_ok >= 0 and qtd_nao_ok >= 0 and qtd_na >= 0
    and qtd_ok::bigint + qtd_nao_ok + qtd_na = total_itens
    and pontos_obtidos >= qtd_ok
    and pontos_possiveis::bigint - pontos_obtidos >= qtd_nao_ok
    and pontos_possiveis <= peso_total
    and pontos_possiveis <= (qtd_ok::bigint + qtd_nao_ok) * 10
    and pontos_obtidos <= qtd_ok::bigint * 10
    and (qtd_nao_ok = 0) = (pontos_obtidos = pontos_possiveis)
    and score = case when pontos_possiveis = 0 then 100
      else floor(pontos_obtidos::numeric * 100 / pontos_possiveis) end
  )
);

create table public.auditoria_acoes (
  id text primary key default gen_random_uuid()::text,
  auditoria_id text not null,
  unidade_id text not null,
  item_id text not null check (char_length(item_id) <= 64),
  item_texto text not null check (char_length(item_texto) <= 300),
  descricao text not null check (char_length(descricao) between 2 and 1000),
  responsavel text not null check (char_length(responsavel) between 2 and 120),
  prazo timestamptz not null,
  status text not null default 'aberta' check (status in ('aberta', 'em_andamento', 'concluida_unidade', 'validada', 'reaberta')),
  evidencia_url text not null default '' check (app.link_https(evidencia_url, true)),
  comentario_unidade text not null default '' check (char_length(comentario_unidade) <= 1000),
  comentario_franqueadora text not null default '' check (char_length(comentario_franqueadora) <= 1000),
  criado_em timestamptz not null,
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null
);

create index auditorias_data_idx on public.auditorias (criado_em desc);
create index auditorias_unidade_status_idx on public.auditorias (unidade_id, status);
create index auditoria_acoes_data_idx on public.auditoria_acoes (criado_em desc);
create index auditoria_acoes_unidade_idx on public.auditoria_acoes (unidade_id);
create index auditoria_acoes_auditoria_idx on public.auditoria_acoes (auditoria_id);

-- A unidade auditada participa mesmo sem o módulo de auditoria.
create function app.da_unidade_auditada(u public.usuarios) returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and u.papel in ('franqueado', 'equipe_franqueado')
    and app.unidade_ativa(u) and coalesce(u.unidade_id, '') <> ''
$$;

-- A unidade pode existir sem estar visível ao auditor pelo RLS da fase 1.
create function app.unidade_existe_para_auditoria(p_unidade text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.gere_auditoria()
    and exists (select 1 from public.unidades where id = p_unidade)
$$;

create function app.auditoria_modelo_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
declare
  eu public.usuarios := app.perfil();
  agora timestamptz := statement_timestamp();
  versao_esperada bigint := 1;
begin
  if not app.gere_auditoria() then
    raise exception 'Sem permissão para gerenciar o modelo.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if row(new.id, new.criado_em) is distinct from row(old.id, old.criado_em) then
      raise exception 'Identificador e data de criação são imutáveis.' using errcode = '42501';
    end if;
    versao_esperada := old.versao::bigint + case when
      row(new.itens, new.titulo, new.peso_total) is distinct from
      row(old.itens, old.titulo, old.peso_total) then 1 else 0 end;
  else
    if new.criado_em is not null and new.criado_em <> agora then
      raise exception 'Data de criação inválida.' using errcode = '42501';
    end if;
    new.criado_em := agora;
  end if;

  if new.versao is distinct from versao_esperada then
    raise exception 'Versão do modelo inválida.' using errcode = '42501';
  end if;
  if (new.atualizado_por is not null and new.atualizado_por is distinct from eu.id
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

create function app.auditoria_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
declare
  eu public.usuarios := app.perfil();
  agora timestamptz := statement_timestamp();
  campos_rascunho constant text[] := array[
    'modalidade', 'data_visita', 'respostas', 'qtd_ok', 'qtd_nao_ok', 'qtd_na',
    'pontos_obtidos', 'pontos_possiveis', 'score', 'nota_minima', 'checklist_execucao_id',
    'checklist_score', 'resultado', 'obs_geral', 'gerado_por_ia', 'ia_modelo', 'status',
    'assinatura_auditor_uid', 'assinatura_auditor_nome', 'assinatura_auditor_em', 'atualizado_em'];
  campos_ciencia constant text[] := array[
    'status', 'ciencia_uid', 'ciencia_nome', 'ciencia_em', 'contestacao', 'atualizado_em'];
begin
  if new.atualizado_em is not null and new.atualizado_em <> agora
    and (tg_op = 'INSERT' or new.atualizado_em is distinct from old.atualizado_em) then
    raise exception 'Data de atualização inválida.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if not app.gere_auditoria()
      or new.status is distinct from 'rascunho'
      or (new.auditor_uid is not null and new.auditor_uid is distinct from eu.id)
      or (new.auditor_nome is not null and new.auditor_nome is distinct from eu.nome)
      or (new.criado_em is not null and new.criado_em <> agora)
      or row(new.ciencia_uid, new.ciencia_nome, new.ciencia_em, new.contestacao)
        is distinct from row(null::uuid, ''::text, null::timestamptz, ''::text)
      or not app.unidade_existe_para_auditoria(new.unidade_id)
      or not exists (
        select 1 from public.auditoria_modelos m
        where m.id = new.modelo_id and m.ativo
          and row(m.versao, m.titulo, m.total_itens, m.peso_total) =
            row(new.modelo_versao, new.modelo_titulo, new.total_itens, new.peso_total)
      ) then
      raise exception 'Criação de auditoria incompatível com a unidade, autoria ou modelo.' using errcode = '42501';
    end if;
    new.auditor_uid := auth.uid();
    new.auditor_nome := eu.nome;
    new.criado_em := agora;
  elsif old.status = 'rascunho' then
    if not app.gere_auditoria()
      or (old.auditor_uid is distinct from eu.id and not app.eh_admin())
      or (to_jsonb(new) - campos_rascunho) is distinct from (to_jsonb(old) - campos_rascunho)
      or not coalesce(new.status in ('rascunho', 'aguardando_ciencia'), false) then
      raise exception 'Alteração de rascunho inválida.' using errcode = '42501';
    end if;
  else
    if old.status <> 'aguardando_ciencia'
      or new.status is distinct from 'concluida'
      or eu.papel is distinct from 'franqueado'
      or not app.da_unidade_auditada(eu)
      or old.unidade_id is distinct from eu.unidade_id
      or (to_jsonb(new) - campos_ciencia) is distinct from (to_jsonb(old) - campos_ciencia)
      or (new.ciencia_uid is not null and new.ciencia_uid is distinct from eu.id)
      or (new.ciencia_nome is distinct from old.ciencia_nome and new.ciencia_nome is distinct from eu.nome)
      or (new.ciencia_em is not null and new.ciencia_em <> agora) then
      raise exception 'Alteração de ciência inválida.' using errcode = '42501';
    end if;
    new.ciencia_uid := auth.uid();
    new.ciencia_nome := eu.nome;
    new.ciencia_em := agora;
    new.atualizado_em := agora;
    return new;
  end if;

  -- Auditores já leem as execuções pela política da fase 8. O score da
  -- auditoria usa o valor informado, como nas regras; a interface o recalcula.
  if (case when new.checklist_execucao_id = '' then new.checklist_score is not null
    else not coalesce(new.checklist_score between 0 and 100, false) or not exists (
      select 1 from public.checklist_execucoes e
      where e.id = new.checklist_execucao_id and e.unidade_id = new.unidade_id and e.score is not null
    )
  end) then
    raise exception 'Checklist de referência inválido.' using errcode = '42501';
  end if;

  if new.resultado is distinct from (case
    when new.score >= new.nota_minima and (new.checklist_score is null or new.checklist_score >= new.nota_minima)
    then 'aprovada' else 'reprovada' end) then
    raise exception 'Resultado incompatível com a nota mínima.' using errcode = '42501';
  end if;

  if new.status = 'rascunho' then
    if row(new.assinatura_auditor_uid, new.assinatura_auditor_nome, new.assinatura_auditor_em)
      is distinct from row(null::uuid, ''::text, null::timestamptz) then
      raise exception 'O rascunho não pode conter assinatura.' using errcode = '42501';
    end if;
  else
    if (new.assinatura_auditor_uid is not null and new.assinatura_auditor_uid is distinct from eu.id)
      or (new.assinatura_auditor_nome is distinct from old.assinatura_auditor_nome
        and new.assinatura_auditor_nome is distinct from eu.nome)
      or (new.assinatura_auditor_em is not null and new.assinatura_auditor_em <> agora) then
      raise exception 'Assinatura do auditor inválida.' using errcode = '42501';
    end if;
    new.assinatura_auditor_uid := auth.uid();
    new.assinatura_auditor_nome := eu.nome;
    new.assinatura_auditor_em := agora;
  end if;

  new.atualizado_em := agora;
  return new;
end
$$;

create function app.auditoria_acao_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
declare
  eu public.usuarios := app.perfil();
  agora timestamptz := statement_timestamp();
  campos_rede constant text[] := array[
    'status', 'descricao', 'responsavel', 'prazo', 'comentario_franqueadora',
    'atualizado_por', 'atualizado_por_nome', 'atualizado_em'];
  campos_unidade constant text[] := array[
    'status', 'evidencia_url', 'comentario_unidade',
    'atualizado_por', 'atualizado_por_nome', 'atualizado_em'];
begin
  if (new.atualizado_por is not null and new.atualizado_por is distinct from eu.id
        and (tg_op = 'INSERT' or new.atualizado_por is distinct from old.atualizado_por))
    or (new.atualizado_por_nome is not null and new.atualizado_por_nome is distinct from eu.nome
        and (tg_op = 'INSERT' or new.atualizado_por_nome is distinct from old.atualizado_por_nome))
    or (new.atualizado_em is not null and new.atualizado_em <> agora
        and (tg_op = 'INSERT' or new.atualizado_em is distinct from old.atualizado_em)) then
    raise exception 'Carimbo de atualização inválido.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    -- Quem cria é auditor e, pelo RLS, já pode consultar a auditoria.
    if not app.gere_auditoria()
      or new.status is distinct from 'aberta'
      or new.evidencia_url is distinct from ''
      or new.comentario_unidade is distinct from ''
      or (new.criado_em is not null and new.criado_em <> agora)
      or not exists (
        select 1 from public.auditorias a
        where a.id = new.auditoria_id and a.unidade_id = new.unidade_id
          and a.status in ('aguardando_ciencia', 'concluida')
      ) then
      raise exception 'O plano exige uma auditoria assinada da mesma unidade.' using errcode = '42501';
    end if;
    new.criado_em := agora;
  elsif app.gere_auditoria() then
    if old.status = 'validada'
      or (to_jsonb(new) - campos_rede) is distinct from (to_jsonb(old) - campos_rede)
      or not coalesce(new.status = old.status
        or (old.status = 'concluida_unidade' and new.status in ('validada', 'reaberta')), false) then
      raise exception 'Alteração do plano pela franqueadora inválida.' using errcode = '42501';
    end if;
  else
    if eu.papel is distinct from 'franqueado'
      or not app.da_unidade_auditada(eu)
      or old.unidade_id is distinct from eu.unidade_id
      or (to_jsonb(new) - campos_unidade) is distinct from (to_jsonb(old) - campos_unidade)
      or old.status not in ('aberta', 'em_andamento', 'reaberta')
      or not coalesce(new.status in ('em_andamento', 'concluida_unidade'), false)
      or (new.status = 'concluida_unidade' and not coalesce(app.link_https(new.evidencia_url, false), false)) then
      raise exception 'Alteração do plano pela unidade inválida.' using errcode = '42501';
    end if;
  end if;

  new.atualizado_por := auth.uid();
  new.atualizado_por_nome := eu.nome;
  new.atualizado_em := agora;
  return new;
end
$$;

revoke all on function app.da_unidade_auditada(public.usuarios),
  app.unidade_existe_para_auditoria(text),
  app.auditoria_modelo_antes_gravar(), app.auditoria_antes_gravar(), app.auditoria_acao_antes_gravar()
  from public, anon, authenticated, service_role;
grant execute on function app.da_unidade_auditada(public.usuarios),
  app.unidade_existe_para_auditoria(text) to authenticated;

create trigger auditoria_modelo_antes_gravar before insert or update on public.auditoria_modelos
  for each row when (app.da_api()) execute function app.auditoria_modelo_antes_gravar();
create trigger auditoria_antes_gravar before insert or update on public.auditorias
  for each row when (app.da_api()) execute function app.auditoria_antes_gravar();
create trigger auditoria_acao_antes_gravar before insert or update on public.auditoria_acoes
  for each row when (app.da_api()) execute function app.auditoria_acao_antes_gravar();

alter table public.auditoria_modelos enable row level security;
alter table public.auditorias enable row level security;
alter table public.auditoria_acoes enable row level security;
revoke all on public.auditoria_modelos, public.auditorias, public.auditoria_acoes from public, anon, authenticated;
grant select, insert, update on public.auditoria_modelos, public.auditorias, public.auditoria_acoes to authenticated;

create policy auditoria_modelos_leitura on public.auditoria_modelos for select to authenticated
  using ((select app.gere_auditoria()));
create policy auditoria_modelos_criacao on public.auditoria_modelos for insert to authenticated
  with check ((select app.gere_auditoria()));
create policy auditoria_modelos_edicao on public.auditoria_modelos for update to authenticated
  using ((select app.gere_auditoria()));

create policy auditorias_leitura on public.auditorias for select to authenticated
  using ((select app.gere_auditoria()) or (
    status in ('aguardando_ciencia', 'concluida')
    and ((select app.gere_acompanhamento()) or (
      unidade_id = (select app.minha_unidade_id()) and (select app.da_unidade_auditada(app.perfil()))
    ))
  ));
create policy auditorias_criacao on public.auditorias for insert to authenticated
  with check ((select app.gere_auditoria()));
create policy auditorias_edicao on public.auditorias for update to authenticated
  using ((select app.gere_auditoria()) or (
    unidade_id = (select app.minha_unidade_id())
    and (select app.da_unidade_auditada(app.perfil()) and (app.perfil()).papel = 'franqueado')
  ));

create policy auditoria_acoes_leitura on public.auditoria_acoes for select to authenticated
  using ((select app.gere_auditoria()) or (select app.gere_acompanhamento()) or (
    unidade_id = (select app.minha_unidade_id()) and (select app.da_unidade_auditada(app.perfil()))
  ));
create policy auditoria_acoes_criacao on public.auditoria_acoes for insert to authenticated
  with check ((select app.gere_auditoria()));
create policy auditoria_acoes_edicao on public.auditoria_acoes for update to authenticated
  using ((select app.gere_auditoria()) or (
    unidade_id = (select app.minha_unidade_id())
    and (select app.da_unidade_auditada(app.perfil()) and (app.perfil()).papel = 'franqueado')
  ));

-- A RPC grava o lote inteiro como quem chama. RLS e gatilhos aplicam as
-- mesmas regras de uma inserção avulsa. O get() do Firestore exige uma
-- auditoria já assinada antes do lote, então a RPC não assina o rascunho.
create function public.criar_acoes_auditoria(p_auditoria_id text, p_acoes jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  unidade text;
begin
  if not app.gere_auditoria() then
    raise exception 'Sem permissão para criar planos de ação.' using errcode = '42501';
  end if;

  select a.unidade_id into unidade from public.auditorias a
    where a.id = p_auditoria_id and a.status in ('aguardando_ciencia', 'concluida');
  if not found then
    raise exception 'O plano exige uma auditoria assinada.' using errcode = '42501';
  end if;

  insert into public.auditoria_acoes (
    id, auditoria_id, unidade_id, item_id, item_texto, descricao, responsavel, prazo, comentario_franqueadora
  )
  select coalesce(acao.id, gen_random_uuid()::text), p_auditoria_id, unidade,
    acao.item_id, acao.item_texto, acao.descricao, acao.responsavel, acao.prazo, coalesce(acao.comentario_franqueadora, '')
  from jsonb_to_recordset(p_acoes) as acao (
    id text, item_id text, item_texto text, descricao text, responsavel text, prazo timestamptz, comentario_franqueadora text
  );
end
$$;

revoke all on function public.criar_acoes_auditoria(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.criar_acoes_auditoria(text, jsonb) to authenticated;
