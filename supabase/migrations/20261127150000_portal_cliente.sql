alter type public.papel add value if not exists 'cliente';

alter table public.clientes
  add column if not exists cpf text,
  add column if not exists asaas_customer_id text;

do $$ begin
  alter table public.clientes add constraint portal_cliente_cpf_formato
    check (cpf is null or cpf ~ '^[0-9]{11}$');
exception when duplicate_object then null; end $$;
create unique index if not exists portal_cliente_cpf_unidade_idx
  on public.clientes (unidade_id, cpf) where cpf is not null;

alter table public.usuarios add column if not exists cliente_id text;
-- A coluna pode ter sido criada antes pela migração do Acesso Inteligente.
do $$ begin
  alter table public.usuarios add constraint portal_cliente_usuario_cliente_fkey
    foreign key (cliente_id) references public.clientes(id);
exception when duplicate_object then null; end $$;
-- O cast permite validar a restrição antes do commit que publica o valor do enum.
do $$ begin
  alter table public.usuarios add constraint portal_cliente_vinculo
    check ((papel::text = 'cliente') = (cliente_id is not null));
exception when duplicate_object then null; end $$;
create unique index if not exists portal_cliente_usuario_idx
  on public.usuarios (cliente_id) where cliente_id is not null;

create function app.portal_normalizar_cpf() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.cpf := regexp_replace(new.cpf, '[^0-9]', '', 'g');
  return new;
end $$;
revoke all on function app.portal_normalizar_cpf() from public, anon, authenticated;
create trigger portal_normalizar_cpf before insert or update of cpf on public.clientes
for each row execute function app.portal_normalizar_cpf();

create or replace function app.conta_ativa(u public.usuarios) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(u.ativo and not u.recusado and (u.papel::text <> 'cliente' or exists (
    select 1 from public.clientes c join public.unidades un on un.id = c.unidade_id
    where c.id = u.cliente_id and c.unidade_id = u.unidade_id and c.status = 'ativo' and un.ativo
  )), false)
$$;

