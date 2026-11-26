create table public.checklist_rascunhos (
  id text primary key default gen_random_uuid()::text,
  uid uuid not null references public.usuarios(id) on delete cascade,
  unidade_id text not null,
  modelo_id text not null references public.checklist_modelos(id) on delete cascade,
  modelo_versao integer not null check (modelo_versao >= 1),
  periodo text not null check (periodo = 'avulsa' or periodo ~ '^\d{4}-\d{2}-\d{2}$'),
  respostas jsonb not null check (case when jsonb_typeof(respostas) = 'array'
    then jsonb_array_length(respostas) <= 60 and octet_length(respostas::text) <= 450000 else false end),
  obs_geral text not null default '' check (char_length(obs_geral) <= 2000),
  atualizado_em timestamptz not null,
  unique (uid, unidade_id, modelo_id, modelo_versao, periodo)
);

create index checklist_rascunhos_modelo_idx on public.checklist_rascunhos (modelo_id);

create function app.checklist_rascunho_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
declare
  eu public.usuarios := app.perfil();
begin
  if not coalesce(app.unidade_checklist(eu), false) then
    raise exception 'Rascunho disponível apenas para a unidade.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if row(new.uid, new.unidade_id, new.modelo_id, new.modelo_versao, new.periodo)
      is distinct from row(old.uid, old.unidade_id, old.modelo_id, old.modelo_versao, old.periodo) then
      raise exception 'A chave do rascunho não pode mudar.' using errcode = '42501';
    end if;
  end if;

  new.uid := auth.uid();
  new.unidade_id := eu.unidade_id;
  if not exists (
    select 1 from public.checklist_modelos m where m.id = new.modelo_id
      and m.ativo and (m.publico or new.unidade_id = any(m.unidades))
      and m.versao = new.modelo_versao
  ) then
    raise exception 'Rascunho incompatível com o modelo.' using errcode = '42501';
  end if;
  new.atualizado_em := statement_timestamp();
  return new;
end $$;

create function app.checklist_execucao_remover_rascunhos() returns trigger
language plpgsql set search_path = '' as $$
begin
  delete from public.checklist_rascunhos
    where uid = new.uid and unidade_id = new.unidade_id and modelo_id = new.modelo_id;
  return new;
end $$;

revoke execute on function app.checklist_rascunho_antes_gravar(), app.checklist_execucao_remover_rascunhos()
  from public, anon, authenticated;

create trigger checklist_rascunho_antes_gravar before insert or update on public.checklist_rascunhos
  for each row when (app.da_api()) execute function app.checklist_rascunho_antes_gravar();
create trigger checklist_execucao_remover_rascunhos after insert on public.checklist_execucoes
  for each row when (app.da_api()) execute function app.checklist_execucao_remover_rascunhos();

alter table public.checklist_rascunhos enable row level security;
revoke all on public.checklist_rascunhos from public, anon, authenticated;
grant select, insert, update, delete on public.checklist_rascunhos to authenticated;

-- USING protege leitura, atualização e remoção. WITH CHECK protege inserção e atualização.
create policy checklist_rascunhos_titular on public.checklist_rascunhos for all to authenticated
  using (uid = (select auth.uid()) and (select app.unidade_checklist(app.perfil()))
    and unidade_id = (select app.minha_unidade_id()))
  with check (uid = (select auth.uid()) and (select app.unidade_checklist(app.perfil()))
    and unidade_id = (select app.minha_unidade_id()));
