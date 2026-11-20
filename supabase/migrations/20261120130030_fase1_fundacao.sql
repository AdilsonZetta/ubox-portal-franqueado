-- =====================================================================
-- Migração para Supabase · Fase 1: fundação (usuarios, unidades, trava do 1º admin)
-- Espelha as regras do Firestore de /usuarios, /unidades e /config/adminCriado.
-- Feito por Grok Bot no Cursor (Antigravity sem cota).
-- =====================================================================

-- Funções auxiliares ficam no schema "app", que não é exposto pela Data API.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

create type public.papel as enum ('admin', 'franqueado', 'equipe_franqueadora', 'equipe_franqueado');

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table public.unidades (
  id text primary key default gen_random_uuid()::text check (char_length(id) between 1 and 80),
  nome text not null check (char_length(nome) between 2 and 120),
  cidade text not null default '' check (char_length(cidade) <= 120),
  responsavel text not null check (char_length(responsavel) between 2 and 120),
  email text not null check (char_length(email) between 4 and 199),
  uid uuid,
  modulos_liberados text[] not null default '{}' check (cardinality(modulos_liberados) <= 40),
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.unidades is 'Firestore /unidades (id do documento mantido em id).';

create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  firebase_uid text unique check (char_length(firebase_uid) <= 128),
  email text not null check (char_length(email) between 4 and 199),
  nome text not null check (char_length(nome) between 2 and 120),
  papel public.papel not null,
  ativo boolean not null default false,
  recusado boolean not null default false,
  unidade text not null default '' check (char_length(unidade) <= 120),
  cidade text not null default '' check (char_length(cidade) <= 120),
  unidade_id text references public.unidades (id) on delete set null,
  modulos_liberados text[] not null default '{}' check (cardinality(modulos_liberados) <= 40),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.usuarios is 'Firestore /usuarios. id = auth.users.id; firebase_uid guarda o uid antigo para a migração.';
create index usuarios_unidade_id_idx on public.usuarios (unidade_id);

alter table public.unidades
  add constraint unidades_uid_fkey foreign key (uid) references public.usuarios (id) on delete set null;
create index unidades_uid_idx on public.unidades (uid);

-- Firestore /config/adminCriado: existe uma única linha depois que o primeiro admin foi criado.
create table public.admin_lock (
  id text primary key default 'adminCriado' check (id = 'adminCriado'),
  uid uuid not null references public.usuarios (id) on delete restrict,
  email text not null,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Funções auxiliares (SECURITY DEFINER: leem o perfil sem passar pelo RLS)
-- ---------------------------------------------------------------------
create function app.perfil() returns public.usuarios
language sql stable security definer set search_path = '' as $$
  select u from public.usuarios u where u.id = (select auth.uid())
$$;

-- contaAtiva(): ativo, não recusado (o enum já limita o papel)
create function app.conta_ativa(u public.usuarios) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(u.ativo and not u.recusado, false)
$$;

-- unidadeAtiva(): admin/equipe da franqueadora sempre; unidade precisa existir e estar ativa
create function app.unidade_ativa(u public.usuarios) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when u.papel in ('admin', 'equipe_franqueadora') then true
    when u.papel in ('franqueado', 'equipe_franqueado') then
      coalesce(u.unidade_id, '') <> ''
      and exists (select 1 from public.unidades x where x.id = u.unidade_id and x.ativo)
    else false
  end
$$;

create function app.tem_modulo(u public.usuarios, slug text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(slug = any (u.modulos_liberados), false)
$$;

-- isAdmin()
create function app.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = (select auth.uid()) and u.papel = 'admin' and u.ativo and not u.recusado
  )
$$;

-- userData().unidadeId (sem exigir conta ativa, como userExists() && userData().unidadeId == id)
create function app.minha_unidade_id() returns text
language sql stable security definer set search_path = '' as $$
  select u.unidade_id from public.usuarios u where u.id = (select auth.uid())
$$;

-- gereAcompanhamento(): admin ou equipe da franqueadora com o módulo 'acompanhamento'
create function app.gere_acompanhamento() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select app.conta_ativa(u) and (u.papel = 'admin' or (u.papel = 'equipe_franqueadora' and app.tem_modulo(u, 'acompanhamento')))
    from public.usuarios u where u.id = (select auth.uid())
  ), false)
