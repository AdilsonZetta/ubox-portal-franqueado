-- Eventos de controle de acesso ficam em acesso_inteligente_eventos. acesso_eventos pertence ao cofre de senhas.
alter table public.clientes add column if not exists cpf text, add column if not exists asaas_customer_id text;
alter table public.usuarios add column if not exists cliente_id text;
create index clientes_acesso_asaas_idx on public.clientes (unidade_id, asaas_customer_id) where asaas_customer_id is not null;
alter table public.clientes add constraint clientes_acesso_unidade_id_unique unique (unidade_id, id);

create table public.unidade_acesso_config (
  unidade_id text primary key references public.unidades(id) on delete cascade,
  tolerancia_dias integer not null default 5 check (tolerancia_dias between 0 and 90),
  asaas_ambiente text check (asaas_ambiente in ('sandbox', 'producao')),
  asaas_configurada_em timestamptz,
  asaas_revisao uuid,
  hikvision_tipo text check (hikvision_tipo in ('terminal_facial', 'hikcentral')),
  hikvision_host text,
  hikvision_porta integer check (hikvision_porta between 1 and 65535),
  hikvision_configurada_em timestamptz,
  webhook_token_hash text unique check (webhook_token_hash ~ '^[0-9a-f]{64}$'),
  webhook_token_prefix text check (webhook_token_prefix ~ '^[0-9a-f]{6}$'),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create table public.asaas_cobrancas_cache (
  unidade_id text not null references public.unidades(id) on delete cascade,
  cliente_id text,
  payment_id text not null check (payment_id ~ '^pay_[a-zA-Z0-9_-]{1,96}$'),
  status text not null check (status in ('pago','em_aberto','vencido','estornado','em_analise')),
  vencimento date not null,
  valor numeric not null check (valor >= 0 and valor < 1000000000000),
  link_boleto text,
  pix_copia_cola text,
  invoice_url text,
  atualizado_em timestamptz not null default now(),
  primary key (unidade_id, payment_id),
  foreign key (unidade_id, cliente_id) references public.clientes(unidade_id, id) on delete cascade
);
comment on column public.asaas_cobrancas_cache.valor is 'Valor da cobrança em reais (Asaas value).';
create index asaas_cobrancas_cliente_idx on public.asaas_cobrancas_cache (unidade_id, cliente_id, status, vencimento);

create table public.acesso_liberacoes_manuais (
  id uuid primary key default gen_random_uuid(),
  cliente_id text not null,
  unidade_id text not null,
  motivo text not null check (char_length(btrim(motivo)) between 1 and 500),
  valido_ate date,
  ativo boolean not null default true,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  encerrado_por uuid,
  encerrado_em timestamptz,
  foreign key (unidade_id, cliente_id) references public.clientes(unidade_id, id) on delete cascade
);
create unique index acesso_liberacao_ativa_idx on public.acesso_liberacoes_manuais (cliente_id) where ativo;

create table public.acesso_inteligente_eventos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  texto text not null,
  cliente_id text,
  unidade_id text not null references public.unidades(id) on delete cascade,
  autor_id uuid not null,
  autor_nome text not null,
  criado_em timestamptz not null default now()
);
create index acesso_inteligente_eventos_unidade_idx on public.acesso_inteligente_eventos (unidade_id, criado_em desc);

