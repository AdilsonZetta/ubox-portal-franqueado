-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
-- As três coleções de Marketing são independentes. Cada ação grava uma única
-- linha, com RLS e gatilho na mesma transação, sem necessidade de RPC em lote.

create function app.gere_marketing(u public.usuarios) returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u)
    and (u.papel = 'admin' or (u.papel = 'equipe_franqueadora' and app.tem_modulo(u, 'marketing')))
$$;

create function app.unidade_marketing(u public.usuarios) returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and u.papel in ('franqueado', 'equipe_franqueado')
    and app.tem_modulo(u, 'marketing') and app.unidade_ativa(u)
$$;

create function app.link_https(v text, opcional boolean) returns boolean
language sql immutable set search_path = '' as $$
  select char_length(v) <= 600 and ((opcional and v = '') or v ~ '^https://[^[:space:]]+$')
$$;

create function app.lista_unidades_marketing_ok(v text[]) returns boolean
language sql immutable set search_path = '' as $$
  select cardinality(v) <= 30 and coalesce(array_ndims(v), 1) = 1
    and not exists (select 1 from unnest(v) as t(id) where id is null or char_length(id) not between 1 and 64)
$$;

create function app.marketing_ia_ok(gerado boolean, modelo text) returns boolean
language sql immutable set search_path = '' as $$
  select char_length(modelo) <= 80
    and (not gerado or (char_length(modelo) >= 2 and modelo ~ '[^[:space:]]'))
$$;

create table public.marketing_materiais (
  id text primary key default gen_random_uuid()::text,
  titulo text not null check (char_length(titulo) between 2 and 120),
  descricao text not null default '' check (char_length(descricao) <= 1000),
  tipo text not null default 'arte' check (tipo in ('arte', 'campanha', 'logo', 'marca', 'template', 'video', 'outro')),
  categoria text not null default '' check (char_length(categoria) <= 60),
  campanha_id text not null default '' check (char_length(campanha_id) <= 64),
  url text not null check (app.link_https(url, false)),
  previa_url text not null default '' check (app.link_https(previa_url, true)),
  formato text not null default '' check (char_length(formato) <= 40),
  regras_uso text not null default '' check (char_length(regras_uso) <= 1000),
  valido_de timestamptz,
  valido_ate timestamptz,
  publico boolean not null default true,
  unidades text[] not null default '{}' check (app.lista_unidades_marketing_ok(unidades)),
  ativo boolean not null default true,
  gerado_por_ia boolean not null default false,
  ia_modelo text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null default now(),
  check (publico = (cardinality(unidades) = 0)),
  check (app.marketing_ia_ok(gerado_por_ia, ia_modelo))
);

create table public.marketing_campanhas (
  id text primary key default gen_random_uuid()::text,
  titulo text not null check (char_length(titulo) between 2 and 120),
  descricao text not null default '' check (char_length(descricao) <= 1000),
  tipo text not null default 'campanha' check (tipo in ('campanha', 'data_comemorativa', 'lancamento')),
  inicio timestamptz not null,
  fim timestamptz not null check (fim >= inicio),
  ativo boolean not null default true,
  gerado_por_ia boolean not null default false,
  ia_modelo text not null default '',
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null default now(),
  check (app.marketing_ia_ok(gerado_por_ia, ia_modelo))
);

create table public.marketing_solicitacoes (
  id text primary key default gen_random_uuid()::text,
  uid uuid not null references public.usuarios(id),
  nome text not null,
  unidade_id text not null,
  unidade_nome text not null,
  titulo text not null check (char_length(titulo) between 2 and 120),
  tipo_peca text not null check (tipo_peca in ('post', 'story', 'banner', 'panfleto', 'fachada', 'video', 'outro')),
  descricao text not null check (char_length(descricao) between 10 and 2000),
  medidas text not null default '' check (char_length(medidas) <= 120),
  prazo_desejado timestamptz,
  referencia_url text not null default '' check (app.link_https(referencia_url, true)),
  campanha_id text not null default '' check (char_length(campanha_id) <= 64),
  status text not null default 'aberta' check (status in ('aberta', 'em_producao', 'aguardando_unidade', 'entregue', 'cancelada')),
  complemento text not null default '' check (char_length(complemento) <= 2000),
  resposta text not null default '' check (char_length(resposta) <= 2000),
  entrega_url text not null default '' check (app.link_https(entrega_url, true)),
  gerado_por_ia boolean not null default false,
  ia_modelo text not null default '',
  responsavel_nome text not null default '' check (char_length(responsavel_nome) <= 120),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  entregue_em timestamptz,
  check (app.marketing_ia_ok(gerado_por_ia, ia_modelo))
);

