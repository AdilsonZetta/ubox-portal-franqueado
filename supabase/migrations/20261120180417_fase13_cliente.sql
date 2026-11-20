-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
-- Fase 13: Painel do Cliente (módulo 12).

create table public.clientes (
  id text primary key default gen_random_uuid()::text,
  unidade_id text not null references public.unidades(id),
  nome text not null check (char_length(nome) between 2 and 120),
  telefone text not null check (telefone ~ '^[0-9 ()+.-]{0,30}$'),
  email text not null check (char_length(email) <= 120 and (email = '' or email ~ '^[^@ ]+@[^@ ]+[.][^@ ]+$')),
  box text not null check (char_length(box) between 1 and 60),
  contrato_inicio timestamptz not null,
  contrato_fim timestamptz,
  valor_mensal_centavos numeric not null check (valor_mensal_centavos between 0 and 100000000 and trunc(valor_mensal_centavos) = valor_mensal_centavos),
  dia_vencimento numeric not null check (dia_vencimento between 1 and 28 and trunc(dia_vencimento) = dia_vencimento),
  status text not null check (status in ('ativo', 'encerrado')),
  painel_token text not null check (painel_token ~ '^[0-9a-f]{32}$'),
  obs text not null check (char_length(obs) <= 1000),
  criado_em timestamptz not null default now(),
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null default now()
);

create table public.cliente_paineis (
  token text primary key check (token ~ '^[0-9a-f]{32}$'),
  unidade_id text not null references public.unidades(id),
  unidade_nome text not null,
  contato_unidade text not null check (char_length(contato_unidade) <= 120),
  cliente_id text not null references public.clientes(id) check (char_length(cliente_id) between 1 and 64),
  primeiro_nome text not null check (primeiro_nome ~ '^[^ ]{1,40}$'),
  box text not null check (char_length(box) between 1 and 60),
  contrato_inicio timestamptz not null,
  contrato_fim timestamptz,
  valor_mensal_centavos numeric not null check (valor_mensal_centavos between 0 and 100000000 and trunc(valor_mensal_centavos) = valor_mensal_centavos),
  dia_vencimento numeric not null check (dia_vencimento between 1 and 28 and trunc(dia_vencimento) = dia_vencimento),
  ativo boolean not null,
  atualizado_em timestamptz not null default now()
);

