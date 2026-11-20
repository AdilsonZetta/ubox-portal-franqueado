-- Chamados e histórico de atendimento.
-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

create function app.chamado_anexos_validos(lista jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare anexo jsonb;
begin
  if jsonb_typeof(lista) is distinct from 'array' then return false; end if;
  if jsonb_array_length(lista) > 8 then return false; end if;
  for anexo in select value from jsonb_array_elements(lista) loop
    if jsonb_typeof(anexo) is distinct from 'object' then return false; end if;
    if (anexo - array['nome', 'url']) <> '{}'::jsonb
      or jsonb_typeof(anexo -> 'nome') is distinct from 'string'
      or jsonb_typeof(anexo -> 'url') is distinct from 'string'
      or char_length(anexo ->> 'nome') not between 1 and 80
      or char_length(anexo ->> 'url') not between 9 and 500
      or (anexo ->> 'url') !~ '^https://[^\n]+$' then
      return false;
    end if;
  end loop;
  return true;
end
$$;

create table public.chamados (
  id text primary key default gen_random_uuid()::text,
  titulo text not null check (char_length(titulo) between 2 and 120),
  categoria text not null check (categoria in ('operacao', 'marketing', 'financeiro', 'juridico', 'sistemas', 'implantacao', 'outros')),
  prioridade text not null,
  descricao text not null check (char_length(descricao) between 1 and 4000),
  anexos jsonb not null default '[]' check (app.chamado_anexos_validos(anexos)),
  status text not null default 'aberto' check (status in ('aberto', 'em_andamento', 'aguardando_franqueado', 'resolvido', 'fechado')),
  unidade_id text not null check (char_length(unidade_id) between 1 and 80),
  unidade_nome text not null,
  aberto_por uuid not null references public.usuarios(id),
  aberto_por_nome text not null check (char_length(aberto_por_nome) between 2 and 120),
  responsavel_id uuid references public.usuarios(id),
  responsavel_nome text,
  avaliacao integer check (avaliacao between 1 and 5),
  sla_horas integer not null check (sla_horas = case prioridade
    when 'urgente' then 4 when 'alta' then 24 when 'media' then 48 when 'baixa' then 72 else -1 end
    and prioridade in ('urgente', 'alta', 'media', 'baixa')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  fechado_em timestamptz,
  reaberto_em timestamptz,
  evento_transicao jsonb check (evento_transicao is null),
  check ((responsavel_id is null and responsavel_nome is null)
    or (responsavel_id is not null and responsavel_nome is not null and char_length(responsavel_nome) between 2 and 120))
);

create table public.chamado_eventos (
  id text primary key default gen_random_uuid()::text,
  chamado_id text not null references public.chamados(id) on delete cascade,
  tipo text not null check (tipo in ('comentario', 'status', 'responsavel', 'abertura')),
  texto text not null check (char_length(texto) between 1 and 2000),
  de text not null default '' check (char_length(de) <= 120),
  para text not null default '' check (char_length(para) <= 120),
  autor_id uuid not null references public.usuarios(id),
  autor_nome text not null check (char_length(autor_nome) between 2 and 120),
  criado_em timestamptz not null default now()
);

create index chamados_unidade_criado_idx on public.chamados (unidade_id, criado_em desc);
create index chamados_criado_idx on public.chamados (criado_em desc);
create index chamados_aberto_por_idx on public.chamados (aberto_por);
create index chamados_responsavel_idx on public.chamados (responsavel_id);
create index chamado_eventos_chamado_criado_idx on public.chamado_eventos (chamado_id, criado_em);
create index chamado_eventos_autor_idx on public.chamado_eventos (autor_id);

alter table public.chamados enable row level security;
alter table public.chamado_eventos enable row level security;
revoke all on public.chamados, public.chamado_eventos from public, anon, authenticated;
grant select, insert, update on public.chamados to authenticated;
grant select, insert on public.chamado_eventos to authenticated;

create function app.chamado_modulo() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(app.conta_ativa(u) and app.unidade_ativa(u) and app.tem_modulo(u, 'chamados'), false)
  from app.perfil() u
$$;

create function app.chamado_opera_rede() returns boolean
language sql stable set search_path = '' as $$
  select app.eh_admin() or coalesce((app.perfil()).papel = 'equipe_franqueadora' and app.chamado_modulo(), false)
$$;

create function app.chamado_mesma_unidade(unidade text) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((app.perfil()).papel in ('franqueado', 'equipe_franqueado')
    and unidade = nullif(app.minha_unidade_id(), '') and app.chamado_modulo(), false)
$$;

create function app.chamado_pode_encerrar(unidade text, autor uuid) returns boolean
language sql stable set search_path = '' as $$
  select app.chamado_mesma_unidade(unidade) and ((app.perfil()).papel = 'franqueado' or auth.uid() = autor)
$$;

create function app.chamado_pode_ler(unidade text) returns boolean
language sql stable set search_path = '' as $$
  select app.chamado_opera_rede() or app.chamado_mesma_unidade(unidade)
$$;

revoke all on function app.chamado_anexos_validos(jsonb), app.chamado_modulo(), app.chamado_opera_rede(),
  app.chamado_mesma_unidade(text), app.chamado_pode_encerrar(text, uuid), app.chamado_pode_ler(text)
  from public, anon, authenticated;
grant execute on function app.chamado_anexos_validos(jsonb), app.chamado_modulo(), app.chamado_opera_rede(),
  app.chamado_mesma_unidade(text), app.chamado_pode_encerrar(text, uuid), app.chamado_pode_ler(text)
  to authenticated;
grant execute on function app.chamado_anexos_validos(jsonb) to service_role;

create policy chamados_ler on public.chamados for select to authenticated
  using (app.chamado_pode_ler(unidade_id) or (select app.gere_acompanhamento()));
create policy chamados_criar on public.chamados for insert to authenticated with check (
  status = 'aberto' and aberto_por = (select auth.uid())
  and app.chamado_pode_encerrar(unidade_id, aberto_por)
  and exists (select 1 from public.unidades u where u.id = unidade_id and u.nome = unidade_nome)
  and responsavel_id is null and responsavel_nome is null and avaliacao is null
  and resolvido_em is null and fechado_em is null and reaberto_em is null
);
-- O gatilho decide quais alterações cada perfil pode fazer, inclusive quando é apenas leitor.
create policy chamados_editar on public.chamados for update to authenticated
  using (app.chamado_pode_ler(unidade_id) or (select app.gere_acompanhamento()))
  with check (app.chamado_pode_ler(unidade_id) or (select app.gere_acompanhamento()));

create policy chamado_eventos_ler on public.chamado_eventos for select to authenticated using (
  exists (select 1 from public.chamados c where c.id = chamado_id and app.chamado_pode_ler(c.unidade_id))
);
create policy chamado_eventos_criar on public.chamado_eventos for insert to authenticated with check (
  autor_id = (select auth.uid()) and autor_nome = (select (app.perfil()).nome)
  and exists (select 1 from public.chamados c where c.id = chamado_id and app.chamado_pode_ler(c.unidade_id))
  and (tipo = 'comentario' or (tipo in ('status', 'responsavel') and pg_trigger_depth() = 1))
);

create function app.chamado_evento_carimbar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if app.da_api() then new.criado_em := now(); end if;
  return new;
end
$$;

create function app.chamado_carimbar() returns trigger
language plpgsql set search_path = '' as $$
declare
  rede boolean;
  encerra boolean;
  manteve_responsavel boolean;
  pode_mudar_responsavel boolean;
  evento jsonb;
begin
  if not app.da_api() then return new; end if;
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    new.criado_em := now();
    return new;
  end if;

  rede := app.chamado_opera_rede();
  encerra := app.chamado_pode_encerrar(old.unidade_id, old.aberto_por);
  manteve_responsavel := (new.responsavel_id, new.responsavel_nome) is not distinct from
    (old.responsavel_id, old.responsavel_nome);
  pode_mudar_responsavel := manteve_responsavel
    or (new.responsavel_id is null and new.responsavel_nome is null)
    or (new.responsavel_id is not null and coalesce(char_length(new.responsavel_nome) between 2 and 120, false));

  if (to_jsonb(new) - array['status', 'avaliacao', 'fechado_em', 'resolvido_em', 'reaberto_em',
        'responsavel_id', 'responsavel_nome', 'atualizado_em', 'evento_transicao'])
    is distinct from (to_jsonb(old) - array['status', 'avaliacao', 'fechado_em', 'resolvido_em', 'reaberto_em',
        'responsavel_id', 'responsavel_nome', 'atualizado_em', 'evento_transicao']) then
    raise exception 'Os dados de abertura do chamado são imutáveis.' using errcode = '42501';
  end if;

  if (encerra or old.aberto_por = auth.uid()) and old.status = 'resolvido' and new.status = 'fechado'
    and new.avaliacao between 1 and 5 and manteve_responsavel
    and (new.resolvido_em, new.reaberto_em) is not distinct from (old.resolvido_em, old.reaberto_em) then
    new.fechado_em := now();
  elsif ((encerra or old.aberto_por = auth.uid()) and old.status in ('resolvido', 'fechado')
      and new.status = 'aberto' and manteve_responsavel
      or (rede and old.status = 'fechado' and new.status in ('aberto', 'em_andamento', 'aguardando_franqueado', 'resolvido')
        and pode_mudar_responsavel))
    and new.avaliacao is null and new.fechado_em is null and new.resolvido_em is null then
    new.reaberto_em := now();
  elsif rede and old.status <> 'fechado'
    and (new.status = old.status or new.status in ('aberto', 'em_andamento', 'aguardando_franqueado', 'resolvido'))
    and (new.avaliacao, new.fechado_em, new.reaberto_em) is not distinct from
      (old.avaliacao, old.fechado_em, old.reaberto_em)
    and pode_mudar_responsavel
    and (new.resolvido_em is not distinct from old.resolvido_em
      or (new.status = 'resolvido' and old.status <> 'resolvido' and new.resolvido_em is not null)) then
    if new.resolvido_em is distinct from old.resolvido_em then new.resolvido_em := now(); end if;
  else
    raise exception 'Alteração de chamado não permitida.' using errcode = '42501';
  end if;

  -- Equivalente ao getAfter: o evento é inserido pelo gatilho após validar OLD e NEW.
  -- O comando é descartado antes de gravar a linha. O RLS só aceita evento de transição
  -- nessa inserção aninhada (o gatilho BEFORE INSERT do evento já retornou ao avaliar o RLS).
  -- UPDATE sem evento continua permitido, como nas regras do Firestore.
  evento := new.evento_transicao;
  new.evento_transicao := null;
  if evento is not null then
    if jsonb_typeof(evento) is distinct from 'object' then
      raise exception 'Evento de transição inválido.' using errcode = '42501';
    end if;
    if (evento - array['id', 'tipo', 'texto', 'de', 'para', 'autor_nome']) <> '{}'::jsonb
      or exists (select 1 from jsonb_each(evento) e where jsonb_typeof(e.value) <> 'string')
      or not coalesce(
      (evento ->> 'tipo' = 'status' and new.status <> old.status and evento ->> 'para' = new.status and (rede or encerra))
      or (evento ->> 'tipo' = 'responsavel' and rede and new.responsavel_id is distinct from old.responsavel_id
        and evento ->> 'para' = new.responsavel_nome), false) then
      raise exception 'O evento precisa corresponder à alteração do chamado.' using errcode = '42501';
    end if;
    insert into public.chamado_eventos (id, chamado_id, tipo, texto, de, para, autor_id, autor_nome)
    values (coalesce(evento ->> 'id', gen_random_uuid()::text), old.id, evento ->> 'tipo', evento ->> 'texto',
      evento ->> 'de', evento ->> 'para', auth.uid(), evento ->> 'autor_nome');
  end if;
  return new;
end
$$;

revoke all on function app.chamado_evento_carimbar(), app.chamado_carimbar() from public, anon, authenticated;
create trigger chamado_evento_carimbo before insert on public.chamado_eventos
  for each row execute function app.chamado_evento_carimbar();
create trigger chamado_carimbo before insert or update on public.chamados
  for each row execute function app.chamado_carimbar();

-- As rules permitem fechar/reabrir por autoria mesmo após perder a leitura.
-- O UPDATE com filtro do Postgres também passa pelo SELECT do RLS. Para esse
-- caso, a função aplica somente as duas mudanças permitidas e retorna sem dados.
create function app.chamado_alterar_como_autor(chave text, destino text, nota integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if destino = 'fechado' and nota between 1 and 5 then
    update public.chamados
      set status = 'fechado', avaliacao = nota, fechado_em = now(), atualizado_em = now()
      where id = chave and aberto_por = (select auth.uid()) and status = 'resolvido';
  elsif destino = 'aberto' then
    update public.chamados
      set status = 'aberto', avaliacao = null, fechado_em = null, resolvido_em = null,
        reaberto_em = now(), atualizado_em = now()
      where id = chave and aberto_por = (select auth.uid()) and status in ('fechado', 'resolvido');
  else
    raise exception 'Alteração de chamado não permitida.' using errcode = '42501';
  end if;
  if not found then
    raise exception 'Alteração de chamado não permitida.' using errcode = '42501';
  end if;
end
$$;

revoke all on function app.chamado_alterar_como_autor(text, text, integer) from public, anon, authenticated;
grant execute on function app.chamado_alterar_como_autor(text, text, integer) to authenticated;

create function public.mudar_status_chamado(
  chamado text, status_novo text, evento jsonb, nota integer default null, responsavel uuid default null, nome_responsavel text default null
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  anterior public.chamados;
  reabre boolean;
  atribui boolean := coalesce(evento ->> 'tipo' = 'responsavel', false);
begin
  select c.* into anterior from public.chamados c where c.id = chamado for update;
  if not found then
    if evento is null and responsavel is null and nome_responsavel is null then
      perform app.chamado_alterar_como_autor(chamado, status_novo, nota);
      return;
    end if;
    raise exception 'Alteração de chamado não permitida.' using errcode = '42501';
  end if;
  reabre := not atribui and ((anterior.status = 'fechado' and status_novo <> 'fechado')
    or (anterior.status = 'resolvido' and status_novo = 'aberto'));
  update public.chamados set
    status = status_novo,
    avaliacao = case when reabre then null when status_novo = 'fechado' and not atribui then nota else anterior.avaliacao end,
    fechado_em = case when reabre then null else anterior.fechado_em end,
    resolvido_em = case when reabre then null
      when status_novo = 'resolvido' and anterior.status <> 'resolvido' then now() else anterior.resolvido_em end,
    responsavel_id = case when atribui then responsavel else anterior.responsavel_id end,
    responsavel_nome = case when atribui then nome_responsavel else anterior.responsavel_nome end,
    evento_transicao = evento
  where id = chamado;
end
$$;

revoke all on function public.mudar_status_chamado(text, text, jsonb, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.mudar_status_chamado(text, text, jsonb, integer, uuid, text) to authenticated;
