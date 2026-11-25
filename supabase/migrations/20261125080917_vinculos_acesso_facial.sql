create table public.acesso_facial_vinculos (
  cliente_id text primary key references public.clientes(id),
  pessoa_terminal text not null default ('U' || left(replace(gen_random_uuid()::text, '-', ''), 28)) unique,
  asaas_ambiente text not null check (asaas_ambiente in ('sandbox', 'producao')),
  asaas_boleto_id text not null check (asaas_boleto_id ~ '^pay_[A-Za-z0-9]{1,75}$'),
  vencimento date not null,
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_em timestamptz not null default now(),
  unique (asaas_ambiente, asaas_boleto_id)
);

alter table public.acesso_facial_vinculos enable row level security;
revoke all on public.acesso_facial_vinculos from public, anon, authenticated;
grant select, insert, update on public.acesso_facial_vinculos to service_role;

create function public.ubox_vincular_boleto_facial(
  p_cliente text, p_ambiente text, p_boleto text, p_vencimento date, p_autor uuid
) returns text
language plpgsql
set search_path = ''
as $$
declare
  pessoa text;
begin
  if not exists (
    select 1 from public.usuarios
    where id = p_autor and papel = 'admin' and ativo and not recusado
  ) then
    raise exception using errcode = '42501', message = 'Administrador ativo necessário';
  end if;

  insert into public.acesso_facial_vinculos
    (cliente_id, asaas_ambiente, asaas_boleto_id, vencimento, atualizado_por)
  select c.id, p_ambiente, p_boleto, p_vencimento, p_autor
    from public.clientes c join public.unidades u on u.id = c.unidade_id
    where c.id = p_cliente and c.status = 'ativo' and u.ativo
  on conflict (cliente_id) do update set
    asaas_ambiente = excluded.asaas_ambiente,
    asaas_boleto_id = excluded.asaas_boleto_id,
    vencimento = excluded.vencimento,
    atualizado_por = excluded.atualizado_por,
    atualizado_em = now()
  returning pessoa_terminal into pessoa;

  return pessoa;
end;
$$;

revoke all on function public.ubox_vincular_boleto_facial(text, text, text, date, uuid) from public, anon, authenticated;
grant execute on function public.ubox_vincular_boleto_facial(text, text, text, date, uuid) to service_role;
