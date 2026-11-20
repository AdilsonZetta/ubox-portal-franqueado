-- Fase 3: manuais, documentos, avisos e registros de estudo.
-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

create table public.categorias (
  id text primary key default gen_random_uuid()::text,
  nome text not null check (char_length(nome) between 2 and 120),
  descricao text not null default '' check (char_length(descricao) <= 600),
  ordem numeric not null default 0,
  parent_id text check (char_length(parent_id) <= 80),
  publico boolean,
  unidades text[] not null default '{}' check (cardinality(unidades) <= 80),
  papeis text[] not null default '{}' check (cardinality(papeis) <= 4),
  uids_extra uuid[] not null default '{}' check (cardinality(uids_extra) <= 500),
  uids uuid[] not null default '{}' check (cardinality(uids) <= 500),
  criado_em timestamptz default now(),
  atualizado_em timestamptz not null default now()
);

create table public.documentos (
  id text primary key default gen_random_uuid()::text,
  titulo text not null check (char_length(titulo) between 2 and 120),
  categoria_id text not null check (char_length(categoria_id) between 1 and 80),
  tipo text not null default 'manual' check (tipo in ('pop', 'manual', 'processo', 'politica', 'checklist', 'html')),
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado')),
  versao integer not null default 1 check (versao >= 1 and versao < 10000),
  leitura_obrigatoria boolean not null default false,
  formato text not null default 'richtext' check (formato in ('richtext', 'html')),
  conteudo_html text not null default '' check (char_length(conteudo_html) < 900000),
  conteudo_texto text not null default '' check (char_length(conteudo_texto) < 900000),
  html_conteudo text not null default '' check (char_length(html_conteudo) < 900000),
  html_url text not null default '' check (char_length(html_url) <= 2000 and (html_url = '' or html_url ~ '^https?://')),
  anexos jsonb not null default '[]' check (case when jsonb_typeof(anexos) = 'array' then jsonb_array_length(anexos) <= 30 else false end),
  publico boolean not null default false,
  unidades text[] not null default '{}' check (cardinality(unidades) <= 80),
  papeis text[] not null default '{}' check (cardinality(papeis) <= 4),
  uids_extra uuid[] not null default '{}' check (cardinality(uids_extra) <= 500),
  uids uuid[] not null default '{}' check (cardinality(uids) <= 500),
  criado_em timestamptz default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios (id) on delete set null,
  atualizado_por_nome text not null default '' check (char_length(atualizado_por_nome) <= 120),
  publicado_em timestamptz
);

-- O id local da versão é reutilizado em outros documentos.
create table public.documento_versoes (
  id text generated always as (documento_id || '/versoes/' || versao_id) stored primary key,
  documento_id text not null references public.documentos (id) on delete cascade,
  versao_id text not null check (versao_id <> '' and strpos(versao_id, '/') = 0),
  versao integer not null default 1 check (versao >= 1),
  titulo text not null check (char_length(titulo) between 2 and 120),
  formato text not null default 'richtext' check (formato in ('richtext', 'html')),
  conteudo_html text not null default '' check (char_length(conteudo_html) < 900000),
  conteudo_texto text not null default '' check (char_length(conteudo_texto) < 900000),
  html_conteudo text not null default '' check (char_length(html_conteudo) < 900000),
  html_url text not null default '' check (char_length(html_url) <= 2000 and (html_url = '' or html_url ~ '^https?://')),
  criado_em timestamptz not null default now(),
  autor_id uuid references public.usuarios (id) on delete set null,
  autor_nome text not null default '' check (char_length(autor_nome) <= 120)
);

create table public.trilhas (
  id text primary key default gen_random_uuid()::text,
  titulo text not null check (char_length(titulo) between 2 and 120),
  descricao text not null default '' check (char_length(descricao) <= 2000),
  nota_minima integer not null default 0 check (nota_minima between 0 and 100),
  publicado boolean,
  itens jsonb not null default '[]' check (case when jsonb_typeof(itens) = 'array' then jsonb_array_length(itens) <= 40 else false end),
  publico boolean,
  unidades text[] not null default '{}' check (cardinality(unidades) <= 80),
  papeis text[] not null default '{}' check (cardinality(papeis) <= 4),
  uids_extra uuid[] not null default '{}' check (cardinality(uids_extra) <= 500),
  uids uuid[] not null default '{}' check (cardinality(uids) <= 500),
  criado_em timestamptz default now(),
  atualizado_em timestamptz not null default now()
);

