create table public.pacote_chaves (
  chave_id text primary key check (chave_id ~ '^[A-Za-z0-9_-]{1,150}$'),
  tipo text not null check (tipo in ('categoria', 'documento', 'trilha', 'curso', 'prova', 'checklist')),
  chave text not null check (char_length(chave) between 1 and 120),
  alvo_id text not null check (char_length(alvo_id) between 1 and 128),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid not null
);

alter table public.pacote_chaves enable row level security;
revoke all on public.pacote_chaves from public, anon, authenticated;
grant select, insert, update on public.pacote_chaves to authenticated;

create policy pacote_chaves_leitura on public.pacote_chaves
  for select to authenticated using ((select app.eh_admin()));
create policy pacote_chaves_criacao on public.pacote_chaves
  for insert to authenticated with check ((select app.eh_admin()) and atualizado_por = (select auth.uid()));
create policy pacote_chaves_atualizacao on public.pacote_chaves
  for update to authenticated using ((select app.eh_admin()))
  with check ((select app.eh_admin()) and atualizado_por = (select auth.uid()));
