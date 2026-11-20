-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
-- Fase 14: metadados de links do Drive e Docs. Cada ação grava uma linha;
-- as regras de nuvemLinks não usam getAfter() nem existsAfter().

create function app.gere_nuvem() returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and (u.papel = 'admin'
    or (u.papel = 'equipe_franqueadora' and app.tem_modulo(u, 'nuvem-rede')))
  from app.perfil() u
$$;

create function app.unidade_nuvem() returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and u.papel in ('franqueado', 'equipe_franqueado')
    and app.tem_modulo(u, 'nuvem') and app.unidade_ativa(u)
  from app.perfil() u
$$;

revoke all on function app.gere_nuvem(), app.unidade_nuvem() from public, anon, authenticated;
grant execute on function app.gere_nuvem(), app.unidade_nuvem() to authenticated;

create table public.nuvem_links (
  id text primary key default gen_random_uuid()::text,
  titulo text not null check (char_length(titulo) between 2 and 120),
  descricao text not null default '' check (char_length(descricao) <= 1000),
  url text not null check (char_length(url) <= 600 and url ~ '^https://(drive|docs)[.]google[.]com/[^ ]*$'),
  pasta text not null check (pasta ~ '^[^/]{1,60}$'),
  tags text not null default '' check (tags ~ '^([^,]{1,30}(,[^,]{1,30}){0,9})?$'),
  visibilidade text not null,
  unidades text[] not null default '{}',
  -- O valor vazio identifica a franqueadora. IDs de unidade são preservados no histórico.
  dono text not null,
  gerado_por_ia boolean not null default false,
  ia_modelo text not null default '' check (char_length(ia_modelo) <= 80 and
    (not gerado_por_ia or (char_length(ia_modelo) >= 2 and
      strpos(ia_modelo, E'\n') = 0 and ia_modelo ~ E'[^ \t\r\f]'))),
  criado_por uuid not null references public.usuarios(id),
  criado_por_nome text not null,
  criado_em timestamptz not null,
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null,
  check (coalesce(array_ndims(unidades), 1) = 1),
  check (case
    when dono <> '' then visibilidade = 'privada' and cardinality(unidades) = 0
    when visibilidade = 'unidades' then cardinality(unidades) between 1 and 50
    else visibilidade in ('rede', 'franqueadora') and cardinality(unidades) = 0
  end)
);

create index nuvem_links_dono_id_idx on public.nuvem_links (dono, id);
create index nuvem_links_unidades_idx on public.nuvem_links using gin (unidades);
create index nuvem_links_criado_por_idx on public.nuvem_links (criado_por);
create index nuvem_links_atualizado_por_idx on public.nuvem_links (atualizado_por);

create function app.nuvem_link_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
declare
  u public.usuarios;
begin
  if not app.da_api() then
    return new;
  end if;

  u := app.perfil();
  if tg_op = 'INSERT' then
    if (new.criado_por is not null and new.criado_por is distinct from auth.uid())
      or (new.criado_por_nome is not null and new.criado_por_nome is distinct from u.nome)
      or (new.criado_em is not null and new.criado_em is distinct from now())
      or (new.atualizado_por is not null and new.atualizado_por is distinct from auth.uid())
      or (new.atualizado_por_nome is not null and new.atualizado_por_nome is distinct from u.nome)
      or (new.atualizado_em is not null and new.atualizado_em is distinct from now()) then
      raise exception 'Autoria ou data de criação do link inválida.' using errcode = '42501';
    end if;
    new.criado_por := auth.uid();
    new.criado_por_nome := u.nome;
    new.criado_em := now();
  elsif row(new.id, new.dono, new.criado_por, new.criado_por_nome, new.criado_em)
    is distinct from row(old.id, old.dono, old.criado_por, old.criado_por_nome, old.criado_em) then
    raise exception 'Identificador, dono e dados de criação do link são imutáveis.' using errcode = '42501';
  end if;

  new.atualizado_por := auth.uid();
  new.atualizado_por_nome := u.nome;
  new.atualizado_em := now();
  return new;
end $$;

revoke all on function app.nuvem_link_antes_gravar() from public, anon, authenticated;
create trigger nuvem_link_antes_gravar
before insert or update on public.nuvem_links
for each row execute function app.nuvem_link_antes_gravar();

alter table public.nuvem_links enable row level security;
revoke all on public.nuvem_links from public, anon, authenticated;
grant select, insert, delete on public.nuvem_links to authenticated;
-- Na edição os três campos de atualização ficam sob controle exclusivo do gatilho.
grant update (id, titulo, descricao, url, pasta, tags, visibilidade, unidades, dono,
  gerado_por_ia, ia_modelo, criado_por, criado_por_nome, criado_em)
  on public.nuvem_links to authenticated;

-- O ramo privado exige o perfil da própria unidade, inclusive para excluir.
create policy nuvem_links_le on public.nuvem_links for select to authenticated
using (case when dono = '' then
  (select app.gere_nuvem()) or (
    (select app.unidade_nuvem()) and (
      visibilidade = 'rede' or (select app.minha_unidade_id()) = any (unidades)
    )
  )
  else (select app.unidade_nuvem()) and dono = (select app.minha_unidade_id())
end);

create policy nuvem_links_insere on public.nuvem_links for insert to authenticated
with check (case when dono = '' then (select app.gere_nuvem())
  else (select app.unidade_nuvem()) and dono = (select app.minha_unidade_id())
end);

create policy nuvem_links_atualiza on public.nuvem_links for update to authenticated
using (case when dono = '' then (select app.gere_nuvem())
  else (select app.unidade_nuvem()) and dono = (select app.minha_unidade_id())
end);
-- Sem WITH CHECK separado, o PostgreSQL reaplica o USING ao novo registro.

create policy nuvem_links_exclui on public.nuvem_links for delete to authenticated
using (case when dono = '' then (select app.gere_nuvem())
  else (select app.unidade_nuvem()) and dono = (select app.minha_unidade_id())
end);