create table public.quizzes (
  id text primary key default gen_random_uuid()::text,
  trilha_id text not null default '' check (char_length(trilha_id) <= 80),
  titulo text not null check (char_length(titulo) between 2 and 120),
  nota_minima integer not null default 0 check (nota_minima between 0 and 100),
  perguntas jsonb not null default '[]' check (case when jsonb_typeof(perguntas) = 'array' then jsonb_array_length(perguntas) <= 40 else false end),
  publicado boolean not null default false,
  publico boolean not null default false,
  unidades text[] not null default '{}' check (cardinality(unidades) <= 80),
  papeis text[] not null default '{}' check (cardinality(papeis) <= 4),
  uids_extra uuid[] not null default '{}' check (cardinality(uids_extra) <= 500),
  uids uuid[] not null default '{}' check (cardinality(uids) <= 500),
  criado_em timestamptz default now(),
  atualizado_em timestamptz not null default now()
);

-- O id local do gabarito também pode se repetir (por exemplo, "oficial").
create table public.quiz_gabaritos (
  id text generated always as (quiz_id || '/gabarito/' || gabarito_id) stored primary key,
  quiz_id text not null references public.quizzes (id) on delete cascade,
  gabarito_id text not null check (gabarito_id <> '' and strpos(gabarito_id, '/') = 0),
  respostas jsonb check (jsonb_typeof(respostas) = 'array'),
  dados jsonb not null default '{}' check (jsonb_typeof(dados) = 'object')
);

-- Formatos anteriores ao campo respostas ficam no objeto dados.
create table public.gabaritos (
  id text primary key default gen_random_uuid()::text,
  respostas jsonb check (jsonb_typeof(respostas) = 'array'),
  dados jsonb not null default '{}' check (jsonb_typeof(dados) = 'object')
);

create table public.avisos (
  id text primary key default gen_random_uuid()::text,
  titulo text not null check (char_length(titulo) between 2 and 120),
  mensagem text not null default '' check (char_length(mensagem) <= 600),
  documento_id text not null default '' check (char_length(documento_id) <= 80),
  tipo text not null default 'geral' check (tipo in ('novo', 'atualizado', 'geral')),
  publico boolean not null default false,
  unidades text[] not null default '{}' check (cardinality(unidades) <= 80),
  papeis text[] not null default '{}' check (cardinality(papeis) <= 4),
  uids_extra uuid[] not null default '{}' check (cardinality(uids_extra) <= 500),
  uids uuid[] not null default '{}' check (cardinality(uids) <= 500),
  criado_em timestamptz not null default now()
);

create table public.leituras (
  id text primary key,
  uid uuid not null references public.usuarios (id) on delete cascade,
  documento_id text not null check (char_length(documento_id) between 1 and 80),
  versao integer not null default 1 check (versao >= 1),
  titulo text not null default '' check (char_length(titulo) <= 180),
  lido_em timestamptz not null default now()
);

create table public.aceites (
  id text primary key,
  uid uuid not null references public.usuarios (id) on delete cascade,
  documento_id text not null check (char_length(documento_id) between 1 and 80),
  versao integer not null,
  titulo text not null default '' check (char_length(titulo) <= 180),
  nome text not null,
  email text not null,
  texto text not null check (texto = 'Li e concordo'),
  aceito_em timestamptz not null default now()
);

create table public.tentativas (
  id text primary key default gen_random_uuid()::text,
  uid uuid not null references public.usuarios (id) on delete cascade,
  quiz_id text not null check (char_length(quiz_id) between 1 and 80),
  trilha_id text not null default '' check (char_length(trilha_id) <= 80),
  nota integer not null default 0 check (nota between 0 and 100),
  aprovado boolean,
  respostas jsonb not null default '[]' check (case when jsonb_typeof(respostas) = 'array' then jsonb_array_length(respostas) <= 40 else false end),
  respondido_em timestamptz not null default now()
);