create index marketing_solicitacoes_unidade_idx on public.marketing_solicitacoes (unidade_id, id);
create index marketing_solicitacoes_autor_idx on public.marketing_solicitacoes (uid, id);

create function app.marketing_antes_publicacao() returns trigger
language plpgsql set search_path = '' as $$
declare
  eu public.usuarios;
begin
  if not app.da_api() then return new; end if;
  eu := app.perfil();
  if not app.gere_marketing(eu) then
    raise exception 'Sem permissão para publicar.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    raise exception 'Identificador imutável.' using errcode = '42501';
  end if;
  if tg_table_name = 'marketing_materiais' then
    if tg_op = 'INSERT' then
      new.criado_em := statement_timestamp();
    elsif new.criado_em is distinct from old.criado_em then
      raise exception 'Data de criação imutável.' using errcode = '42501';
    end if;
  end if;
  -- Um valor omitido em UPDATE mantém o valor anterior antes do carimbo.
  if (new.atualizado_por is not null and new.atualizado_por is distinct from auth.uid()
      and (tg_op = 'INSERT' or new.atualizado_por is distinct from old.atualizado_por))
    or (new.atualizado_por_nome is not null and new.atualizado_por_nome is distinct from eu.nome
      and (tg_op = 'INSERT' or new.atualizado_por_nome is distinct from old.atualizado_por_nome)) then
    raise exception 'Autoria inválida.' using errcode = '42501';
  end if;
  new.atualizado_por := auth.uid();
  new.atualizado_por_nome := eu.nome;
  new.atualizado_em := statement_timestamp();
  return new;
end
$$;

create function app.marketing_antes_solicitacao() returns trigger
language plpgsql set search_path = '' as $$
declare
  eu public.usuarios;
  chaves text[];
begin
  if not app.da_api() then return new; end if;
  eu := app.perfil();
  new.atualizado_em := statement_timestamp();
  if tg_op = 'INSERT' then
    if not app.unidade_marketing(eu)
      or (new.uid is not null and new.uid is distinct from auth.uid())
      or (new.nome is not null and new.nome is distinct from eu.nome)
      or (new.unidade_id is not null and new.unidade_id is distinct from eu.unidade_id)
      or (new.unidade_nome is not null and new.unidade_nome is distinct from eu.unidade)
      or new.status is distinct from 'aberta' or new.complemento is distinct from ''
      or new.resposta is distinct from '' or new.entrega_url is distinct from ''
      or new.gerado_por_ia is distinct from false or new.ia_modelo is distinct from ''
      or new.responsavel_nome is distinct from '' or new.entregue_em is not null then
      raise exception 'Abertura de solicitação inválida.' using errcode = '42501';
    end if;
    new.uid := auth.uid();
    new.nome := eu.nome;
    new.unidade_id := eu.unidade_id;
    new.unidade_nome := eu.unidade;
    new.criado_em := new.atualizado_em;
    return new;
  end if;

  if app.gere_marketing(eu) then
    chaves := array['status', 'resposta', 'entrega_url', 'gerado_por_ia', 'ia_modelo',
      'responsavel_nome', 'atualizado_em', 'entregue_em'];
    if old.status not in ('aberta', 'em_producao', 'aguardando_unidade')
      or not coalesce(new.status in ('em_producao', 'aguardando_unidade', 'entregue', 'cancelada'), false)
      or (new.status is not distinct from old.status and new.resposta is not distinct from old.resposta)
      or (new.responsavel_nome is distinct from old.responsavel_nome and new.responsavel_nome is distinct from eu.nome)
      or (new.status = 'entregue' and coalesce(new.entrega_url, '') = '')
      or (new.status <> 'entregue' and new.entregue_em is not null) then
      raise exception 'Andamento da solicitação inválido.' using errcode = '42501';
    end if;
    new.responsavel_nome := eu.nome;
    new.entregue_em := case when new.status = 'entregue' then new.atualizado_em end;
  elsif app.unidade_marketing(eu) and eu.unidade_id = old.unidade_id
    and (old.uid = auth.uid() or eu.papel = 'franqueado') then
    chaves := array['status', 'complemento', 'atualizado_em'];
    if not coalesce((old.status = 'aberta' and new.status = 'cancelada')
      or (old.status = 'aguardando_unidade' and new.status = 'aberta'
        and char_length(new.complemento) >= 2 and new.complemento is distinct from old.complemento), false) then
      raise exception 'Ação da unidade inválida.' using errcode = '42501';
    end if;
  else
    raise exception 'Sem permissão para alterar a solicitação.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - chaves) is distinct from (to_jsonb(old) - chaves) then
    raise exception 'A alteração inclui campos protegidos.' using errcode = '42501';
  end if;
  return new;
