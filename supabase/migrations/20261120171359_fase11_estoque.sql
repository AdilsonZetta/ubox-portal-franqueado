-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

create function app.gere_estoque() returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and (u.papel = 'admin'
    or (u.papel = 'equipe_franqueadora' and app.tem_modulo(u, 'estoque')))
  from app.perfil() u
$$;

create function app.unidade_estoque() returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and u.papel in ('franqueado', 'equipe_franqueado')
    and app.tem_modulo(u, 'estoque') and app.unidade_ativa(u)
  from app.perfil() u
$$;

create table public.estoque_itens (
  id text primary key default gen_random_uuid()::text,
  nome text not null check (char_length(nome) between 2 and 120),
  codigo text not null default '' check (char_length(codigo) <= 40),
  categoria text not null check (categoria in ('insumos','cadeados','caixas','embalagens','limpeza','uniformes','outro')),
  unidade_medida text not null check (unidade_medida in ('un','cx','pct','par','kg','l','m','rolo')),
  estoque_minimo numeric not null check (estoque_minimo between 0 and 100000 and estoque_minimo = trunc(estoque_minimo)),
  preco_sugerido_centavos numeric not null check (preco_sugerido_centavos between 0 and 10000000 and preco_sugerido_centavos = trunc(preco_sugerido_centavos)),
  descricao text not null default '' check (char_length(descricao) <= 500),
  ativo boolean not null default true,
  gerado_por_ia boolean not null default false,
  ia_modelo text not null default '' check (char_length(ia_modelo) <= 80 and
    (not gerado_por_ia or (char_length(ia_modelo) >= 2 and ia_modelo ~ '[^[:space:]]'))),
  criado_em timestamptz not null default now(),
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null default now()
);

-- O histórico conserva o identificador mesmo se a unidade for excluída.
create table public.estoque_movimentos (
  id text primary key default gen_random_uuid()::text,
  unidade_id text not null,
  unidade_nome text not null,
  item_id text not null check (char_length(item_id) between 1 and 64),
  item_nome text not null check (char_length(item_nome) between 2 and 120),
  unidade_medida text not null check (char_length(unidade_medida) <= 10),
  tipo text not null,
  quantidade numeric not null check (quantidade between 1 and 100000 and quantidade = trunc(quantidade)),
  delta numeric not null,
  motivo text not null default '' check (char_length(motivo) <= 300 and (tipo in ('entrada','venda') or char_length(motivo) >= 2)),
  origem text not null default 'manual',
  origem_id text not null default '' check (char_length(origem_id) <= 64),
  indice integer not null default 0 check (indice between 0 and 59),
  uid uuid not null references public.usuarios(id),
  nome text not null,
  criado_em timestamptz not null default now(),
  check (
    (origem = 'manual' and origem_id = '' and indice = 0 and tipo in ('entrada','saida','venda'))
    or (origem in ('contagem','pedido') and id = origem_id || '_' || indice::text
      and tipo = case origem when 'contagem' then 'ajuste' else 'entrada' end)
  ),
  check ((tipo = 'entrada' and delta = quantidade)
    or (tipo in ('saida','venda') and delta = -quantidade)
    or (tipo = 'ajuste' and abs(delta) = quantidade))
);

create table public.estoque_contagens (
  id text primary key default gen_random_uuid()::text,
  unidade_id text not null,
  unidade_nome text not null,
  itens jsonb not null check (jsonb_typeof(itens) = 'array'),
  total_itens integer not null check (total_itens between 1 and 60 and total_itens = jsonb_array_length(itens)),
  total_divergencias integer not null check (total_divergencias between 0 and total_itens),
  obs text not null default '' check (char_length(obs) <= 1000),
  status text not null default 'aberta' check (status in ('aberta','confirmada','cancelada')),
  criado_por uuid not null references public.usuarios(id),
  criado_por_nome text not null,
  criado_em timestamptz not null default now(),
  confirmado_por uuid references public.usuarios(id),
  confirmado_nome text not null default '',
  confirmado_em timestamptz,
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null default now()
);