create table public.cliente_painel_cobrancas (
  painel_token text not null references public.cliente_paineis(token) on delete cascade,
  id text not null,
  competencia text not null check (competencia = id and competencia ~ '^[0-9]{4}-[0-9]{2}$'),
  valor_centavos numeric not null check (valor_centavos between 0 and 100000000 and trunc(valor_centavos) = valor_centavos),
  vencimento text not null check (vencimento ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  status text not null check (status in ('pendente', 'pago')),
  pago_em text not null check (pago_em = '' or pago_em ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  primary key (painel_token, id)
);

create table public.cliente_painel_visitas (
  painel_token text not null references public.cliente_paineis(token) on delete cascade,
  id text not null default gen_random_uuid()::text,
  data text not null check (data ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  hora text not null check (hora ~ '^[0-9]{2}:[0-9]{2}$'),
  motivo text not null check (char_length(motivo) <= 200),
  status text not null check (status in ('agendada', 'realizada', 'cancelada')),
  primary key (painel_token, id)
);

create table public.cliente_painel_recados (
  painel_token text not null references public.cliente_paineis(token) on delete cascade,
  id text not null default gen_random_uuid()::text,
  texto text not null check (char_length(texto) between 2 and 500),
  criado_em timestamptz not null default now(),
  autor text not null check (autor ~ '^[^ ]{1,40}$'),
  gerado_por_ia boolean not null,
  ia_modelo text not null check (char_length(ia_modelo) <= 80 and
    (not gerado_por_ia or (char_length(ia_modelo) >= 2 and ia_modelo ~ '[^[:space:]]'))),
  primary key (painel_token, id)
);

create index clientes_unidade_idx on public.clientes (unidade_id, id);
create index cliente_paineis_unidade_idx on public.cliente_paineis (unidade_id, token);
create index cliente_paineis_cliente_idx on public.cliente_paineis (cliente_id);

create function app.unidade_cliente() returns boolean language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and u.papel in ('franqueado', 'equipe_franqueado')
    and app.tem_modulo(u, 'cliente') and app.unidade_ativa(u) and coalesce(u.unidade_id, '') <> ''
  from app.perfil() u
$$;

revoke all on function app.unidade_cliente() from public, anon, authenticated;
grant execute on function app.unidade_cliente() to authenticated;

do $$
declare
  tabela text;
  filtro text;
begin
  foreach tabela in array array['clientes', 'cliente_paineis', 'cliente_painel_cobrancas', 'cliente_painel_visitas', 'cliente_painel_recados'] loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('revoke all on public.%I from public, anon, authenticated', tabela);
    execute format('grant select, insert on public.%I to authenticated', tabela);
    -- A consulta ao painel pai usa a mesma política de unidade, inclusive para links inativos.
    filtro := case when tabela in ('clientes', 'cliente_paineis')
      then '(select app.unidade_cliente()) and unidade_id = (select app.minha_unidade_id())'
      else format('exists (select 1 from public.cliente_paineis p where p.token = %I.painel_token)', tabela)
    end;
    execute format('create policy cliente_le on public.%I for select to authenticated using (%s)', tabela, filtro);
    execute format('create policy cliente_insere on public.%I for insert to authenticated with check (%s)', tabela, filtro);
    if tabela <> 'cliente_painel_recados' then
      execute format('grant update on public.%I to authenticated', tabela);
      execute format('create policy cliente_edita on public.%I for update to authenticated using (%s) with check (%s)', tabela, filtro, filtro);
    end if;
  end loop;
end $$;

-- A RPC agrupa a escrita. Os gatilhos aplicam as mesmas condições a escritas
-- diretas e conferem o vínculo no fim da transação, como getAfter/existsAfter.
create function app.cliente_antes_gravar() returns trigger language plpgsql set search_path = '' as $$
declare
  u public.usuarios := app.perfil();
begin
  if not app.da_api() then return new; end if;

  if tg_op = 'UPDATE' then
    if (new.id, new.unidade_id, new.criado_em) is distinct from (old.id, old.unidade_id, old.criado_em) then
      raise exception 'Identidade, unidade e data de cadastro são imutáveis' using errcode = '42501';
    end if;
    if new.painel_token is distinct from old.painel_token then
      if not exists (select 1 from public.cliente_paineis p where p.token = old.painel_token
        and p.cliente_id = old.id and not p.ativo)
        or exists (select 1 from public.cliente_paineis p where p.token = new.painel_token) then
        raise exception 'A troca exige desativar o link atual e criar um token novo' using errcode = '42501';
      end if;
    end if;
    if (new.atualizado_por is distinct from old.atualizado_por and new.atualizado_por is not null and new.atualizado_por is distinct from auth.uid())
      or (new.atualizado_por_nome is distinct from old.atualizado_por_nome and new.atualizado_por_nome is not null and new.atualizado_por_nome is distinct from u.nome) then
      raise exception 'Autoria inválida' using errcode = '42501';
    end if;
  else
    if (new.atualizado_por is not null and new.atualizado_por is distinct from auth.uid())
      or (new.atualizado_por_nome is not null and new.atualizado_por_nome is distinct from u.nome) then
      raise exception 'Autoria inválida' using errcode = '42501';
    end if;
    new.criado_em := now();
  end if;
  new.atualizado_por := auth.uid();
  new.atualizado_por_nome := u.nome;
  new.atualizado_em := now();
  return new;
end $$;

create function app.cliente_confere_painel() returns trigger language plpgsql set search_path = '' as $$
begin
  -- Cada evento valida o token que gravou, inclusive se o cliente for atualizado de novo no lote.
  if not exists (select 1 from public.cliente_paineis p where p.token = new.painel_token
     and p.cliente_id = new.id and p.unidade_id = new.unidade_id
     and (new.status = 'ativo' or not p.ativo)) then
    raise exception 'O cliente precisa de um painel correspondente e o contrato encerrado exige link inativo' using errcode = '42501';
  end if;
  return new;
end $$;

create function app.cliente_painel_antes_gravar() returns trigger language plpgsql set search_path = '' as $$
declare
  c public.clientes;
begin
  if not app.da_api() then return new; end if;
  if tg_op = 'UPDATE' then
    if (new.token, new.cliente_id, new.unidade_id) is distinct from (old.token, old.cliente_id, old.unidade_id) then
      raise exception 'Token, cliente e unidade do painel são imutáveis' using errcode = '42501';
    end if;
    if new.atualizado_em is distinct from old.atualizado_em and new.atualizado_em is distinct from now() then
      raise exception 'Use o horário do servidor no painel' using errcode = '42501';
    end if;
  end if;
  if new.unidade_nome is distinct from (app.perfil()).unidade then
    raise exception 'Nome da unidade do painel inválido' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' or new.ativo then
    -- Serializa a ativação com a troca de token e o encerramento do contrato.
    select * into c from public.clientes where id = new.cliente_id for update;
    if not found or c.unidade_id is distinct from new.unidade_id or c.painel_token is distinct from new.token
      or (new.ativo and c.status <> 'ativo') then
      raise exception 'O painel não corresponde ao link atual do cliente' using errcode = '42501';
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

create function app.cliente_item_antes_atualizar() returns trigger language plpgsql set search_path = '' as $$
begin
  if not app.da_api() then return new; end if;
  if tg_table_name = 'cliente_painel_cobrancas' then
    if (to_jsonb(new) - array['status','pago_em']) is distinct from (to_jsonb(old) - array['status','pago_em']) then
      raise exception 'Só o pagamento da cobrança pode mudar' using errcode = '42501';
    end if;
  elsif old.status <> 'agendada' or (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Visita só pode mudar de status enquanto agendada' using errcode = '42501';
  end if;
  return new;
end $$;

create function app.cliente_recado_antes_inserir() returns trigger language plpgsql set search_path = '' as $$
begin
  if not app.da_api() then return new; end if;
  if new.criado_em > now() then
    raise exception 'A data do recado não pode estar no futuro' using errcode = '42501';
  end if;
  if new.autor is not null and new.autor !~ '^[^ ]{1,40}$' then
    raise exception 'O autor do recado deve ter uma palavra de até 40 caracteres' using errcode = '42501';
  end if;

  -- Só uma cópia fiel de um recado de link anterior do mesmo cliente pode
  -- conservar o autor e a data. Publicações recebem a autoria da sessão.
  if not exists (
    select 1 from public.cliente_paineis destino
    join public.cliente_paineis anterior on anterior.cliente_id = destino.cliente_id
      and anterior.token <> destino.token and not anterior.ativo
    join public.cliente_painel_recados r on r.painel_token = anterior.token and r.id = new.id
    where destino.token = new.painel_token
      and (r.texto, r.criado_em, r.autor, r.gerado_por_ia, r.ia_modelo) =
          (new.texto, new.criado_em, new.autor, new.gerado_por_ia, new.ia_modelo)
  ) then
    new.autor := coalesce(left(substring((app.perfil()).nome from '[^[:space:]]+'), 40), 'Equipe');
    new.criado_em := now();
  end if;
  return new;
end $$;

revoke all on function app.cliente_antes_gravar(), app.cliente_confere_painel(),
  app.cliente_painel_antes_gravar(), app.cliente_item_antes_atualizar(), app.cliente_recado_antes_inserir()
from public, anon, authenticated;

create trigger cliente_antes_gravar before insert or update on public.clientes
for each row execute function app.cliente_antes_gravar();
create constraint trigger cliente_confere_painel after insert or update on public.clientes
deferrable initially deferred for each row when (app.da_api()) execute function app.cliente_confere_painel();
create trigger cliente_painel_antes_gravar before insert or update on public.cliente_paineis
for each row execute function app.cliente_painel_antes_gravar();
create trigger cliente_cobranca_antes_atualizar before update on public.cliente_painel_cobrancas
for each row execute function app.cliente_item_antes_atualizar();
create trigger cliente_visita_antes_atualizar before update on public.cliente_painel_visitas
for each row execute function app.cliente_item_antes_atualizar();
create trigger cliente_recado_antes_inserir before insert on public.cliente_painel_recados
for each row execute function app.cliente_recado_antes_inserir();

-- jsonb_populate_record faz coerções. Valida os tipos do JSON antes de
-- converter, para manter as chaves e os tipos aceitos na API de origem.
create function app.cliente_json_valido(p_objeto jsonb, p_tipos jsonb, p_obrigatorios text[])
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_objeto) = 'object' then
    p_objeto ?& p_obrigatorios and not exists (
      select 1 from jsonb_each(p_objeto) as campo(chave, valor)
      where not (p_tipos ? campo.chave) or
        not (jsonb_typeof(campo.valor) = any (string_to_array(p_tipos ->> campo.chave, '|')))
    )
    else false end
$$;

revoke all on function app.cliente_json_valido(jsonb, jsonb, text[]) from public, anon, authenticated;
grant execute on function app.cliente_json_valido(jsonb, jsonb, text[]) to authenticated;

create function public.criar_cliente(p_id text, p_token text, p_cliente jsonb, p_painel jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  contrato constant jsonb := '{"box":"string","contrato_inicio":"string","contrato_fim":"string|null",
    "valor_mensal_centavos":"number","dia_vencimento":"number"}';
begin
  if not app.cliente_json_valido(p_cliente, contrato || '{"unidade_id":"string","nome":"string",
    "telefone":"string","email":"string","status":"string","obs":"string","atualizado_por":"string|null",
    "atualizado_por_nome":"string|null"}',
    array['unidade_id','nome','telefone','email','box','contrato_inicio','contrato_fim',
      'valor_mensal_centavos','dia_vencimento','status','obs'])
    or not app.cliente_json_valido(p_painel, contrato || '{"unidade_nome":"string","contato_unidade":"string",
      "primeiro_nome":"string","ativo":"boolean"}',
      array['unidade_nome','contato_unidade','primeiro_nome','box','contrato_inicio','contrato_fim',
        'valor_mensal_centavos','dia_vencimento','ativo']) then
    raise exception 'Campos inválidos para criação de cliente e painel' using errcode = '42501';
  end if;
  insert into public.clientes
    (id, painel_token, unidade_id, nome, telefone, email, box, contrato_inicio, contrato_fim,
     valor_mensal_centavos, dia_vencimento, status, obs, atualizado_por, atualizado_por_nome)
  select p_id, p_token, c.unidade_id, c.nome, c.telefone, c.email, c.box, c.contrato_inicio, c.contrato_fim,
     c.valor_mensal_centavos, c.dia_vencimento, c.status, c.obs, c.atualizado_por, c.atualizado_por_nome
  from jsonb_populate_record(null::public.clientes, p_cliente) c;

  insert into public.cliente_paineis
    (token, cliente_id, unidade_id, unidade_nome, contato_unidade, primeiro_nome, box, contrato_inicio,
     contrato_fim, valor_mensal_centavos, dia_vencimento, ativo)
  select p_token, p_id, p_cliente ->> 'unidade_id', p.unidade_nome, p.contato_unidade, p.primeiro_nome, p.box,
     p.contrato_inicio, p.contrato_fim, p.valor_mensal_centavos, p.dia_vencimento, p.ativo
  from jsonb_populate_record(null::public.cliente_paineis, p_painel) p;
  return p_id;
end $$;

create function public.salvar_cliente(p_id text, p_token text, p_dados jsonb, p_primeiro_nome text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  c public.clientes;
begin
  if not app.cliente_json_valido(p_dados, '{"nome":"string","telefone":"string","email":"string",
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
    dia_vencimento = c.dia_vencimento, status = c.status where id = p_id;
end $$;

create function public.trocar_link_cliente(p_id text, p_token_atual text, p_token_novo text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  anterior public.cliente_paineis;
begin
  perform 1 from public.clientes where id = p_id and painel_token = p_token_atual for update;
  if not found then
    raise exception 'Cliente indisponível ou link já trocado' using errcode = '42501';
  end if;
  select * into anterior from public.cliente_paineis where token = p_token_atual and cliente_id = p_id for update;
  if not found or p_token_novo is not distinct from p_token_atual then
    raise exception 'A troca exige um painel atual e um token novo' using errcode = '42501';
  end if;

  update public.cliente_paineis set ativo = false, unidade_nome = (app.perfil()).unidade where token = p_token_atual;
  update public.clientes set painel_token = p_token_novo where id = p_id;
  anterior.token := p_token_novo;
  anterior.unidade_nome := (app.perfil()).unidade;
  insert into public.cliente_paineis select (anterior).*;

  insert into public.cliente_painel_cobrancas (painel_token, id, competencia, valor_centavos, vencimento, status, pago_em)
  select p_token_novo, id, competencia, valor_centavos, vencimento, status, pago_em
  from public.cliente_painel_cobrancas where painel_token = p_token_atual;
  insert into public.cliente_painel_visitas (painel_token, id, data, hora, motivo, status)
  select p_token_novo, id, data, hora, motivo, status from public.cliente_painel_visitas where painel_token = p_token_atual;
  insert into public.cliente_painel_recados (painel_token, id, texto, criado_em, autor, gerado_por_ia, ia_modelo)
  select p_token_novo, id, texto, criado_em, autor, gerado_por_ia, ia_modelo
  from public.cliente_painel_recados where painel_token = p_token_atual;
  return p_token_novo;
end $$;

revoke all on function public.criar_cliente(text, text, jsonb, jsonb),
  public.salvar_cliente(text, text, jsonb, text), public.trocar_link_cliente(text, text, text) from public, anon, authenticated;
grant execute on function public.criar_cliente(text, text, jsonb, jsonb),
  public.salvar_cliente(text, text, jsonb, text), public.trocar_link_cliente(text, text, text) to authenticated;

-- A exceção pública recebe um único token. As chaves são explícitas para
-- impedir que colunas privadas ou futuras apareçam no JSON.
create function app.painel_publico(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'unidade_nome', p.unidade_nome, 'contato_unidade', p.contato_unidade,
    'primeiro_nome', p.primeiro_nome, 'box', p.box, 'contrato_inicio', p.contrato_inicio,
    'contrato_fim', p.contrato_fim, 'valor_mensal_centavos', p.valor_mensal_centavos,
    'dia_vencimento', p.dia_vencimento,
    'cobrancas', coalesce((
      select jsonb_agg(jsonb_build_object('competencia', c.competencia, 'valor_centavos', c.valor_centavos,
        'vencimento', c.vencimento, 'status', c.status, 'pago_em', c.pago_em) order by c.id)
      from public.cliente_painel_cobrancas c where c.painel_token = p.token
    ), '[]'::jsonb),
    'visitas', coalesce((
      select jsonb_agg(jsonb_build_object('data', v.data, 'hora', v.hora, 'motivo', v.motivo, 'status', v.status) order by v.id)
      from public.cliente_painel_visitas v where v.painel_token = p.token
    ), '[]'::jsonb),
    'recados', coalesce((
      select jsonb_agg(jsonb_build_object('texto', r.texto, 'criado_em', r.criado_em, 'autor', r.autor,
        'gerado_por_ia', r.gerado_por_ia, 'ia_modelo', r.ia_modelo) order by r.id)
      from public.cliente_painel_recados r where r.painel_token = p.token
    ), '[]'::jsonb)
  )
  from public.cliente_paineis p
  join public.clientes c on c.id = p.cliente_id and c.unidade_id = p.unidade_id and c.painel_token = p.token
  where p_token ~ '^[0-9a-f]{32}$' and p.token = p_token and p.ativo
$$;

create function public.painel_publico(p_token text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select app.painel_publico(p_token)
$$;

-- A fundação concede USAGE em app somente a authenticated. O invólucro
-- invoker precisa de USAGE e EXECUTE para chamar esta função como anon.
-- Gatilhos antigos herdavam EXECUTE de PUBLIC, antes inacessível a anon
-- pela ACL do schema. Remove a herança antes de abrir o schema.
revoke execute on function app.da_api(), app.usuarios_antes_insert(), app.usuarios_antes_update(),
  app.unidades_carimbo(), app.admin_lock_carimbo() from public, anon;
grant usage on schema app to anon;
revoke all on function app.painel_publico(text), public.painel_publico(text) from public, anon, authenticated;
grant execute on function app.painel_publico(text), public.painel_publico(text) to anon, authenticated;