create function app.acesso_unidade_permitida(p_unidade text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(app.conta_ativa(u) and (
    u.papel::text = 'admin' or (
      u.papel::text in ('franqueado','equipe_franqueado') and u.unidade_id = p_unidade
      and app.unidade_ativa(u) and app.tem_modulo(u,'acesso')
    )
  ),false) from app.perfil() u
$$;
revoke all on function app.acesso_unidade_permitida(text) from public, anon, authenticated;
grant execute on function app.acesso_unidade_permitida(text) to authenticated;

alter table public.unidade_acesso_config enable row level security;
alter table public.asaas_cobrancas_cache enable row level security;
alter table public.acesso_liberacoes_manuais enable row level security;
alter table public.acesso_inteligente_eventos enable row level security;
revoke all on public.unidade_acesso_config, public.asaas_cobrancas_cache, public.acesso_liberacoes_manuais,
  public.acesso_inteligente_eventos from public, anon, authenticated;
grant select (unidade_id, tolerancia_dias, asaas_ambiente, asaas_configurada_em, hikvision_tipo,
  hikvision_host, hikvision_porta, hikvision_configurada_em, webhook_token_prefix, atualizado_em, atualizado_por)
  on public.unidade_acesso_config to authenticated;
grant select on public.asaas_cobrancas_cache, public.acesso_liberacoes_manuais, public.acesso_inteligente_eventos to authenticated;
grant select, insert, update, delete on public.unidade_acesso_config, public.asaas_cobrancas_cache,
  public.acesso_liberacoes_manuais, public.acesso_inteligente_eventos to service_role;
create policy acesso_config_escopo on public.unidade_acesso_config for select to authenticated using (app.acesso_unidade_permitida(unidade_id));
create policy acesso_cache_escopo on public.asaas_cobrancas_cache for select to authenticated using (app.acesso_unidade_permitida(unidade_id));
create policy acesso_liberacoes_escopo on public.acesso_liberacoes_manuais for select to authenticated using (app.acesso_unidade_permitida(unidade_id));
create policy acesso_eventos_escopo on public.acesso_inteligente_eventos for select to authenticated using (app.acesso_unidade_permitida(unidade_id));

-- Perfil mínimo para autorização nas Edge Functions. O UID vem do JWT verificado.
create function public.ubox_acesso_perfil(p_autor uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',u.id,'papel',u.papel::text,'ativo',u.ativo,'recusado',u.recusado,
    'unidade_id',u.unidade_id,'cliente_id',u.cliente_id,'unidade_ativa',app.unidade_ativa(u),'tem_modulo',app.tem_modulo(u,'acesso'))
  from public.usuarios u where u.id = p_autor
$$;

create function public.ubox_acesso_ler_segredo(p_unidade text, p_tipo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_tipo is null or p_tipo not in ('asaas','hikvision') then
    raise exception 'Integração inválida' using errcode = '22023';
  end if;
  return (select decrypted_secret::jsonb from vault.decrypted_secrets
          where name = 'ubox_' || p_tipo || '_unidade_' || p_unidade);
end
$$;

create function public.ubox_acesso_salvar_segredo(p_unidade text, p_tipo text, p_config jsonb, p_autor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  nome_seg text;
  segredo_id uuid;
  ambiente text := p_config->>'ambiente';
  chave text := p_config->>'chave';
  revisao uuid := gen_random_uuid();
begin
  if p_tipo is null or p_tipo not in ('asaas','hikvision') then
    raise exception 'Integração inválida' using errcode = '22023';
  end if;
  if p_tipo = 'asaas' and (
    ambiente is null or ambiente not in ('sandbox','producao') or chave is null
    or char_length(chave) not between 16 and 512 or chave ~ '[^!-~]'
    or left(chave,11) <> case when ambiente = 'sandbox' then '$aact_hmlg_' else '$aact_prod_' end
  ) then raise exception 'Configuração inválida' using errcode = '22023'; end if;

  nome_seg := 'ubox_' || p_tipo || '_unidade_' || p_unidade;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(nome_seg,0));
  insert into public.unidade_acesso_config (unidade_id, atualizado_por)
    values (p_unidade,p_autor) on conflict (unidade_id) do nothing;
  if p_tipo = 'asaas' then p_config := p_config || jsonb_build_object('revisao',revisao); end if;
  select id into segredo_id from vault.secrets where name = nome_seg;
  if segredo_id is null then
    perform vault.create_secret(p_config::text,nome_seg);
  else
    perform vault.update_secret(segredo_id,p_config::text);
  end if;
  if p_tipo = 'asaas' then
    update public.unidade_acesso_config set asaas_ambiente = ambiente, asaas_configurada_em = now(), asaas_revisao = revisao,
      atualizado_em = now(), atualizado_por = p_autor where unidade_id = p_unidade;
    delete from public.asaas_cobrancas_cache where unidade_id = p_unidade;
  else
    update public.unidade_acesso_config set hikvision_tipo = p_config->>'tipo',
      hikvision_host = p_config->>'host', hikvision_porta = (p_config->>'porta')::integer,
      hikvision_configurada_em = now(), atualizado_em = now(), atualizado_por = p_autor
    where unidade_id = p_unidade;
  end if;
end
$$;

revoke all on function public.ubox_acesso_perfil(uuid), public.ubox_acesso_ler_segredo(text,text),
  public.ubox_acesso_salvar_segredo(text,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.ubox_acesso_perfil(uuid), public.ubox_acesso_ler_segredo(text,text),
  public.ubox_acesso_salvar_segredo(text,text,jsonb,uuid) to service_role;

create function app.acesso_tem_facial(p_cliente text)
returns boolean language plpgsql stable set search_path = '' as $$
declare utilizavel boolean;
begin
  if to_regclass('public.cliente_faciais') is null then return false; end if;
  execute $sql$
    select exists (
      select 1 from public.cliente_faciais f
      cross join lateral (select to_jsonb(f) as dados) j
      where f.cliente_id = $1 and j.dados->>'consentimento_em' is not null
        and nullif(btrim(coalesce(j.dados->>'foto_path',j.dados->>'foto',j.dados->>'path')), '') is not null
        and j.dados->>'status' in ('ativo','aprovado','cadastrado')
    )
  $sql$ into utilizavel using p_cliente;
  return utilizavel;
end
$$;
revoke all on function app.acesso_tem_facial(text) from public, anon, authenticated;

create function public.ubox_acesso_listar(p_unidade text)
returns table (id text, nome text, box text, status text, tem_conta_asaas boolean, tem_liberacao boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.acesso_unidade_permitida(p_unidade) then
    raise exception 'Sem permissão para esta unidade' using errcode = '42501';
  end if;
  return query
    select c.id,c.nome,c.box,
      case
        when not app.acesso_tem_facial(c.id) then 'Sem facial'
        when manual.valida then 'Liberado manualmente'
        when vencida.data + coalesce(cfg.tolerancia_dias,5) < current_date then 'Bloqueado por inadimplência'
        else 'Liberado'
      end,
      nullif(c.asaas_customer_id,'') is not null, manual.valida
    from public.clientes c
    left join public.unidade_acesso_config cfg on cfg.unidade_id = c.unidade_id
    cross join lateral (select exists (select 1 from public.acesso_liberacoes_manuais l where l.cliente_id = c.id
      and l.ativo and (l.valido_ate is null or l.valido_ate >= current_date)) as valida) manual
    cross join lateral (select min(b.vencimento) as data from public.asaas_cobrancas_cache b
      where b.unidade_id = c.unidade_id and b.cliente_id = c.id and b.status = 'vencido') vencida
    where c.unidade_id = p_unidade and c.status = 'ativo'
    order by c.nome,c.id;
end
$$;

create function public.ubox_acesso_liberacao(p_cliente text, p_liberar boolean, p_motivo text, p_valido_ate date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  autor public.usuarios := app.perfil();
  unidade text;
begin
  select unidade_id into unidade from public.clientes where id = p_cliente and status = 'ativo' for update;
  if unidade is null or not app.acesso_unidade_permitida(unidade) then
    raise exception 'Sem permissão para este cliente' using errcode = '42501';
  end if;
  if p_liberar is null or (p_liberar and (
    coalesce(char_length(btrim(p_motivo)),0) not between 1 and 500
    or p_valido_ate < current_date
  )) then raise exception 'Confira o motivo e a data de validade' using errcode = '22023'; end if;
  update public.acesso_liberacoes_manuais set ativo = false, encerrado_em = now(), encerrado_por = autor.id
    where cliente_id = p_cliente and ativo;
  if not p_liberar and not found then return; end if;
  if p_liberar then
    insert into public.acesso_liberacoes_manuais(cliente_id,unidade_id,motivo,valido_ate,criado_por)
      values (p_cliente,unidade,btrim(p_motivo),p_valido_ate,autor.id);
  end if;
  insert into public.acesso_inteligente_eventos(tipo,texto,cliente_id,unidade_id,autor_id,autor_nome) values (
    case when p_liberar then 'liberar_acesso' else 'remover_liberacao' end,
    case when p_liberar then 'Acesso liberado manualmente. ' || btrim(p_motivo) else 'Liberação manual removida.' end,
    p_cliente,unidade,autor.id,autor.nome
  );
end
$$;
revoke all on function public.ubox_acesso_listar(text), public.ubox_acesso_liberacao(text,boolean,text,date) from public, anon, authenticated;
grant execute on function public.ubox_acesso_listar(text), public.ubox_acesso_liberacao(text,boolean,text,date) to authenticated;

-- Resolve e atualiza a cobrança dentro da mesma transação que valida o token.
create function public.ubox_acesso_receber_pagamento(p_hash text, p_customer text, p_cobranca jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  unidade text;
  cliente text;
  cliente_anterior text;
  pagamento public.asaas_cobrancas_cache;
begin
  select cfg.unidade_id into unidade from public.unidade_acesso_config cfg
    join public.unidades u on u.id = cfg.unidade_id and u.ativo
    where cfg.webhook_token_hash = p_hash for share of cfg;
  if unidade is null then return false; end if;
  if p_cobranca is null then return true; end if;

  pagamento := jsonb_populate_record(null::public.asaas_cobrancas_cache,p_cobranca);
  select case when count(*) = 1 then min(c.id) end into cliente
    from public.clientes c where c.unidade_id = unidade and c.asaas_customer_id = p_customer;
  select cliente_id into cliente_anterior from public.asaas_cobrancas_cache
    where unidade_id = unidade and payment_id = pagamento.payment_id;
  -- Um pagamento já vinculado não deve migrar de contrato por um evento divergente.
  if cliente_anterior is not null and cliente is not null and cliente_anterior <> cliente then return true; end if;

  insert into public.asaas_cobrancas_cache as cache (unidade_id,cliente_id,payment_id,status,vencimento,valor,link_boleto,pix_copia_cola,invoice_url)
    values (unidade,coalesce(cliente,cliente_anterior),pagamento.payment_id,pagamento.status,pagamento.vencimento,
      pagamento.valor,pagamento.link_boleto,pagamento.pix_copia_cola,pagamento.invoice_url)
    on conflict (unidade_id,payment_id) do update set cliente_id = coalesce(cache.cliente_id, excluded.cliente_id),
      status = excluded.status, vencimento = excluded.vencimento, valor = excluded.valor,
      link_boleto = coalesce(excluded.link_boleto,cache.link_boleto),
      pix_copia_cola = coalesce(excluded.pix_copia_cola,cache.pix_copia_cola),
      invoice_url = coalesce(excluded.invoice_url,cache.invoice_url), atualizado_em = now()
    where cache.cliente_id is null or excluded.cliente_id is null or cache.cliente_id = excluded.cliente_id;
  return true;
end
$$;
revoke all on function public.ubox_acesso_receber_pagamento(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.ubox_acesso_receber_pagamento(text,text,jsonb) to service_role;

create function public.ubox_acesso_sincronizar_cache(
  p_unidade text, p_cliente text, p_customer text, p_revisao uuid, p_cobrancas jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare revisao_atual uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ubox_asaas_unidade_' || p_unidade,0));
  select asaas_revisao into revisao_atual from public.unidade_acesso_config where unidade_id = p_unidade;
  if p_revisao is distinct from revisao_atual then
    raise exception 'A configuração do Asaas mudou. Tente novamente.' using errcode = '40001';
  end if;
  perform 1 from public.clientes where id = p_cliente and unidade_id = p_unidade and asaas_customer_id = p_customer for share;
  if not found then raise exception 'O vínculo com o Asaas mudou. Tente novamente.' using errcode = '40001'; end if;
  insert into public.asaas_cobrancas_cache as cache (unidade_id,cliente_id,payment_id,status,vencimento,valor,link_boleto,pix_copia_cola,invoice_url)
    select distinct on (p.payment_id) p_unidade,p_cliente,p.payment_id,p.status,p.vencimento,p.valor,p.link_boleto,p.pix_copia_cola,p.invoice_url
    from jsonb_populate_recordset(null::public.asaas_cobrancas_cache,p_cobrancas) p order by p.payment_id
    on conflict (unidade_id,payment_id) do update set cliente_id = excluded.cliente_id, status = excluded.status,
      vencimento = excluded.vencimento, valor = excluded.valor,
      link_boleto = coalesce(excluded.link_boleto,cache.link_boleto),
      pix_copia_cola = coalesce(excluded.pix_copia_cola,cache.pix_copia_cola),
      invoice_url = coalesce(excluded.invoice_url,cache.invoice_url), atualizado_em = now()
    where cache.cliente_id is null or cache.cliente_id = excluded.cliente_id;
end
$$;
revoke all on function public.ubox_acesso_sincronizar_cache(text,text,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.ubox_acesso_sincronizar_cache(text,text,text,uuid,jsonb) to service_role;

-- Invalida cobranças de um vínculo anterior ao editar o cadastro do cliente.
create function app.acesso_limpar_cache_do_vinculo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.asaas_cobrancas_cache where unidade_id = old.unidade_id and cliente_id = old.id;
  return new;
end
$$;
revoke all on function app.acesso_limpar_cache_do_vinculo() from public, anon, authenticated;
create trigger acesso_limpar_cache_do_vinculo before update of asaas_customer_id, cpf, unidade_id on public.clientes
for each row when (old.asaas_customer_id is distinct from new.asaas_customer_id or old.cpf is distinct from new.cpf or old.unidade_id is distinct from new.unidade_id)
execute function app.acesso_limpar_cache_do_vinculo();
