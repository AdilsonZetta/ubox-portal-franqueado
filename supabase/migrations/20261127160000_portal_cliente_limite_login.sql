-- Limite de tentativas do login do cliente (CPF + senha), usado só pela Edge Function entrar-cliente.
create table if not exists public.cliente_login_tentativas (
  id bigserial primary key,
  chave text not null,
  em timestamptz not null default now()
);
create index if not exists cliente_login_tentativas_chave_idx on public.cliente_login_tentativas (chave, em);
alter table public.cliente_login_tentativas enable row level security;
revoke all on table public.cliente_login_tentativas from public, anon, authenticated;
revoke all on sequence public.cliente_login_tentativas_id_seq from public, anon, authenticated;

-- true quando ainda pode tentar: até 5 falhas por CPF e 30 por origem em 15 minutos.
create or replace function public.login_cliente_permitido(p_cpf text, p_ip text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.cliente_login_tentativas
           where chave = 'cpf:' || coalesce(p_cpf,'') and em > now() - interval '15 minutes') < 5
     and (select count(*) from public.cliente_login_tentativas
           where chave = 'ip:' || coalesce(p_ip,'') and em > now() - interval '15 minutes') < 30
$$;

create or replace function public.login_cliente_falha(p_cpf text, p_ip text)
returns void language sql security definer set search_path = '' as $$
  delete from public.cliente_login_tentativas where em < now() - interval '1 day';
  insert into public.cliente_login_tentativas (chave)
  values ('cpf:' || coalesce(p_cpf,'')), ('ip:' || coalesce(p_ip,''));
$$;

revoke all on function public.login_cliente_permitido(text, text), public.login_cliente_falha(text, text)
  from public, anon, authenticated;
grant execute on function public.login_cliente_permitido(text, text), public.login_cliente_falha(text, text)
  to service_role;