create table public.certificados (
  id text primary key,
  uid uuid not null references public.usuarios (id) on delete cascade,
  trilha_id text not null check (char_length(trilha_id) between 1 and 80),
  nome text not null,
  trilha_titulo text not null check (char_length(trilha_titulo) between 2 and 120),
  codigo text not null check (char_length(codigo) between 6 and 40),
  tentativa_id text not null check (char_length(tentativa_id) <= 120),
  emitido_em timestamptz not null default now()
);

create table public.avisos_leituras (
  id text primary key,
  uid uuid not null references public.usuarios (id) on delete cascade,
  aviso_id text not null check (char_length(aviso_id) between 1 and 80),
  lida_em timestamptz not null default now()
);

create table public.manuais_trilha (
  id text primary key,
  documento_id text not null,
  titulo text not null check (char_length(titulo) between 1 and 200),
  etapa text not null default '' check (char_length(etapa) <= 80),
  ordem integer not null default 1 check (ordem between 1 and 999),
  tempo_minimo_seg integer not null,
  video_minutos integer not null default 0 check (video_minutos between 0 and 600),
  anterior_id text not null default '' check (char_length(anterior_id) <= 128),
  ativo boolean not null default true,
  atualizado_por uuid references public.usuarios (id) on delete set null,
  atualizado_por_nome text not null check (char_length(atualizado_por_nome) between 2 and 120),
  atualizado_em timestamptz not null default now()
);

create table public.progresso_manuais (
  id text primary key,
  uid uuid not null references public.usuarios (id) on delete cascade,
  documento_id text not null check (char_length(documento_id) between 1 and 128),
  nome text not null,
  unidade_id text not null,
  unidade_nome text not null check (char_length(unidade_nome) <= 120),
  status text not null default 'em_andamento' check (status in ('em_andamento', 'concluido')),
  reinicios integer not null default 0 check (reinicios between 0 and 100000),
  tempo_minimo_seg integer not null,
  concluido_em timestamptz,
  iniciado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.reestudos (
  id text primary key,
  uid uuid not null references public.usuarios (id) on delete cascade,
  curso_id text not null check (curso_id ~ '^[A-Za-z0-9-]{1,64}$'),
  ciclo integer not null default 1 check (ciclo between 1 and 50),
  documento_id text not null,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'concluido')),
  reinicios bigint not null default 0,
  concluido_em timestamptz,
  iniciado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index categorias_uids_idx on public.categorias using gin (uids);
create index documentos_uids_idx on public.documentos using gin (uids);
create index trilhas_uids_idx on public.trilhas using gin (uids);
create index quizzes_uids_idx on public.quizzes using gin (uids);
create index avisos_uids_idx on public.avisos using gin (uids);
create index documento_versoes_documento_id_idx on public.documento_versoes (documento_id);
create index quiz_gabaritos_quiz_id_idx on public.quiz_gabaritos (quiz_id);
create index leituras_uid_idx on public.leituras (uid);
create index aceites_uid_idx on public.aceites (uid);
create index tentativas_uid_idx on public.tentativas (uid);
create index certificados_uid_idx on public.certificados (uid);
create index avisos_leituras_uid_idx on public.avisos_leituras (uid);
create index progresso_manuais_uid_idx on public.progresso_manuais (uid);
create index reestudos_uid_idx on public.reestudos (uid);
create index progresso_manuais_unidade_id_idx on public.progresso_manuais (unidade_id);
create index documentos_conteudo_texto_idx on public.documentos
  using gin (to_tsvector('pg_catalog.portuguese', conteudo_texto));

alter table public.categorias enable row level security;
revoke all on public.categorias from public, anon, authenticated;
grant select, insert, update, delete on public.categorias to authenticated;

alter table public.documentos enable row level security;
revoke all on public.documentos from public, anon, authenticated;
grant select, insert, update, delete on public.documentos to authenticated;

alter table public.documento_versoes enable row level security;
revoke all on public.documento_versoes from public, anon, authenticated;
grant select, insert on public.documento_versoes to authenticated;

alter table public.trilhas enable row level security;
revoke all on public.trilhas from public, anon, authenticated;
grant select, insert, update, delete on public.trilhas to authenticated;

alter table public.quizzes enable row level security;
revoke all on public.quizzes from public, anon, authenticated;
grant select, insert, update, delete on public.quizzes to authenticated;

alter table public.quiz_gabaritos enable row level security;
revoke all on public.quiz_gabaritos from public, anon, authenticated;
grant select, insert, update, delete on public.quiz_gabaritos to authenticated;