$$;

-- equipeDaMinhaUnidade(): franqueado ativo, unidade ativa, alvo é equipe_franqueado da mesma unidade
create function app.franqueado_da_equipe(alvo_unidade_id text, alvo_papel public.papel) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select app.conta_ativa(u) and app.unidade_ativa(u) and u.papel = 'franqueado'
      and coalesce(u.unidade_id, '') <> ''
      and alvo_papel = 'equipe_franqueado'
      and coalesce(alvo_unidade_id, '') <> ''
      and alvo_unidade_id = u.unidade_id
    from public.usuarios u where u.id = (select auth.uid())
  ), false)
$$;

-- franqueadoCriaEquipe(): mesma unidade e módulos dentro dos do franqueado
create function app.franqueado_cria_equipe(alvo_unidade_id text, alvo_modulos text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select app.conta_ativa(u) and app.unidade_ativa(u) and u.papel = 'franqueado'
      and coalesce(u.unidade_id, '') <> ''
      and coalesce(alvo_unidade_id, '') <> ''
      and alvo_unidade_id = u.unidade_id
      and alvo_modulos <@ u.modulos_liberados
    from public.usuarios u where u.id = (select auth.uid())
  ), false)
$$;

-- modulosCabemNaUnidade(): sem unidade, ou módulos contidos nos da unidade
create function app.modulos_cabem(alvo_unidade_id text, alvo_modulos text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(alvo_unidade_id, '') = ''
    or coalesce((select alvo_modulos <@ x.modulos_liberados from public.unidades x where x.id = alvo_unidade_id), false)
$$;

create function app.admin_travado() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_lock)
$$;