create or replace function app.tem_modulo(u public.usuarios, slug text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(u.papel::text <> 'cliente' and slug = any (u.modulos_liberados), false)
$$;

create function app.sessao_cliente() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((app.perfil()).papel::text = 'cliente', false)
$$;

create function app.meu_cliente_id() returns text
language sql stable security definer set search_path = '' as $$
  select u.cliente_id from app.perfil() u
  where u.papel::text = 'cliente' and app.conta_ativa(u)
$$;

revoke all on function app.sessao_cliente(), app.meu_cliente_id() from public, anon, authenticated;
grant execute on function app.sessao_cliente(), app.meu_cliente_id() to authenticated;

-- As tabelas de equipe existentes conservam suas políticas. A barreira
-- restritiva também cobre as políticas que consultam apenas UID ou unidade.
do $$
declare tabela record;
begin
  for tabela in select relname from pg_catalog.pg_class
    where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') and relrowsecurity
      and relname not in ('usuarios', 'clientes', 'cliente_paineis', 'cliente_painel_cobrancas',
        'cliente_painel_visitas', 'cliente_painel_recados')
  loop
    execute format('create policy portal_apenas_equipe on public.%I as restrictive for all to authenticated
      using (not (select app.sessao_cliente())) with check (not (select app.sessao_cliente()))', tabela.relname);
  end loop;
end $$;

create policy portal_proprio on public.clientes for select to authenticated
  using (id = (select app.meu_cliente_id()));
create policy portal_painel_proprio on public.cliente_paineis for select to authenticated using (
  cliente_id = (select app.meu_cliente_id()) and exists (
    select 1 from public.clientes c where c.id = cliente_paineis.cliente_id and c.painel_token = cliente_paineis.token
  )
);

do $$
declare tabela text;
begin
  foreach tabela in array array['cliente_painel_cobrancas','cliente_painel_visitas','cliente_painel_recados'] loop
    execute format('create policy portal_itens_apenas_equipe on public.%I as restrictive for insert to authenticated
      with check (not (select app.sessao_cliente()))', tabela);
    execute format('create policy portal_edicao_apenas_equipe on public.%I as restrictive for update to authenticated
      using (not (select app.sessao_cliente())) with check (not (select app.sessao_cliente()))', tabela);
  end loop;
end $$;

create policy portal_perfil_privado on public.usuarios as restrictive for all to authenticated
  using (case when papel::text = 'cliente' or (select app.sessao_cliente()) then id = (select auth.uid()) else true end)
  with check (case when papel::text = 'cliente' or (select app.sessao_cliente()) then
    id = (select auth.uid()) and papel::text = 'cliente' else true end);

create table public.cliente_faciais (
  cliente_id text primary key references public.clientes(id),
  unidade_id text not null references public.unidades(id),
  foto_path text not null,
  consentimento_em timestamptz not null,
  consentimento_texto_versao text not null,
  cadastrado_por text not null check (cadastrado_por in ('cliente', 'unidade')),
  status text not null check (status in ('pendente_envio', 'enviado', 'erro')),
  atualizado_em timestamptz not null default now(),
  check (split_part(foto_path, '/', 1) = unidade_id and split_part(foto_path, '/', 2) = cliente_id
    and foto_path ~ '^[^/]+/[^/]+/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png)$')
);
alter table public.cliente_faciais enable row level security;
revoke all on public.cliente_faciais from public, anon, authenticated;
grant select, insert, update, delete on public.cliente_faciais to authenticated, service_role;

create function app.portal_facial_permitida(p_unidade text, p_cliente text, p_ativo boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clientes c where c.id = p_cliente and c.unidade_id = p_unidade
      and (not p_ativo or c.status = 'ativo')
      and (c.id = app.meu_cliente_id() or (app.unidade_cliente() and c.unidade_id = app.minha_unidade_id()))
  )
$$;
revoke all on function app.portal_facial_permitida(text, text, boolean) from public, anon, authenticated;
grant execute on function app.portal_facial_permitida(text, text, boolean) to authenticated;

create policy portal_facial_ler on public.cliente_faciais for select to authenticated
  using (app.portal_facial_permitida(unidade_id, cliente_id, true));
create policy portal_facial_inserir on public.cliente_faciais for insert to authenticated
  with check (app.portal_facial_permitida(unidade_id, cliente_id, true));
create policy portal_facial_editar on public.cliente_faciais for update to authenticated
  using (app.portal_facial_permitida(unidade_id, cliente_id, true))
  with check (app.portal_facial_permitida(unidade_id, cliente_id, true));
create policy portal_facial_excluir on public.cliente_faciais for delete to authenticated
  using ((select app.unidade_cliente()) and unidade_id = (select app.minha_unidade_id()));

create function app.portal_facial_gravar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) <> 'authenticated' then return new; end if;
  if tg_op = 'UPDATE' and (new.cliente_id, new.unidade_id) is distinct from (old.cliente_id, old.unidade_id) then
    raise exception 'Vínculo da facial é imutável' using errcode = '42501';
  end if;
  perform 1 from public.clientes
    where id = new.cliente_id and unidade_id = new.unidade_id and status = 'ativo' for update;
  if not found or not app.portal_facial_permitida(new.unidade_id, new.cliente_id, true)
      or new.consentimento_texto_versao <> '2026-11-27-v1' then
    raise exception 'Facial indisponível' using errcode = '42501';
  end if;
  new.cadastrado_por := case when app.sessao_cliente() then 'cliente' else 'unidade' end;
  new.status := 'pendente_envio';
  new.consentimento_em := now();
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function app.portal_facial_gravar() from public, anon, authenticated;
create trigger portal_facial_gravar before insert or update on public.cliente_faciais
for each row execute function app.portal_facial_gravar();

-- Uma política restritiva impede que políticas mais amplas do Storage
-- abram o bucket facial ou deem acesso a outros buckets para um cliente.
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('cliente-faciais', 'cliente-faciais', false, 5242880, array['image/jpeg','image/png'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

  execute 'create policy portal_storage_limite on storage.objects as restrictive for all to authenticated
    using (case when bucket_id = ''cliente-faciais'' then
      app.portal_facial_permitida(split_part(name, ''/'', 1), split_part(name, ''/'', 2), false)
      else not (select app.sessao_cliente()) end)
    with check (case when bucket_id = ''cliente-faciais'' then
      name ~ ''^[^/]+/[^/]+/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png)$'' and
      app.portal_facial_permitida(split_part(name, ''/'', 1), split_part(name, ''/'', 2), true)
      else not (select app.sessao_cliente()) end)';
  execute 'create policy portal_storage_privado on storage.objects as restrictive for all to anon
    using (bucket_id <> ''cliente-faciais'') with check (bucket_id <> ''cliente-faciais'')';
  execute 'create policy portal_storage_ler on storage.objects for select to authenticated using (bucket_id = ''cliente-faciais'')';
  execute 'create policy portal_storage_inserir on storage.objects for insert to authenticated with check (bucket_id = ''cliente-faciais'')';
  execute 'create policy portal_storage_excluir on storage.objects for delete to authenticated using (bucket_id = ''cliente-faciais'')';
  execute 'create policy portal_storage_sem_sobrescrita on storage.objects as restrictive for update to authenticated
    using (bucket_id <> ''cliente-faciais'') with check (bucket_id <> ''cliente-faciais'')';
end $$;

create function app.portal_encerrar_contrato() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- O RPC desativa o painel antes de gravar o contrato. Escritas diretas da
  -- equipe continuam sujeitas à restrição adiada da fase 13.
  if current_setting('role', true) <> 'authenticated' then
    update public.cliente_paineis set ativo = false where cliente_id = new.id and ativo;
  end if;
  update public.usuarios set ativo = false where cliente_id = new.id and papel::text = 'cliente';
  delete from public.cliente_faciais where cliente_id = new.id;
  return new;
end $$;
revoke all on function app.portal_encerrar_contrato() from public, anon, authenticated;
create trigger portal_encerrar_contrato after update of status on public.clientes
for each row when (new.status = 'encerrado' and old.status is distinct from new.status)
execute function app.portal_encerrar_contrato();

create function public.preparar_acesso_cliente(p_chamador uuid, p_cliente text, p_uid uuid default null, p_email text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  chamador public.usuarios;
  c public.clientes;
  un public.unidades;
  conta public.usuarios;
begin
  select * into chamador from public.usuarios where id = p_chamador;
  if not found or chamador.papel::text not in ('franqueado','equipe_franqueado')
    or not app.conta_ativa(chamador) or not app.unidade_ativa(chamador) or not app.tem_modulo(chamador, 'cliente') then
    return null;
  end if;
  select * into c from public.clientes where id = p_cliente and unidade_id = chamador.unidade_id
    and status = 'ativo' and cpf is not null for update;
  if not found then return null; end if;
  select * into conta from public.usuarios where cliente_id = c.id and unidade_id = c.unidade_id and papel::text = 'cliente';
  if not found and p_uid is not null then
    select * into un from public.unidades where id = c.unidade_id;
    insert into public.usuarios (id, papel, cliente_id, email, nome, unidade_id, unidade, cidade, ativo, criado_por)
    select p_uid, 'cliente', c.id, p_email, c.nome, un.id, un.nome, un.cidade, true, p_chamador
    where exists (select 1 from auth.users a where a.id = p_uid and a.email = p_email)
    returning * into conta;
  elsif conta.id is not null and not conta.ativo and not conta.recusado and p_uid is null then
    update public.usuarios set ativo = true where id = conta.id returning * into conta;
  end if;
  if conta.recusado then return null; end if;
  return jsonb_build_object('cpf', c.cpf, 'unidade_id', c.unidade_id, 'uid', conta.id);
end $$;

-- O índice por unidade atende à unicidade, e este atende à entrada sem unidade.
create index if not exists portal_cliente_login_cpf_idx on public.clientes (cpf) where cpf is not null;

create function public.contas_login_cliente(p_cpf text, p_unidade text default null)
returns table (uid uuid, email text, unidade_id text, unidade_nome text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email, un.id, un.nome
  from public.clientes c join public.usuarios u on u.cliente_id = c.id
    join public.unidades un on un.id = c.unidade_id
  where c.cpf = p_cpf and (p_unidade is null or c.unidade_id = p_unidade)
    and u.papel::text = 'cliente' and app.conta_ativa(u)
  order by un.nome, un.id
$$;

revoke all on function public.preparar_acesso_cliente(uuid, text, uuid, text),
  public.contas_login_cliente(text, text) from public, anon, authenticated;
grant execute on function public.preparar_acesso_cliente(uuid, text, uuid, text),
  public.contas_login_cliente(text, text) to service_role;

create or replace function public.criar_cliente(p_id text, p_token text, p_cliente jsonb, p_painel jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  contrato constant jsonb := '{"box":"string","contrato_inicio":"string","contrato_fim":"string|null",
    "valor_mensal_centavos":"number","dia_vencimento":"number"}';
begin
  if not coalesce(app.unidade_cliente(), false) then
    raise exception 'Sem permissão para gravar clientes' using errcode = '42501';
  end if;
  if not app.cliente_json_valido(p_cliente, contrato || '{"unidade_id":"string","nome":"string",
    "telefone":"string","email":"string","cpf":"string|null","asaas_customer_id":"string|null","status":"string","obs":"string","atualizado_por":"string|null",
    "atualizado_por_nome":"string|null"}',
    array['unidade_id','nome','telefone','email','box','contrato_inicio','contrato_fim',
      'valor_mensal_centavos','dia_vencimento','status','obs'])
    or not app.cliente_json_valido(p_painel, contrato || '{"unidade_nome":"string","contato_unidade":"string",
      "primeiro_nome":"string","ativo":"boolean"}',
      array['unidade_nome','contato_unidade','primeiro_nome','box','contrato_inicio','contrato_fim',
        'valor_mensal_centavos','dia_vencimento','ativo']) then
    raise exception 'Campos inválidos para criação de cliente e painel' using errcode = '42501';
  end if;
  if p_cliente ? 'cpf' and p_cliente ->> 'cpf' is null then
    raise exception 'Informe o CPF do cliente' using errcode = '22023';
  end if;
  insert into public.clientes
    (id, painel_token, unidade_id, nome, telefone, email, box, contrato_inicio, contrato_fim,
     valor_mensal_centavos, dia_vencimento, status, obs, cpf, asaas_customer_id, atualizado_por, atualizado_por_nome)
  select p_id, p_token, c.unidade_id, c.nome, c.telefone, c.email, c.box, c.contrato_inicio, c.contrato_fim,
     c.valor_mensal_centavos, c.dia_vencimento, c.status, c.obs, c.cpf, c.asaas_customer_id, c.atualizado_por, c.atualizado_por_nome
  from jsonb_populate_record(null::public.clientes, p_cliente) c;

  insert into public.cliente_paineis
    (token, cliente_id, unidade_id, unidade_nome, contato_unidade, primeiro_nome, box, contrato_inicio,
     contrato_fim, valor_mensal_centavos, dia_vencimento, ativo)
  select p_token, p_id, p_cliente ->> 'unidade_id', p.unidade_nome, p.contato_unidade, p.primeiro_nome, p.box,
     p.contrato_inicio, p.contrato_fim, p.valor_mensal_centavos, p.dia_vencimento, p.ativo
  from jsonb_populate_record(null::public.cliente_paineis, p_painel) p;
  return p_id;
end $$;

create or replace function public.salvar_cliente(p_id text, p_token text, p_dados jsonb, p_primeiro_nome text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  c public.clientes;
begin
  if not coalesce(app.unidade_cliente(), false) then
    raise exception 'Sem permissão para gravar clientes' using errcode = '42501';
  end if;
  if not app.cliente_json_valido(p_dados, '{"nome":"string","telefone":"string","email":"string","cpf":"string|null","asaas_customer_id":"string|null",
    "box":"string","contrato_inicio":"string","contrato_fim":"string|null","valor_mensal_centavos":"number",
    "dia_vencimento":"number","status":"string","obs":"string"}', array[]::text[]) then
    raise exception 'Campos inválidos para edição do cliente' using errcode = '42501';
  end if;
  select * into c from public.clientes where id = p_id and painel_token = p_token for update;
  if not found then
    raise exception 'Cliente indisponível ou link já trocado' using errcode = '42501';
  end if;
  c := jsonb_populate_record(c, p_dados);
  update public.cliente_paineis
  set primeiro_nome = p_primeiro_nome, box = c.box, contrato_inicio = c.contrato_inicio, contrato_fim = c.contrato_fim,
      valor_mensal_centavos = c.valor_mensal_centavos, dia_vencimento = c.dia_vencimento, ativo = ativo and c.status = 'ativo'
  where token = p_token and cliente_id = p_id;
  if not found then
    raise exception 'Painel indisponível' using errcode = '42501';
  end if;

  update public.clientes set nome = c.nome, telefone = c.telefone, email = c.email, obs = c.obs, box = c.box,
    contrato_inicio = c.contrato_inicio, contrato_fim = c.contrato_fim, valor_mensal_centavos = c.valor_mensal_centavos,
    dia_vencimento = c.dia_vencimento, status = c.status, cpf = c.cpf, asaas_customer_id = c.asaas_customer_id where id = p_id;
end $$;


-- Reconhece as fotos do portal (enviado) e os status usados pelo Acesso Inteligente.
create or replace function app.acesso_tem_facial(p_cliente text)
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
        and j.dados->>'status' in ('ativo','aprovado','cadastrado','enviado')
    )
  $sql$ into utilizavel using p_cliente;
  return utilizavel;
end
$$;
