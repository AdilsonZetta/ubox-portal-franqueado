create table public.checklist_vigencias (
  id text primary key default gen_random_uuid()::text,
  modelo_id text not null references public.checklist_modelos(id) on delete cascade,
  unidade_id text not null references public.unidades(id) on delete cascade,
  inicio date not null,
  primeiro_vencimento date not null check (primeiro_vencimento >= inicio),
  registrado_por uuid not null references public.usuarios(id),
  registrado_por_nome text not null,
  registrado_em timestamptz not null,
  unique (modelo_id, unidade_id)
);

create index checklist_vigencias_unidade_idx on public.checklist_vigencias (unidade_id);

create function app.checklist_vigencia_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
declare
  eu public.usuarios := app.perfil();
begin
  if app.gere_checklist(eu) is not true then
    raise exception 'Sem permissão para gerenciar vigências do checklist.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if row(new.modelo_id, new.unidade_id) is distinct from row(old.modelo_id, old.unidade_id) then
      raise exception 'A rotina e a unidade da vigência são imutáveis.' using errcode = '42501';
    end if;
  end if;

  if not exists (
    select 1 from public.checklist_modelos
    where id = new.modelo_id and ativo and frequencia <> 'avulsa'
  ) then
    raise exception 'Escolha uma rotina recorrente ativa.' using errcode = '23514';
  end if;

  new.registrado_por := auth.uid();
  new.registrado_por_nome := eu.nome;
  new.registrado_em := statement_timestamp();
  return new;
end
$$;

create trigger checklist_vigencia_antes_gravar
  before insert or update on public.checklist_vigencias
  for each row when (app.da_api()) execute function app.checklist_vigencia_antes_gravar();

revoke execute on function app.checklist_vigencia_antes_gravar() from public, anon, authenticated;

alter table public.checklist_vigencias enable row level security;
revoke all on public.checklist_vigencias from public, anon, authenticated;
grant select, insert, update, delete on public.checklist_vigencias to authenticated;

create policy checklist_vigencias_ler on public.checklist_vigencias for select to authenticated
  using ((select app.gere_checklist(app.perfil())) or (select app.gere_acompanhamento())
    or ((select app.unidade_checklist(app.perfil())) and unidade_id = (select app.minha_unidade_id())));

create policy checklist_vigencias_criar on public.checklist_vigencias for insert to authenticated
  with check ((select app.gere_checklist(app.perfil())));

create policy checklist_vigencias_atualizar on public.checklist_vigencias for update to authenticated
  using ((select app.gere_checklist(app.perfil())))
  with check ((select app.gere_checklist(app.perfil())));

create policy checklist_vigencias_remover on public.checklist_vigencias for delete to authenticated
  using ((select app.gere_checklist(app.perfil())));

-- A equipe de checklist precisa localizar unidades antes da primeira execução.
-- A listagem expõe apenas identificador e nome das unidades habilitadas.
create function public.unidades_do_checklist() returns table (id text, nome text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.nome from public.unidades u
  where (select app.gere_checklist(app.perfil()))
    and u.ativo and 'checklist' = any(u.modulos_liberados)
  order by u.nome, u.id
$$;

revoke execute on function public.unidades_do_checklist() from public, anon, authenticated;
grant execute on function public.unidades_do_checklist() to authenticated;