create table public.estoque_pedidos (
  id text primary key default gen_random_uuid()::text,
  unidade_id text not null,
  unidade_nome text not null,
  itens jsonb not null check (jsonb_typeof(itens) = 'array'),
  total_itens integer not null check (total_itens between 1 and 40 and total_itens = jsonb_array_length(itens)),
  status text not null default 'aberto' check (status in ('aberto','aprovado','enviado','recebido','cancelado')),
  obs_unidade text not null default '' check (char_length(obs_unidade) <= 1000),
  obs_franqueadora text not null default '' check (char_length(obs_franqueadora) <= 1000),
  solicitante_uid uuid not null references public.usuarios(id),
  solicitante_nome text not null,
  criado_em timestamptz not null default now(),
  aprovado_em timestamptz,
  enviado_em timestamptz,
  recebido_em timestamptz,
  cancelado_em timestamptz,
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null default now()
);

-- Projeção dos deltas por unidade. A carga histórica deve somar seus movimentos
-- por unidade/item para inicializar esta tabela antes de liberar a API.
create table public.estoque_saldos (
  unidade_id text not null,
  item_id text not null check (char_length(item_id) between 1 and 64),
  saldo numeric not null check (saldo >= 0 and saldo < 'Infinity'::numeric and saldo = trunc(saldo)),
  primary key (unidade_id, item_id)
);

create index estoque_movimentos_unidade_idx on public.estoque_movimentos (unidade_id, id);
create index estoque_movimentos_pedido_idx on public.estoque_movimentos (origem_id) where origem = 'pedido';
create index estoque_contagens_unidade_idx on public.estoque_contagens (unidade_id, id);
create index estoque_pedidos_unidade_idx on public.estoque_pedidos (unidade_id, id);

revoke all on function app.gere_estoque(), app.unidade_estoque() from public, anon, authenticated;
grant execute on function app.gere_estoque(), app.unidade_estoque() to authenticated;