-- Grava a trava do 1º admin no mesmo comando da promoção (no Firestore eram duas gravações).
create function app.travar_primeiro_admin(p_uid uuid, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Só a própria pessoa, ainda franqueado inativo, e só enquanto não há trava.
  if p_uid is distinct from (select auth.uid()) or not exists (
    select 1 from public.usuarios u where u.id = p_uid and u.papel = 'franqueado' and not u.ativo and not u.recusado
  ) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  insert into public.admin_lock (id, uid, email) values ('adminCriado', p_uid, p_email);
exception when unique_violation then
  raise exception 'O primeiro admin já foi criado.' using errcode = '42501';
end
$$;

revoke all on all functions in schema app from public;
grant execute on function
  app.perfil(), app.conta_ativa(public.usuarios), app.unidade_ativa(public.usuarios),
  app.tem_modulo(public.usuarios, text), app.eh_admin(), app.minha_unidade_id(), app.gere_acompanhamento(),
  app.franqueado_da_equipe(text, public.papel), app.franqueado_cria_equipe(text, text[]),
  app.modulos_cabem(text, text[]), app.admin_travado(), app.travar_primeiro_admin(uuid, text)
  to authenticated;
-- O schema app não é exposto pela Data API: estas funções só rodam dentro de políticas e gatilhos.

-- ---------------------------------------------------------------------
-- Gatilhos: carimbo do servidor e campos que não podem mudar
-- (o Firestore comparava request.resource com resource; aqui o BEFORE UPDATE faz isso)
-- Só valem para chamadas da API (papéis anon/authenticated); postgres/service_role (migração) passam.
-- ---------------------------------------------------------------------
create function app.da_api() returns boolean
language sql stable set search_path = '' as $$
  select current_user in ('anon', 'authenticated')
$$;
grant execute on function app.da_api() to authenticated;

create function app.usuarios_antes_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.da_api() then return new; end if;
  new.criado_em := now();
  new.atualizado_em := now();
  return new;
end
$$;

create function app.usuarios_antes_update() returns trigger
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
    perform app.travar_primeiro_admin(old.id, old.email);
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

create function app.unidades_carimbo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.da_api() then return new; end if;
  if tg_op = 'INSERT' then
    new.criado_em := now();
  else
    if new.id <> old.id or new.criado_em <> old.criado_em or new.criado_por is distinct from old.criado_por then
      raise exception 'Campo imutável.' using errcode = '42501';
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end
$$;

create function app.admin_lock_carimbo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if app.da_api() then new.criado_em := now(); end if;
  return new;
end
$$;

create trigger usuarios_antes_insert before insert on public.usuarios for each row execute function app.usuarios_antes_insert();
create trigger usuarios_antes_update before update on public.usuarios for each row execute function app.usuarios_antes_update();
create trigger unidades_carimbo before insert or update on public.unidades for each row execute function app.unidades_carimbo();
create trigger admin_lock_carimbo before insert on public.admin_lock for each row execute function app.admin_lock_carimbo();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.usuarios enable row level security;
alter table public.unidades enable row level security;
alter table public.admin_lock enable row level security;

revoke all on public.usuarios, public.unidades, public.admin_lock from anon, authenticated;
grant select, insert, update, delete on public.usuarios, public.unidades to authenticated;
grant select, insert on public.admin_lock to authenticated;

-- usuarios: get/list = a própria pessoa, admin, ou franqueado vendo a equipe da unidade
create policy usuarios_ler on public.usuarios for select to authenticated
  using (id = (select auth.uid()) or app.eh_admin() or app.franqueado_da_equipe(unidade_id, papel));

-- Cadastro próprio: franqueado inativo, sem módulos, sem unidade, e-mail do login
create policy usuarios_cadastro_proprio on public.usuarios for insert to authenticated
  with check (
    id = (select auth.uid())
    and papel = 'franqueado' and ativo = false and recusado = false
    and modulos_liberados = '{}' and coalesce(unidade_id, '') = ''
    and email = (select auth.jwt()) ->> 'email'
    and firebase_uid is null
    and (criado_por is null or criado_por = (select auth.uid()))
  );

-- Admin cria franqueado, equipe da franqueadora ou equipe de unidade
create policy usuarios_admin_cria on public.usuarios for insert to authenticated
  with check (
    app.eh_admin()
    and papel in ('franqueado', 'equipe_franqueadora', 'equipe_franqueado')
    and recusado = false and firebase_uid is null
    and criado_por = (select auth.uid())
    and app.modulos_cabem(unidade_id, modulos_liberados)
  );

-- Franqueado cria equipe da própria unidade
create policy usuarios_franqueado_cria_equipe on public.usuarios for insert to authenticated
  with check (
    papel = 'equipe_franqueado'
    and app.franqueado_cria_equipe(unidade_id, modulos_liberados)
    and ativo = true and recusado = false and firebase_uid is null
    and criado_por = (select auth.uid())
    and app.modulos_cabem(unidade_id, modulos_liberados)
  );

-- Atualização: quem pode tocar na linha; o gatilho decide quais campos
create policy usuarios_atualizar on public.usuarios for update to authenticated
  using (id = (select auth.uid()) or app.eh_admin() or app.franqueado_da_equipe(unidade_id, papel))
  with check (id = (select auth.uid()) or app.eh_admin() or app.franqueado_da_equipe(unidade_id, papel));

create policy usuarios_admin_apaga on public.usuarios for delete to authenticated
  using (app.eh_admin());

-- unidades: admin, o dono (uid), quem é da unidade, e o consultor do acompanhamento
create policy unidades_ler on public.unidades for select to authenticated
  using (
    app.eh_admin()
    or uid = (select auth.uid())
    or id = app.minha_unidade_id()
    or app.gere_acompanhamento()
  );
create policy unidades_admin_cria on public.unidades for insert to authenticated
  with check (app.eh_admin() and criado_por = (select auth.uid()));
create policy unidades_admin_atualiza on public.unidades for update to authenticated
  using (app.eh_admin()) with check (app.eh_admin());
create policy unidades_admin_apaga on public.unidades for delete to authenticated
  using (app.eh_admin());

-- admin_lock (config/adminCriado): só o admin lê; criação só pelo próprio admin
create policy admin_lock_ler on public.admin_lock for select to authenticated
  using (app.eh_admin());
create policy admin_lock_cria on public.admin_lock for insert to authenticated
  with check (app.eh_admin() and uid = (select auth.uid()) and email = (select auth.jwt()) ->> 'email');