alter table public.gabaritos enable row level security;
revoke all on public.gabaritos from public, anon, authenticated;
grant select, insert, update, delete on public.gabaritos to authenticated;

alter table public.avisos enable row level security;
revoke all on public.avisos from public, anon, authenticated;
grant select, insert, delete on public.avisos to authenticated;

alter table public.leituras enable row level security;
revoke all on public.leituras from public, anon, authenticated;
grant select, insert on public.leituras to authenticated;

alter table public.aceites enable row level security;
revoke all on public.aceites from public, anon, authenticated;
grant select, insert on public.aceites to authenticated;

alter table public.tentativas enable row level security;
revoke all on public.tentativas from public, anon, authenticated;
grant select on public.tentativas to authenticated;

alter table public.certificados enable row level security;
revoke all on public.certificados from public, anon, authenticated;
grant select, insert on public.certificados to authenticated;

alter table public.avisos_leituras enable row level security;
revoke all on public.avisos_leituras from public, anon, authenticated;
grant select, insert on public.avisos_leituras to authenticated;

alter table public.manuais_trilha enable row level security;
revoke all on public.manuais_trilha from public, anon, authenticated;
grant select, insert, update on public.manuais_trilha to authenticated;

alter table public.progresso_manuais enable row level security;
revoke all on public.progresso_manuais from public, anon, authenticated;
grant select, insert, update on public.progresso_manuais to authenticated;

alter table public.reestudos enable row level security;
revoke all on public.reestudos from public, anon, authenticated;
grant select, insert, update on public.reestudos to authenticated;

-- Predicados de perfil. Os módulos sem exceção de admin usam tem_modulo diretamente.
create function app.fase3_ativo() returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and app.unidade_ativa(u) from app.perfil() as u
$$;

create function app.fase3_gere(modulo text) returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and (
    u.papel = 'admin' or (u.papel = 'equipe_franqueadora' and app.tem_modulo(u, modulo))
  ) from app.perfil() as u
$$;

create function app.fase3_aluno(modulo text) returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and app.unidade_ativa(u)
    and u.papel in ('franqueado', 'equipe_franqueado') and app.tem_modulo(u, modulo)
  from app.perfil() as u
$$;