do $$
declare tabela text;
begin
  foreach tabela in array array['estoque_itens','estoque_movimentos','estoque_contagens','estoque_pedidos','estoque_saldos'] loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('revoke all on public.%I from public, anon, authenticated', tabela);
    execute format('grant select, insert on public.%I to authenticated', tabela);
    if tabela <> 'estoque_movimentos' then
      execute format('grant update on public.%I to authenticated', tabela);
    end if;
    if tabela <> 'estoque_itens' then
      execute format('create policy estoque_leitura on public.%I for select to authenticated using
        ((select app.gere_estoque()) or ((select app.unidade_estoque()) and unidade_id = (select app.minha_unidade_id())))', tabela);
      execute format('create policy estoque_insercao on public.%I for insert to authenticated with check
        ((select app.unidade_estoque()) and unidade_id = (select app.minha_unidade_id()) %s)', tabela,
        case tabela when 'estoque_pedidos' then 'and (select (app.perfil()).papel) = ''franqueado'''
          when 'estoque_saldos' then 'and pg_trigger_depth() > 0' else '' end);
    end if;
  end loop;
end
$$;

create policy estoque_leitura on public.estoque_itens for select to authenticated
  using ((select app.gere_estoque()) or (select app.unidade_estoque()));
create policy estoque_insercao on public.estoque_itens for insert to authenticated with check ((select app.gere_estoque()));
create policy estoque_edicao on public.estoque_itens for update to authenticated using ((select app.gere_estoque()));
create policy estoque_edicao on public.estoque_contagens for update to authenticated
  using ((select app.unidade_estoque()) and unidade_id = (select app.minha_unidade_id()));
create policy estoque_edicao on public.estoque_pedidos for update to authenticated
  using ((select app.gere_estoque()) or ((select app.unidade_estoque())
    and (select (app.perfil()).papel) = 'franqueado' and unidade_id = (select app.minha_unidade_id())));
create policy estoque_edicao on public.estoque_saldos for update to authenticated
  using ((select app.unidade_estoque()) and unidade_id = (select app.minha_unidade_id()) and pg_trigger_depth() > 0);

-- A unidade pode travar o item, embora não possa editar o catálogo.
create function app.trava_item_estoque(p_item text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(app.unidade_estoque(), false) then return false; end if;
  perform 1 from public.estoque_itens where id = p_item for update;
  return found;
end
$$;
revoke all on function app.trava_item_estoque(text) from public, anon, authenticated;
grant execute on function app.trava_item_estoque(text) to authenticated;

create function app.estoque_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
declare
  u public.usuarios := app.perfil();
  permitidos text[] := array['atualizado_por','atualizado_por_nome','atualizado_em'];
begin
  if not app.da_api() then return new; end if;
  new.atualizado_por := auth.uid();
  new.atualizado_por_nome := u.nome;
  new.atualizado_em := now();

  if tg_op = 'INSERT' then
    new.criado_em := now();
    if tg_table_name <> 'estoque_itens' then
      if new.unidade_id is distinct from u.unidade_id or new.unidade_nome is distinct from u.unidade then
        raise exception 'Unidade inválida para estoque' using errcode = '42501';
      end if;
      if tg_table_name = 'estoque_contagens' then
        if new.status <> 'aberta' or new.confirmado_por is not null or new.confirmado_em is not null or new.confirmado_nome <> '' then
          raise exception 'A contagem deve começar aberta' using errcode = '42501';
        end if;
        new.criado_por := auth.uid();
        new.criado_por_nome := u.nome;
      else
        if new.status <> 'aberto' or new.obs_franqueadora <> '' or new.aprovado_em is not null
          or new.enviado_em is not null or new.recebido_em is not null or new.cancelado_em is not null then
          raise exception 'O pedido deve começar aberto' using errcode = '42501';
        end if;
        new.solicitante_uid := auth.uid();
        new.solicitante_nome := u.nome;
      end if;
    end if;
    return new;
  end if;

  if tg_table_name = 'estoque_itens' then
    permitidos := permitidos || array['nome','codigo','categoria','unidade_medida','estoque_minimo',
      'preco_sugerido_centavos','descricao','ativo','gerado_por_ia','ia_modelo'];
  elsif tg_table_name = 'estoque_contagens' and old.status = 'aberta' then
    permitidos := permitidos || array['itens','total_itens','total_divergencias','obs'];
    if u.papel = 'franqueado' and new.status in ('confirmada','cancelada') then
      permitidos := permitidos || array['status','confirmado_por','confirmado_nome','confirmado_em'];
      if new.status = 'confirmada' then
        new.confirmado_por := auth.uid();
        new.confirmado_nome := u.nome;
        new.confirmado_em := now();
      else
        new.confirmado_por := null;
        new.confirmado_em := null;
      end if;
    end if;
  elsif tg_table_name = 'estoque_pedidos' then
    if app.gere_estoque() then
      if old.status = 'aberto' and new.status = 'aprovado' then
        permitidos := permitidos || array['status','aprovado_em','obs_franqueadora'];
        new.aprovado_em := now();
      elsif old.status = 'aprovado' and new.status = 'enviado' then
        permitidos := permitidos || array['status','enviado_em','itens','obs_franqueadora'];
        new.enviado_em := now();
      elsif old.status in ('aberto','aprovado') and new.status = 'cancelado'
        and char_length(new.obs_franqueadora) >= 2 then
        permitidos := permitidos || array['status','cancelado_em','obs_franqueadora'];
        new.cancelado_em := now();
      else
        raise exception 'Transição de pedido inválida para a franqueadora' using errcode = '42501';
      end if;
    elsif old.status = 'aberto' and new.status = 'aberto' then
      permitidos := permitidos || array['itens','total_itens','obs_unidade'];
    elsif old.status = 'aberto' and new.status = 'cancelado' then
      permitidos := permitidos || array['status','cancelado_em','obs_unidade'];
      new.cancelado_em := now();
    elsif old.status = 'enviado' and new.status = 'recebido' then
      permitidos := permitidos || array['status','recebido_em','obs_unidade'];
      new.recebido_em := now();
    else
      raise exception 'Transição de pedido inválida para a unidade' using errcode = '42501';
    end if;
  else
    raise exception 'Contagem encerrada' using errcode = '42501';
  end if;

  if (to_jsonb(new) - permitidos) is distinct from (to_jsonb(old) - permitidos) then
    raise exception 'Alteração de campos protegidos do estoque' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger estoque_antes_gravar before insert or update on public.estoque_itens
  for each row execute function app.estoque_antes_gravar();
create trigger estoque_antes_gravar before insert or update on public.estoque_contagens
  for each row execute function app.estoque_antes_gravar();
create trigger estoque_antes_gravar before insert or update on public.estoque_pedidos
  for each row execute function app.estoque_antes_gravar();

create function app.estoque_antes_movimento() returns trigger
language plpgsql set search_path = '' as $$
declare
  u public.usuarios := app.perfil();
  item public.estoque_itens;
begin
  if not app.da_api() then return new; end if;

  if not coalesce(app.unidade_estoque(), false)
    or (new.unidade_id is not null and new.unidade_id is distinct from u.unidade_id)
    or (new.unidade_nome is not null and new.unidade_nome is distinct from u.unidade)
    or (new.uid is not null and new.uid is distinct from auth.uid())
    or (new.nome is not null and new.nome is distinct from u.nome)
    or new.criado_em is distinct from now() then
    raise exception 'Autoria, data ou unidade inválida para movimento' using errcode = '42501';
  end if;

  if new.origem = 'manual' then
    if not app.trava_item_estoque(new.item_id) then
      raise exception 'Item de estoque inexistente' using errcode = '42501';
    end if;
    select * into item from public.estoque_itens where id = new.item_id;
    if new.item_nome is distinct from item.nome or (new.tipo = 'entrada' and not item.ativo) then
      raise exception 'Movimento incompatível com o catálogo' using errcode = '42501';
    end if;
  elsif pg_trigger_depth() <> 2 or u.papel <> 'franqueado' then
    -- Só o gatilho de transição gera entradas de pedido e ajustes de contagem.
    raise exception 'Movimento vinculado exige a transição do documento' using errcode = '42501';
  else
    perform app.trava_item_estoque(new.item_id);
  end if;

  new.unidade_id := u.unidade_id;
  new.unidade_nome := u.unidade;
  new.uid := auth.uid();
  new.nome := u.nome;
  new.criado_em := now();
  return new;
end
$$;

create function app.estoque_aplica_delta() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.da_api() then return null; end if;

  -- A linha inicial é zero. O UPDATE serializa os deltas mesmo sem item
  -- no catálogo (as regras aceitam esse caso para contagem e pedido).
  insert into public.estoque_saldos (unidade_id, item_id, saldo)
    values (new.unidade_id, new.item_id, 0) on conflict do nothing;
  update public.estoque_saldos set saldo = saldo + new.delta
    where unidade_id = new.unidade_id and item_id = new.item_id;
  if not found then
    raise exception 'Saldo indisponível para movimento' using errcode = '42501';
  end if;
  return null;
end
$$;

create function app.estoque_protege_saldo() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- A API pode gravar saldo somente a partir do gatilho do movimento.
  -- Assim uma inserção direta de movimento também aplica o delta ou falha inteira.
  if app.da_api() and pg_trigger_depth() < 2 then
    raise exception 'Saldo só muda junto com movimento' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger estoque_antes_movimento before insert on public.estoque_movimentos
  for each row execute function app.estoque_antes_movimento();
create trigger estoque_aplica_delta after insert on public.estoque_movimentos
  for each row execute function app.estoque_aplica_delta();
create trigger estoque_protege_saldo before insert or update on public.estoque_saldos
  for each row execute function app.estoque_protege_saldo();

create function app.estoque_gera_movimentos() returns trigger
language plpgsql set search_path = '' as $$
declare
  linha jsonb;
  i integer;
  origem_mov text;
  sistema numeric;
  contado numeric;
  delta_mov numeric;
begin
  if not app.da_api() or old.status = new.status then return null; end if;

  if tg_table_name = 'estoque_contagens' and new.status = 'confirmada' then
    origem_mov := 'contagem';
  elsif tg_table_name = 'estoque_pedidos' and new.status = 'recebido' then
    origem_mov := 'pedido';
  else
    return null;
  end if;

  -- Travas em ordem de item para que lotes concorrentes usem a mesma ordem.
  for linha, i in
    select l, (n - 1)::integer from jsonb_array_elements(new.itens) with ordinality as t(l, n)
    order by l->>'itemId', n
  loop
    if origem_mov = 'contagem' then
      if jsonb_typeof(linha->'sistema') is distinct from 'number'
        or jsonb_typeof(linha->'contado') is distinct from 'number'
        or jsonb_typeof(linha->'diferenca') is distinct from 'number' then
        raise exception 'Valores inválidos na linha da contagem' using errcode = '42501';
      end if;
      sistema := (linha->>'sistema')::numeric;
      contado := (linha->>'contado')::numeric;
      delta_mov := (linha->>'diferenca')::numeric;
      if sistema not between 0 and 100000 or contado not between 0 and 100000
        or sistema <> trunc(sistema) or contado <> trunc(contado) or delta_mov <> contado - sistema then
        raise exception 'Diferença incompatível com a linha da contagem' using errcode = '42501';
      end if;
    else
      if jsonb_typeof(linha->'quantidadeEnviada') is distinct from 'number' then
        raise exception 'Quantidade enviada inválida' using errcode = '42501';
      end if;
      delta_mov := (linha->>'quantidadeEnviada')::numeric;
      if delta_mov not between 0 and 100000 or delta_mov <> trunc(delta_mov) then
        raise exception 'Quantidade enviada inválida' using errcode = '42501';
      end if;
    end if;

    if delta_mov = 0 then continue; end if;
    if jsonb_typeof(linha->'itemId') is distinct from 'string'
      or jsonb_typeof(linha->'itemNome') is distinct from 'string'
      or jsonb_typeof(linha->'unidadeMedida') is distinct from 'string' then
      raise exception 'Item inválido na linha de estoque' using errcode = '42501';
    end if;
    insert into public.estoque_movimentos
      (id, item_id, item_nome, unidade_medida, tipo, quantidade, delta, motivo, origem, origem_id, indice)
    values (new.id || '_' || i, linha->>'itemId', linha->>'itemNome', linha->>'unidadeMedida',
      case origem_mov when 'contagem' then 'ajuste' else 'entrada' end,
      abs(delta_mov), delta_mov,
      case origem_mov when 'contagem' then format('Contagem: sistema %s, contado %s', sistema, contado)
        else 'Recebimento do pedido de reposição' end,
      origem_mov, new.id, i);
  end loop;
  return null;
end
$$;

create trigger estoque_gera_movimentos after update on public.estoque_contagens
  for each row execute function app.estoque_gera_movimentos();
create trigger estoque_gera_movimentos after update on public.estoque_pedidos
  for each row execute function app.estoque_gera_movimentos();

create function public.registrar_movimento_estoque(p_item_id text, p_item_nome text, p_unidade_medida text,
  p_tipo text, p_quantidade numeric, p_motivo text) returns void
language sql security invoker set search_path = '' as $$
  insert into public.estoque_movimentos (item_id, item_nome, unidade_medida, tipo, quantidade, delta, motivo)
  values (p_item_id, p_item_nome, p_unidade_medida, p_tipo, p_quantidade,
    case when p_tipo = 'entrada' then p_quantidade else -p_quantidade end, p_motivo)
$$;

create function public.confirmar_contagem_estoque(p_id text, p_itens jsonb, p_obs text) returns integer
language plpgsql security invoker set search_path = '' as $$
declare ajustes integer;
begin
  select count(*)::integer into ajustes from jsonb_array_elements(p_itens) l where l->'diferenca' <> '0'::jsonb;
  update public.estoque_contagens set status = 'confirmada', itens = p_itens, obs = p_obs,
    total_itens = jsonb_array_length(p_itens), total_divergencias = ajustes where id = p_id;
  if not found then
    raise exception 'Contagem não disponível' using errcode = '42501';
  end if;
  return ajustes;
end
$$;

create function public.receber_pedido_estoque(p_id text, p_obs text) returns integer
language plpgsql security invoker set search_path = '' as $$
declare entradas integer;
begin
  update public.estoque_pedidos set status = 'recebido', obs_unidade = p_obs where id = p_id;
  if not found then
    raise exception 'Pedido não disponível' using errcode = '42501';
  end if;
  select count(*)::integer into entradas from public.estoque_movimentos where origem = 'pedido' and origem_id = p_id;
  return entradas;
end
$$;

revoke all on function public.registrar_movimento_estoque(text,text,text,text,numeric,text),
  public.confirmar_contagem_estoque(text,jsonb,text), public.receber_pedido_estoque(text,text) from public, anon, authenticated;
grant execute on function public.registrar_movimento_estoque(text,text,text,text,numeric,text),
  public.confirmar_contagem_estoque(text,jsonb,text), public.receber_pedido_estoque(text,text) to authenticated;

revoke all on function app.estoque_antes_gravar(), app.estoque_antes_movimento(), app.estoque_aplica_delta(),
  app.estoque_protege_saldo(), app.estoque_gera_movimentos() from public, anon, authenticated;
