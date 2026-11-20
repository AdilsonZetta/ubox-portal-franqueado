-- Limita tentativas de criação de conta por usuário e protege o registro contra acesso direto pelo app.
-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

create table public.criar_conta_tentativas (
  id bigint generated always as identity primary key,
  uid uuid not null,
  criado_em timestamptz not null default now()
);

create index criar_conta_tentativas_uid_criado_em_idx
  on public.criar_conta_tentativas (uid, criado_em);

alter table public.criar_conta_tentativas enable row level security;
revoke all on table public.criar_conta_tentativas from anon, authenticated;
grant select, insert, delete on table public.criar_conta_tentativas to service_role;

create function public.registrar_criacao_conta(
  p_uid uuid,
  p_limite int default 10,
  p_janela interval default interval '10 minutes'
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_uid::text, 0));

  delete from public.criar_conta_tentativas
    where uid = p_uid and criado_em < now() - interval '1 day';

  if (select count(*) from public.criar_conta_tentativas
      where uid = p_uid and criado_em > now() - p_janela) >= p_limite then
    return false;
  end if;

  insert into public.criar_conta_tentativas (uid) values (p_uid);
  return true;
end;
$$;

revoke all on function public.registrar_criacao_conta(uuid, int, interval) from public, anon, authenticated;
grant execute on function public.registrar_criacao_conta(uuid, int, interval) to service_role;