end
$$;

revoke all on function app.gere_marketing(public.usuarios), app.unidade_marketing(public.usuarios),
  app.link_https(text, boolean), app.lista_unidades_marketing_ok(text[]), app.marketing_ia_ok(boolean, text),
  app.marketing_antes_publicacao(), app.marketing_antes_solicitacao() from public, anon, authenticated;
grant execute on function app.gere_marketing(public.usuarios), app.unidade_marketing(public.usuarios),
  app.link_https(text, boolean), app.lista_unidades_marketing_ok(text[]), app.marketing_ia_ok(boolean, text)
  to authenticated;

create trigger marketing_materiais_antes before insert or update on public.marketing_materiais
  for each row execute function app.marketing_antes_publicacao();
create trigger marketing_campanhas_antes before insert or update on public.marketing_campanhas
  for each row execute function app.marketing_antes_publicacao();
create trigger marketing_solicitacoes_antes before insert or update on public.marketing_solicitacoes
  for each row execute function app.marketing_antes_solicitacao();

alter table public.marketing_materiais enable row level security;
alter table public.marketing_campanhas enable row level security;
alter table public.marketing_solicitacoes enable row level security;

revoke all on public.marketing_materiais, public.marketing_campanhas, public.marketing_solicitacoes from anon, authenticated;
grant select, insert, update on public.marketing_materiais, public.marketing_campanhas, public.marketing_solicitacoes to authenticated;

create policy marketing_materiais_leitura on public.marketing_materiais for select to authenticated
  using ((select app.gere_marketing(app.perfil()))
    or (ativo and (select app.unidade_marketing(app.perfil()))
      and (publico or (select app.minha_unidade_id()) = any(unidades))));
create policy marketing_materiais_criacao on public.marketing_materiais for insert to authenticated
  with check ((select app.gere_marketing(app.perfil())));
create policy marketing_materiais_edicao on public.marketing_materiais for update to authenticated
  using ((select app.gere_marketing(app.perfil())));

create policy marketing_campanhas_leitura on public.marketing_campanhas for select to authenticated
  using ((select app.gere_marketing(app.perfil())) or (ativo and (select app.unidade_marketing(app.perfil()))));
create policy marketing_campanhas_criacao on public.marketing_campanhas for insert to authenticated
  with check ((select app.gere_marketing(app.perfil())));
create policy marketing_campanhas_edicao on public.marketing_campanhas for update to authenticated
  using ((select app.gere_marketing(app.perfil())));

-- O autor lê os próprios pedidos mesmo após mudar de unidade.
-- O franqueado também lê todos os pedidos da unidade atual.
create policy marketing_solicitacoes_leitura on public.marketing_solicitacoes for select to authenticated
  using ((select app.gere_marketing(app.perfil()))
    or (select app.gere_acompanhamento())
    or ((select app.unidade_marketing(app.perfil()))
      and (uid = (select auth.uid())
        or (unidade_id = (select app.minha_unidade_id())
          and (select (app.perfil()).papel = 'franqueado')))));
create policy marketing_solicitacoes_criacao on public.marketing_solicitacoes for insert to authenticated
  with check ((select app.unidade_marketing(app.perfil()))
    and uid = (select auth.uid()) and unidade_id = (select app.minha_unidade_id()));
create policy marketing_solicitacoes_edicao on public.marketing_solicitacoes for update to authenticated
  using ((select app.gere_marketing(app.perfil()))
    or ((select app.unidade_marketing(app.perfil())) and unidade_id = (select app.minha_unidade_id())
      and (uid = (select auth.uid()) or (select (app.perfil()).papel = 'franqueado'))));