-- Leituras e aceites não exigem o módulo manuais nas regras de origem.
create function app.fase3_documento_atual(doc text, v integer, obrigatorio boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.fase3_ativo() and exists (
    select 1 from public.documentos d where d.id = doc and d.versao = v
      and d.status = 'publicado' and (not obrigatorio or d.leitura_obrigatoria)
      and (app.eh_admin() or d.publico or (select auth.uid()) = any(d.uids))
  )
$$;

create function app.fase3_certificado_liberado(trilha text, tentativa text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.fase3_ativo() and app.tem_modulo(app.perfil(), 'universidade')) then
    return false;
  end if;

  -- As tabelas de curso e prova são entregues em uma fase posterior.
  if tentativa <> '' and to_regclass('public.cursos') is not null
    and to_regclass('public.tentativas_prova') is not null then
    if exists (
      select 1 from public.cursos c
      join public.tentativas_prova t on t.curso_id = c.id
      where c.id = trilha and t.id = tentativa and t.uid = (select auth.uid()) and t.aprovado
    ) then
      return true;
    end if;
  end if;

  return exists (
    select 1 from public.trilhas l where l.id = trilha and l.publicado and (
      (tentativa <> '' and tentativa <> 'sem-quiz' and exists (
        select 1 from public.tentativas t where t.id = tentativa
          and t.uid = (select auth.uid()) and t.trilha_id = l.id and t.aprovado
      ))
      or (tentativa = 'sem-quiz' and jsonb_array_length(l.itens) <= 12 and not exists (
        select 1 from jsonb_array_elements(l.itens) as i(item)
        where (i.item ->> 'tipo') is null or i.item ->> 'tipo' = 'quiz'
      ))
    )
  );
end
$$;

create function app.fase3_item_valido(doc text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.fase3_gere('manuais') and exists (select 1 from public.documentos where id = doc)
$$;

create function app.fase3_manual_liberado(doc text, tempo integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.fase3_aluno('manuais') and exists (
    select 1 from public.manuais_trilha m where m.id = doc and m.ativo and m.tempo_minimo_seg = tempo
      and (m.anterior_id = '' or exists (
        select 1 from public.progresso_manuais p
        where p.id = (select auth.uid())::text || '_' || m.anterior_id and p.status = 'concluido'
      ))
  )
$$;

create function app.fase3_tempo_manual(doc text) returns integer
language sql stable security definer set search_path = '' as $$
  select m.tempo_minimo_seg from public.manuais_trilha m
  where m.id = doc and app.fase3_aluno('manuais')
$$;

create function app.fase3_reestudo_liberado(curso text, ciclo integer, doc text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.fase3_aluno('universidade') or to_regclass('public.provas') is null
    or to_regclass('public.tentativas_prova') is null then
    return false;
  end if;
  return exists (select 1 from public.provas p where p.id = curso and p.manual_retorno_id = doc)
    and exists (
      select 1 from public.tentativas_prova t
      where t.id = (select auth.uid())::text || '_' || curso || '_' || ciclo || '_3'
        and t.aprovado = false
    );
end
$$;

create function app.fase3_reestudo_pode_concluir(chave text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if to_regclass('public.provas') is null then
    return false;
  end if;
  return exists (
    select 1 from public.reestudos r join public.provas p on p.id = r.curso_id
    where r.id = chave and r.uid = (select auth.uid())
      and now() >= r.iniciado_em + make_interval(secs => p.tempo_reestudo_seg)
  );
end
$$;

revoke all on function app.fase3_ativo(), app.fase3_gere(text), app.fase3_aluno(text),
  app.fase3_documento_atual(text, integer, boolean), app.fase3_certificado_liberado(text, text),
  app.fase3_item_valido(text), app.fase3_manual_liberado(text, integer), app.fase3_tempo_manual(text),
  app.fase3_reestudo_liberado(text, integer, text), app.fase3_reestudo_pode_concluir(text)
  from public, anon, authenticated;
grant execute on function app.fase3_ativo(), app.fase3_gere(text), app.fase3_aluno(text),
  app.fase3_documento_atual(text, integer, boolean), app.fase3_certificado_liberado(text, text),
  app.fase3_item_valido(text), app.fase3_manual_liberado(text, integer), app.fase3_tempo_manual(text),
  app.fase3_reestudo_liberado(text, integer, text), app.fase3_reestudo_pode_concluir(text)
  to authenticated;

-- Carimbos simples e identidade imutável do documento.
create function app.fase3_carimbar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.da_api() then return new; end if;

  if tg_op = 'UPDATE' and tg_argv[0] <> 'quiz_id' and new.id is distinct from old.id then
    raise exception 'O id do documento é imutável.' using errcode = '42501';
  end if;
  case tg_argv[0]
    when 'cadastro' then
      if tg_op = 'INSERT' or old.criado_em is null then
        new.criado_em := now();
      elsif new.criado_em is distinct from old.criado_em then
        raise exception 'A data de criação é imutável.' using errcode = '42501';
      end if;
      new.atualizado_em := now();
    when 'criado_em' then new.criado_em := now();
    when 'atualizado_em' then new.atualizado_em := now();
    when 'lido_em' then new.lido_em := now();
    when 'aceito_em' then new.aceito_em := now();
    when 'emitido_em' then new.emitido_em := now();
    when 'lida_em' then new.lida_em := now();
    when 'inicio_explicito' then
      if new.iniciado_em is distinct from now() then
        raise exception 'O início do cronômetro é definido pelo servidor.' using errcode = '42501';
      end if;
    when 'quiz_id' then
      if new.quiz_id is distinct from old.quiz_id or new.gabarito_id is distinct from old.gabarito_id then
        raise exception 'O caminho do gabarito é imutável.' using errcode = '42501';
      end if;
    else null;
  end case;
  return new;
end
$$;

-- A máquina de estados é compartilhada, mas só o progresso exige perfil ativo no UPDATE.
create function app.fase3_cronometro() returns trigger
language plpgsql set search_path = '' as $$
declare
  progresso boolean := tg_table_name = 'progresso_manuais';
  tempo integer;
begin
  if not app.da_api() then return new; end if;
  new.atualizado_em := now();

  if tg_op = 'INSERT' then
    new.iniciado_em := now();
    return new;
  end if;

  if progresso then
    tempo := app.fase3_tempo_manual(old.documento_id);
  end if;

  if old.status = 'em_andamento' and new.status = 'em_andamento'
    and new.reinicios = old.reinicios + 1 then
    if progresso then
      if (to_jsonb(new) - array['iniciado_em', 'reinicios', 'tempo_minimo_seg', 'atualizado_em'])
        is not distinct from (to_jsonb(old) - array['iniciado_em', 'reinicios', 'tempo_minimo_seg', 'atualizado_em'])
        and new.tempo_minimo_seg = tempo then
        new.iniciado_em := now();
        return new;
      end if;
    elsif (to_jsonb(new) - array['iniciado_em', 'reinicios', 'atualizado_em'])
      is not distinct from (to_jsonb(old) - array['iniciado_em', 'reinicios', 'atualizado_em']) then
      new.iniciado_em := now();
      return new;
    end if;
  end if;

  if old.status = 'em_andamento' and new.status = 'concluido'
    and (to_jsonb(new) - array['status', 'concluido_em', 'atualizado_em'])
      is not distinct from (to_jsonb(old) - array['status', 'concluido_em', 'atualizado_em']) then
    if (progresso and now() >= old.iniciado_em + make_interval(secs => tempo))
      or (not progresso and app.fase3_reestudo_pode_concluir(old.id)) then
      new.concluido_em := now();
      return new;
    end if;
  end if;

  raise exception 'Alteração inválida do cronômetro.' using errcode = '42501';
end
$$;

revoke all on function app.fase3_carimbar(), app.fase3_cronometro() from public, anon, authenticated;
create trigger categorias_carimbo before insert or update on public.categorias
  for each row execute function app.fase3_carimbar('cadastro');
create trigger documentos_carimbo before insert or update on public.documentos
  for each row execute function app.fase3_carimbar('cadastro');
create trigger trilhas_carimbo before insert or update on public.trilhas
  for each row execute function app.fase3_carimbar('cadastro');
create trigger quizzes_carimbo before insert or update on public.quizzes
  for each row execute function app.fase3_carimbar('cadastro');
create trigger documento_versoes_carimbo before insert on public.documento_versoes
  for each row execute function app.fase3_carimbar('criado_em');
create trigger avisos_carimbo before insert on public.avisos
  for each row execute function app.fase3_carimbar('criado_em');
create trigger manuais_trilha_carimbo before insert or update on public.manuais_trilha
  for each row execute function app.fase3_carimbar('atualizado_em');
create trigger leituras_carimbo before insert on public.leituras
  for each row execute function app.fase3_carimbar('lido_em');
create trigger aceites_carimbo before insert on public.aceites
  for each row execute function app.fase3_carimbar('aceito_em');
create trigger certificados_carimbo before insert on public.certificados
  for each row execute function app.fase3_carimbar('emitido_em');
create trigger avisos_leituras_carimbo before insert on public.avisos_leituras
  for each row execute function app.fase3_carimbar('lida_em');
create trigger quiz_gabaritos_carimbo before update on public.quiz_gabaritos
  for each row execute function app.fase3_carimbar('quiz_id');
create trigger gabaritos_carimbo before update on public.gabaritos
  for each row execute function app.fase3_carimbar('id');
-- A validação do início explícito roda antes do carimbo do cronômetro.
create trigger progresso_manuais_antes_cronometro before update of iniciado_em on public.progresso_manuais
  for each row execute function app.fase3_carimbar('inicio_explicito');
create trigger reestudos_antes_cronometro before update of iniciado_em on public.reestudos
  for each row execute function app.fase3_carimbar('inicio_explicito');
create trigger progresso_manuais_cronometro before insert or update on public.progresso_manuais
  for each row execute function app.fase3_cronometro();
create trigger reestudos_cronometro before insert or update on public.reestudos
  for each row execute function app.fase3_cronometro();

-- Políticas por coleção. NULL nos marcadores legados representa campo ausente.
create policy categorias_ler on public.categorias for select to authenticated
  using ((select app.eh_admin()) or (
    (select app.fase3_ativo()) and (select app.tem_modulo(app.perfil(), 'manuais'))
    and (coalesce(publico, true) or uids @> array[(select auth.uid())])
  ));
create policy categorias_criar on public.categorias for insert to authenticated
  with check ((select app.eh_admin()) and publico is not null);
create policy categorias_editar on public.categorias for update to authenticated
  using ((select app.eh_admin()))
  with check ((select app.eh_admin()) and publico is not null);
create policy categorias_apagar on public.categorias for delete to authenticated
  using ((select app.eh_admin()));

create policy documentos_ler on public.documentos for select to authenticated
  using ((select app.eh_admin()) or (
    (select app.fase3_ativo()) and (select app.tem_modulo(app.perfil(), 'manuais'))
    and status = 'publicado' and (publico or uids @> array[(select auth.uid())])
  ));
create policy documentos_criar on public.documentos for insert to authenticated
  with check ((select app.eh_admin()) and atualizado_por = (select auth.uid()));
create policy documentos_editar on public.documentos for update to authenticated
  using ((select app.eh_admin()))
  with check ((select app.eh_admin()) and atualizado_por = (select auth.uid()));
create policy documentos_apagar on public.documentos for delete to authenticated
  using ((select app.eh_admin()));

create policy trilhas_ler on public.trilhas for select to authenticated
  using ((select app.eh_admin()) or (
    (select app.fase3_ativo()) and (select app.tem_modulo(app.perfil(), 'universidade'))
    and coalesce(publicado, true) and (coalesce(publico, true) or uids @> array[(select auth.uid())])
  ));
create policy trilhas_criar on public.trilhas for insert to authenticated
  with check ((select app.eh_admin()) and publicado is not null and publico is not null);
create policy trilhas_editar on public.trilhas for update to authenticated
  using ((select app.eh_admin()))
  with check ((select app.eh_admin()) and publicado is not null and publico is not null);
create policy trilhas_apagar on public.trilhas for delete to authenticated
  using ((select app.eh_admin()));

create policy quizzes_ler on public.quizzes for select to authenticated
  using ((select app.eh_admin()));
create policy quizzes_criar on public.quizzes for insert to authenticated
  with check ((select app.eh_admin()));
create policy quizzes_editar on public.quizzes for update to authenticated
  using ((select app.eh_admin()))
  with check ((select app.eh_admin()));
create policy quizzes_apagar on public.quizzes for delete to authenticated
  using ((select app.eh_admin()));

create policy avisos_ler on public.avisos for select to authenticated
  using ((select app.eh_admin()) or (
    (select app.fase3_ativo()) and (select app.tem_modulo(app.perfil(), 'manuais'))
    and (publico or uids @> array[(select auth.uid())])
  ));
create policy avisos_criar on public.avisos for insert to authenticated
  with check ((select app.eh_admin()));
create policy avisos_apagar on public.avisos for delete to authenticated
  using ((select app.eh_admin()));

create policy quiz_gabaritos_admin on public.quiz_gabaritos for all to authenticated
  using ((select app.eh_admin()))
  with check ((select app.eh_admin()));
create policy gabaritos_admin on public.gabaritos for all to authenticated
  using ((select app.eh_admin()))
  with check ((select app.eh_admin()));

create policy documento_versoes_ler on public.documento_versoes for select to authenticated
  using ((select app.eh_admin()));
create policy documento_versoes_criar on public.documento_versoes for insert to authenticated
  with check ((select app.eh_admin()) and autor_id = (select auth.uid()));

create policy leituras_ler on public.leituras for select to authenticated
  using ((select app.eh_admin()) or ((select app.fase3_ativo()) and uid = (select auth.uid())));
create policy leituras_criar on public.leituras for insert to authenticated
  with check ((select app.fase3_ativo()) and uid = (select auth.uid())
    and id = (select auth.uid())::text || '_' || documento_id || '_v' || versao::text
    and app.fase3_documento_atual(documento_id, versao, false));

create policy aceites_ler on public.aceites for select to authenticated
  using ((select app.eh_admin()) or ((select app.fase3_ativo()) and uid = (select auth.uid())));
create policy aceites_criar on public.aceites for insert to authenticated
  with check ((select app.fase3_ativo()) and uid = (select auth.uid())
    and id = (select auth.uid())::text || '_' || documento_id || '_v' || versao::text
    and app.fase3_documento_atual(documento_id, versao, true)
    and nome = (select (app.perfil()).nome) and email = (select auth.jwt() ->> 'email'));

create policy tentativas_ler on public.tentativas for select to authenticated
  using ((select app.eh_admin()) or ((select app.tem_modulo(app.perfil(), 'universidade')) and (select app.fase3_ativo()) and uid = (select auth.uid())));

create policy certificados_ler on public.certificados for select to authenticated
  using ((select app.eh_admin()) or ((select app.tem_modulo(app.perfil(), 'universidade')) and (select app.fase3_ativo()) and uid = (select auth.uid())));
create policy certificados_criar on public.certificados for insert to authenticated
  with check ((select app.tem_modulo(app.perfil(), 'universidade')) and (select app.fase3_ativo()) and uid = (select auth.uid())
    and id = (select auth.uid())::text || '_' || trilha_id
    and nome = (select (app.perfil()).nome)
    and app.fase3_certificado_liberado(trilha_id, tentativa_id));

create policy avisos_leituras_ler on public.avisos_leituras for select to authenticated
  using ((select app.eh_admin()) or ((select app.fase3_ativo()) and uid = (select auth.uid())));
create policy avisos_leituras_criar on public.avisos_leituras for insert to authenticated
  with check ((select app.fase3_ativo()) and uid = (select auth.uid()) and id = (select auth.uid())::text || '_' || aviso_id);

create policy manuais_trilha_ler on public.manuais_trilha for select to authenticated
  using ((select app.gere_acompanhamento()) or ((select app.fase3_ativo()) and ((select app.eh_admin()) or (select app.tem_modulo(app.perfil(), 'manuais')))));
create policy manuais_trilha_criar on public.manuais_trilha for insert to authenticated
  with check ((select app.fase3_gere('manuais')) and atualizado_por = (select auth.uid())
    and atualizado_por_nome = (select (app.perfil()).nome)
    and documento_id = id and anterior_id <> id and tempo_minimo_seg between 30 and 14400
    and app.fase3_item_valido(id));
create policy manuais_trilha_editar on public.manuais_trilha for update to authenticated
  using ((select app.fase3_gere('manuais')))
  with check ((select app.fase3_gere('manuais')) and atualizado_por = (select auth.uid())
    and atualizado_por_nome = (select (app.perfil()).nome)
    and documento_id = id and anterior_id <> id and tempo_minimo_seg between 30 and 14400
    and app.fase3_item_valido(id));

create policy progresso_manuais_ler on public.progresso_manuais for select to authenticated
  using (uid = (select auth.uid()) or (select app.fase3_gere('manuais')) or (select app.gere_acompanhamento())
    or ((select app.fase3_aluno('manuais')) and (select (app.perfil()).papel) = 'franqueado' and unidade_id = (select app.minha_unidade_id())));
create policy progresso_manuais_criar on public.progresso_manuais for insert to authenticated
  with check (uid = (select auth.uid()) and (select app.fase3_aluno('manuais'))
    and id = (select auth.uid())::text || '_' || documento_id and unidade_id = (select app.minha_unidade_id())
    and nome = (select (app.perfil()).nome) and unidade_nome = (select (app.perfil()).unidade)
    and status = 'em_andamento' and reinicios = 0 and concluido_em is null
    and app.fase3_manual_liberado(documento_id, tempo_minimo_seg));
create policy progresso_manuais_editar on public.progresso_manuais for update to authenticated
  using (uid = (select auth.uid()) and (select app.fase3_aluno('manuais')))
  with check (uid = (select auth.uid()) and (select app.fase3_aluno('manuais'))
    and id = (select auth.uid())::text || '_' || documento_id and unidade_id = (select app.minha_unidade_id())
    and nome = (select (app.perfil()).nome) and unidade_nome = (select (app.perfil()).unidade));

create policy reestudos_ler on public.reestudos for select to authenticated
  using (uid = (select auth.uid()) or (select app.fase3_gere('universidade')));
create policy reestudos_criar on public.reestudos for insert to authenticated
  with check (uid = (select auth.uid()) and (select app.fase3_aluno('universidade'))
    and id = (select auth.uid())::text || '_' || curso_id || '_' || ciclo::text
    and status = 'em_andamento' and reinicios = 0 and concluido_em is null
    and app.fase3_reestudo_liberado(curso_id, ciclo, documento_id));
create policy reestudos_editar on public.reestudos for update to authenticated
  using (uid = (select auth.uid()))
  with check (uid = (select auth.uid()));
