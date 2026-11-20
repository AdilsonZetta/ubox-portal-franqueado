-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
-- Fase 6: cofre de senhas, histórico e solicitações.

create function app.acesso_visibilidade_valida(lista jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(lista) = 'array' then
    jsonb_array_length(lista) <= 20 and not exists (
      select 1 from jsonb_array_elements(lista) item
      where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') not between 1 and 128
    )
  else false end
$$;

create table public.acessos (
  id text primary key default gen_random_uuid()::text,
  nome text not null check (char_length(nome) between 2 and 120),
  categoria text not null check (categoria in ('gestao', 'email', 'redes_sociais', 'portaria', 'cameras', 'outros')),
  url text not null default '' check (url = '' or (char_length(url) <= 500 and url ~ '^https://.+$' and url !~ E'[\r\n]')),
  escopo text not null check (escopo in ('unidade', 'rede')),
  unidade_id text not null default '' check (char_length(unidade_id) <= 80),
  unidade_nome text not null default '' check (char_length(unidade_nome) <= 120),
  responsavel_id uuid references public.usuarios(id),
  responsavel_nome text not null check (char_length(responsavel_nome) between 1 and 120),
  visivel_para jsonb not null default '[]' check (app.acesso_visibilidade_valida(visivel_para)),
  visivel_para_equipe boolean not null default false,
  ultima_troca_em timestamptz not null default now(),
  pendente_troca boolean not null default false,
  criado_por uuid not null references public.usuarios(id),
  criado_por_nome text not null check (char_length(criado_por_nome) between 2 and 120),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  troca_id uuid,
  troca_transacao xid8,
  troca_exigida uuid,
  check (escopo <> 'rede' or (unidade_id = '' and unidade_nome = '' and visivel_para = '[]' and not visivel_para_equipe))
);

create table public.acesso_segredos (
  acesso_id text primary key references public.acessos(id) on delete cascade,
  login text not null,
  senha text not null,
  notas text not null default '',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid not null references public.usuarios(id),
  troca_id uuid,
  unique (acesso_id, troca_id)
);

alter table public.acessos add constraint acesso_rotacao_com_segredo
  foreign key (id, troca_exigida) references public.acesso_segredos (acesso_id, troca_id)
  deferrable initially deferred;

create table public.acesso_eventos (
  id text primary key default gen_random_uuid()::text,
  acesso_id text not null references public.acessos(id) on delete cascade,
  tipo text not null check (tipo in ('criacao', 'atualizacao', 'revelou', 'copiou', 'permissao', 'troca_senha')),
  texto text not null,
  autor_id uuid not null references public.usuarios(id),
  autor_nome text not null check (char_length(autor_nome) between 2 and 120),
  criado_em timestamptz not null default now()
);

create table public.solicitacoes_acesso (
  id text primary key default gen_random_uuid()::text,
  tipo text not null check (tipo in ('pedir_acesso', 'novo_sistema', 'revogar', 'trocar_senha')),
  status text not null default 'aberta' check (status in ('aberta', 'aprovada', 'recusada', 'concluida')),
  acesso_id text not null default '' check (char_length(acesso_id) <= 80),
  acesso_nome text not null default '' check (char_length(acesso_nome) <= 120),
  unidade_id text not null check (char_length(unidade_id) between 1 and 80),
  unidade_nome text not null check (char_length(unidade_nome) <= 120),
  solicitado_por uuid not null references public.usuarios(id),
  solicitado_por_nome text not null check (char_length(solicitado_por_nome) between 2 and 120),
  motivo text not null default '' check (char_length(motivo) <= 2000),
  alvo_uid uuid references public.usuarios(id),
  alvo_nome text not null default '' check (char_length(alvo_nome) <= 120),
  decidido_por uuid references public.usuarios(id),
  decidido_por_nome text check (char_length(decidido_por_nome) between 2 and 120),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index acessos_unidade_idx on public.acessos (unidade_id);
create index acesso_eventos_data_idx on public.acesso_eventos (acesso_id, criado_em, id);
create index solicitacoes_acesso_unidade_data_idx on public.solicitacoes_acesso (unidade_id, criado_em desc, id);

-- Predicados das rules. Nenhum deles consulta a tabela de segredos.
create function app.senhas_mesma_unidade(u public.usuarios, unidade text) returns boolean
language sql stable set search_path = '' as $$
  select app.unidade_ativa(u) and u.unidade_id <> '' and u.unidade_id = unidade
$$;

create function app.senhas_gerencia_rede(u public.usuarios) returns boolean
language sql stable set search_path = '' as $$
  select u.papel = 'admin' or (u.papel = 'equipe_franqueadora' and app.tem_modulo(u, 'senhas'))
$$;

create function app.acesso_le_metadados(u public.usuarios, escopo text, unidade text) returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and (
    u.papel = 'admin' or (app.tem_modulo(u, 'senhas') and (
      escopo = 'rede' or (u.papel = 'equipe_franqueadora' and app.unidade_ativa(u))
      or app.senhas_mesma_unidade(u, unidade)
    ))
  )
$$;

create function app.acesso_le_segredo(u public.usuarios, a public.acessos) returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and (
    (a.escopo = 'rede' and (u.papel = 'admin' or (app.tem_modulo(u, 'senhas') and (
      u.papel = 'equipe_franqueadora' or (app.unidade_ativa(u) and u.unidade_id <> '')
    )))) or
    (a.escopo = 'unidade' and app.tem_modulo(u, 'senhas') and app.senhas_mesma_unidade(u, a.unidade_id) and (
      u.papel = 'franqueado' or (u.papel = 'equipe_franqueado' and (
        a.visivel_para_equipe or a.visivel_para ? u.id::text
      ))
    ))
  )
$$;

create function app.acesso_escreve(u public.usuarios, escopo text, unidade text) returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and (
    (escopo = 'rede' and app.senhas_gerencia_rede(u))
    or (escopo = 'unidade' and u.papel = 'franqueado' and app.tem_modulo(u, 'senhas')
      and app.senhas_mesma_unidade(u, unidade))
  )
$$;

create function app.solicitacao_acesso_decide(u public.usuarios, unidade text) returns boolean
language sql stable set search_path = '' as $$
  select app.conta_ativa(u) and (
    (u.papel = 'franqueado' and app.tem_modulo(u, 'senhas') and app.senhas_mesma_unidade(u, unidade))
    or (unidade = '' and app.senhas_gerencia_rede(u))
  )
$$;

alter table public.acessos enable row level security;
alter table public.acesso_segredos enable row level security;
alter table public.acesso_eventos enable row level security;
alter table public.solicitacoes_acesso enable row level security;

revoke all on public.acessos, public.acesso_segredos, public.acesso_eventos, public.solicitacoes_acesso from public, anon, authenticated;
grant select, insert, update on public.acessos, public.acesso_segredos, public.solicitacoes_acesso to authenticated;
grant select, insert on public.acesso_eventos to authenticated;

create policy acessos_ler on public.acessos for select to authenticated
using (app.acesso_le_metadados((select app.perfil()), escopo, unidade_id));
create policy acessos_criar on public.acessos for insert to authenticated with check (
  app.acesso_escreve((select app.perfil()), escopo, unidade_id)
  and (escopo = 'rede' or exists (
    select 1 from public.unidades u where u.id = unidade_id and u.nome = unidade_nome
  ))
);
create policy acessos_atualizar on public.acessos for update to authenticated
using (app.acesso_escreve((select app.perfil()), escopo, unidade_id))
with check (app.acesso_escreve((select app.perfil()), escopo, unidade_id));

create policy acesso_segredos_ler on public.acesso_segredos for select to authenticated using (
  exists (select 1 from public.acessos a where a.id = acesso_id and app.acesso_le_segredo((select app.perfil()), a))
);
create policy acesso_segredos_criar on public.acesso_segredos for insert to authenticated with check (
  exists (select 1 from public.acessos a where a.id = acesso_id
    and app.acesso_escreve((select app.perfil()), a.escopo, a.unidade_id))
);
create policy acesso_segredos_atualizar on public.acesso_segredos for update to authenticated using (
  exists (select 1 from public.acessos a where a.id = acesso_id
    and app.acesso_escreve((select app.perfil()), a.escopo, a.unidade_id))
) with check (
  exists (select 1 from public.acessos a where a.id = acesso_id
    and app.acesso_escreve((select app.perfil()), a.escopo, a.unidade_id))
);

create policy acesso_eventos_ler on public.acesso_eventos for select to authenticated
using (exists (select 1 from public.acessos a where a.id = acesso_id));
create policy acesso_eventos_criar on public.acesso_eventos for insert to authenticated with check (
  exists (select 1 from public.acessos a where a.id = acesso_id and case
    when tipo in ('revelou', 'copiou') then app.acesso_le_segredo((select app.perfil()), a)
    else app.acesso_escreve((select app.perfil()), a.escopo, a.unidade_id)
  end)
);

create policy solicitacoes_acesso_ler on public.solicitacoes_acesso for select to authenticated using (
  exists (select 1 from (select app.perfil() as u) p where app.conta_ativa(p.u) and (
    app.senhas_gerencia_rede(p.u) or (app.tem_modulo(p.u, 'senhas') and app.senhas_mesma_unidade(p.u, unidade_id))
  ))
);
create policy solicitacoes_acesso_criar on public.solicitacoes_acesso for insert to authenticated with check (
  status = 'aberta' and decidido_por is null and decidido_por_nome is null
  and exists (select 1 from (select app.perfil() as u) p where
    app.conta_ativa(p.u) and (p.u).papel in ('franqueado', 'equipe_franqueado')
    and app.tem_modulo(p.u, 'senhas') and app.senhas_mesma_unidade(p.u, unidade_id))
  and exists (select 1 from public.unidades u where u.id = unidade_id and u.nome = unidade_nome)
  and (acesso_id = '' or exists (
    select 1 from public.acessos a where a.id = acesso_id and a.escopo = 'unidade'
      and a.unidade_id = solicitacoes_acesso.unidade_id
  ))
);
create policy solicitacoes_acesso_atualizar on public.solicitacoes_acesso for update to authenticated
using (app.solicitacao_acesso_decide((select app.perfil()), unidade_id))
with check (app.solicitacao_acesso_decide((select app.perfil()), unidade_id));

-- O carimbo de transação e o identificador de troca são definidos pelos gatilhos.
-- O segredo só aceita um identificador novo do pai, na transação que o emitiu.
-- A chave estrangeira adiada exige o segredo correspondente no fim da
-- transação, inclusive se a visibilidade da pessoa mudar antes da confirmação.
-- As RPCs invoker gravam o lote sob RLS. As rules permitem criar só metadados.
create function app.acesso_carimbar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.da_api() then return new; end if;
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
    new.criado_por_nome := (app.perfil()).nome;
    new.criado_em := now();
    new.ultima_troca_em := now();
    new.troca_id := gen_random_uuid();
    new.troca_transacao := pg_current_xact_id();
    new.troca_exigida := null;
  else
    if (new.id, new.escopo, new.unidade_id, new.unidade_nome, new.criado_por, new.criado_por_nome, new.criado_em)
       is distinct from
       (old.id, old.escopo, old.unidade_id, old.unidade_nome, old.criado_por, old.criado_por_nome, old.criado_em) then
      raise exception 'Os campos de origem do acesso são imutáveis.' using errcode = '42501';
    end if;
    new.troca_id := old.troca_id;
    new.troca_transacao := old.troca_transacao;
    new.troca_exigida := old.troca_exigida;
  end if;
  return new;
end
$$;

create function app.acesso_marcar_troca() returns trigger
language plpgsql set search_path = '' as $$
begin
  if app.da_api() then
    if new.ultima_troca_em is distinct from now() then
      raise exception 'A troca deve usar o carimbo do servidor.' using errcode = '42501';
    end if;
    new.ultima_troca_em := now();
    new.troca_id := gen_random_uuid();
    new.troca_transacao := pg_current_xact_id();
    new.troca_exigida := new.troca_id;
  end if;
  return new;
end
$$;

create function app.acesso_exigir_troca() returns trigger
language plpgsql set search_path = '' as $$
begin
  if app.da_api() and old.pendente_troca and not new.pendente_troca
     and new.troca_id is not distinct from old.troca_id then
    raise exception 'A pendência só pode ser removida com a troca do segredo.' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger acesso_1_carimbar before insert or update on public.acessos
for each row execute function app.acesso_carimbar();
create trigger acesso_2_marcar_troca before update of ultima_troca_em on public.acessos
for each row execute function app.acesso_marcar_troca();
create trigger acesso_3_exigir_troca before update on public.acessos
for each row execute function app.acesso_exigir_troca();

create function app.acesso_segredo_carimbar() returns trigger
language plpgsql set search_path = '' as $$
declare
  pai public.acessos;
begin
  if new.login is null or char_length(new.login) > 200
    or new.senha is null or char_length(new.senha) not between 1 and 500
    or new.notas is null or char_length(new.notas) > 2000
    or new.acesso_id is null then
    raise exception 'Dados do segredo inválidos.' using errcode = '42501';
  end if;
  if not app.da_api() then return new; end if;
  if tg_op = 'UPDATE' and new.acesso_id is distinct from old.acesso_id then
    raise exception 'O vínculo do segredo é imutável.' using errcode = '42501';
  end if;
  select a.* into pai from public.acessos a where a.id = new.acesso_id for update;
  if not coalesce(app.acesso_escreve(app.perfil(), pai.escopo, pai.unidade_id), false)
     or pai.troca_id is null or pai.troca_transacao is distinct from pg_current_xact_id()
     or pai.ultima_troca_em is distinct from now()
     or (tg_op = 'UPDATE' and old.troca_id = pai.troca_id) then
    raise exception 'O segredo exige uma troca autorizada na mesma transação.' using errcode = '42501';
  end if;
  new.troca_id := pai.troca_id;
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end
$$;
create trigger acesso_segredo_carimbar before insert or update on public.acesso_segredos
for each row execute function app.acesso_segredo_carimbar();

create function app.acesso_texto_evento(tipo text) returns text
language sql immutable set search_path = '' as $$
  select case tipo
    when 'criacao' then 'Acesso criado.'
    when 'atualizacao' then 'Acesso atualizado.'
    when 'permissao' then 'Permissão alterada.'
    when 'troca_senha' then 'Senha trocada.'
    when 'revelou' then 'Visualizou a senha.'
    when 'copiou' then 'Copiou a senha.'
  end
$$;

create function app.acesso_evento_carimbar() returns trigger
language plpgsql set search_path = '' as $$
declare
  perfil public.usuarios;
begin
  if app.acesso_texto_evento(new.tipo) is null
     or new.texto is distinct from app.acesso_texto_evento(new.tipo) then
    raise exception 'Evento de acesso inválido.' using errcode = '42501';
  end if;
  if not app.da_api() then return new; end if;
  perfil := app.perfil();
  if (new.autor_id is not null and new.autor_id is distinct from auth.uid())
     or (new.autor_nome is not null and new.autor_nome is distinct from perfil.nome) then
    raise exception 'Autor do evento inválido.' using errcode = '42501';
  end if;
  new.autor_id := auth.uid();
  new.autor_nome := perfil.nome;
  new.criado_em := now();
  return new;
end
$$;
create trigger acesso_evento_carimbar before insert on public.acesso_eventos
for each row execute function app.acesso_evento_carimbar();

create function app.solicitacao_acesso_carimbar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.da_api() then return new; end if;
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    new.criado_em := now();
    new.solicitado_por := auth.uid();
    new.solicitado_por_nome := (app.perfil()).nome;
  else
    if old.status <> 'aberta' or new.status is null or new.status not in ('aprovada', 'recusada', 'concluida')
       or to_jsonb(new) - array['status', 'decidido_por', 'decidido_por_nome', 'atualizado_em']
          is distinct from to_jsonb(old) - array['status', 'decidido_por', 'decidido_por_nome', 'atualizado_em'] then
      raise exception 'Apenas a decisão de uma solicitação aberta pode ser gravada.' using errcode = '42501';
    end if;
    new.decidido_por := auth.uid();
    new.decidido_por_nome := (app.perfil()).nome;
  end if;
  return new;
end
$$;
create trigger solicitacao_acesso_carimbar before insert or update on public.solicitacoes_acesso
for each row execute function app.solicitacao_acesso_carimbar();

-- Usa a mesma transação para guardar o segredo e registrar o evento oficial.
-- Erros das RPCs que recebem segredos têm mensagem fixa, sem detalhes de linhas.
create function public.criar_acesso(metadados jsonb, login_novo text, senha_nova text, notas_novas text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  dados public.acessos;
  acesso_novo text;
begin
  if jsonb_typeof(metadados) is distinct from 'object' or exists (
    select 1 from jsonb_object_keys(metadados) campo
    where campo not in ('id', 'nome', 'categoria', 'url', 'escopo', 'unidade_id', 'unidade_nome',
      'responsavel_id', 'responsavel_nome', 'visivel_para', 'visivel_para_equipe', 'pendente_troca')
  ) then
    raise exception 'Campos do acesso inválidos.' using errcode = '42501';
  end if;
  dados := jsonb_populate_record(null::public.acessos, metadados);
  if dados.escopo = 'unidade' and dados.unidade_nome is null then
    select u.nome into dados.unidade_nome from public.unidades u where u.id = dados.unidade_id;
  end if;
  insert into public.acessos (
    id, nome, categoria, url, escopo, unidade_id, unidade_nome, responsavel_id, responsavel_nome,
    visivel_para, visivel_para_equipe, pendente_troca
  ) values (
    coalesce(dados.id, gen_random_uuid()::text), dados.nome, dados.categoria, coalesce(dados.url, ''), dados.escopo,
    coalesce(dados.unidade_id, ''), coalesce(dados.unidade_nome, ''), dados.responsavel_id, dados.responsavel_nome,
    coalesce(dados.visivel_para, '[]'), coalesce(dados.visivel_para_equipe, false), coalesce(dados.pendente_troca, false)
  ) returning id into acesso_novo;
  insert into public.acesso_segredos (acesso_id, login, senha, notas)
  values (acesso_novo, login_novo, senha_nova, notas_novas);
  insert into public.acesso_eventos (acesso_id, tipo, texto)
  values (acesso_novo, 'criacao', app.acesso_texto_evento('criacao'));
  return acesso_novo;
exception when others then
  raise exception 'Não foi possível criar o acesso.' using errcode = '42501';
end
$$;

create function public.trocar_senha_acesso(acesso text, login_novo text, senha_nova text, notas_novas text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.acessos set ultima_troca_em = now(), pendente_troca = false where id = acesso;
  if not found then
    raise exception 'Acesso indisponível.' using errcode = '42501';
  end if;
  insert into public.acesso_segredos (acesso_id, login, senha, notas)
    values (acesso, login_novo, senha_nova, notas_novas)
    on conflict (acesso_id) do update
      set login = excluded.login, senha = excluded.senha, notas = excluded.notas;
  insert into public.acesso_eventos (acesso_id, tipo, texto)
  values (acesso, 'troca_senha', app.acesso_texto_evento('troca_senha'));
exception when others then
  raise exception 'Não foi possível trocar a senha.' using errcode = '42501';
end
$$;

create function public.atualizar_metadados_acesso(acesso text, alteracoes jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  antes public.acessos;
  depois public.acessos;
  evento text;
begin
  if jsonb_typeof(alteracoes) is distinct from 'object' or exists (
    select 1 from jsonb_object_keys(alteracoes) campo
    where campo not in ('nome', 'categoria', 'url', 'responsavel_id', 'responsavel_nome',
      'visivel_para', 'visivel_para_equipe', 'pendente_troca')
  ) then
    raise exception 'Campos de atualização inválidos.' using errcode = '42501';
  end if;
  select * into antes from public.acessos where id = acesso for update;
  depois := jsonb_populate_record(antes, alteracoes);
  update public.acessos set
    nome = depois.nome, categoria = depois.categoria, url = depois.url,
    responsavel_id = depois.responsavel_id, responsavel_nome = depois.responsavel_nome,
    visivel_para = depois.visivel_para, visivel_para_equipe = depois.visivel_para_equipe,
    pendente_troca = depois.pendente_troca
  where id = acesso;
  if not found then
    raise exception 'Acesso indisponível.' using errcode = '42501';
  end if;
  evento := case when alteracoes ?| array['visivel_para', 'visivel_para_equipe'] then 'permissao' else 'atualizacao' end;
  insert into public.acesso_eventos (acesso_id, tipo, texto) values (acesso, evento, app.acesso_texto_evento(evento));
end
$$;

create function public.decidir_solicitacao_acesso(
  solicitacao text, status_novo text, login_novo text default null, senha_nova text default null, notas_novas text default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  pedido public.solicitacoes_acesso;
  acesso public.acessos;
  permissoes jsonb;
begin
  update public.solicitacoes_acesso set status = status_novo where id = solicitacao returning * into pedido;
  if not found then
    raise exception 'Solicitação indisponível.' using errcode = '42501';
  end if;
  if status_novo = 'aprovada' and pedido.tipo in ('pedir_acesso', 'revogar') then
    select * into acesso from public.acessos a
      where a.id = pedido.acesso_id and a.escopo = 'unidade' and a.unidade_id = pedido.unidade_id for update;
    if not found or pedido.alvo_uid is null then
      raise exception 'Acesso ou pessoa da solicitação indisponível.' using errcode = '42501';
    end if;
    permissoes := acesso.visivel_para;
    if pedido.tipo = 'revogar' then
      perform public.trocar_senha_acesso(acesso.id, login_novo, senha_nova, notas_novas);
      perform public.atualizar_metadados_acesso(acesso.id, jsonb_build_object(
        'visivel_para', permissoes - pedido.alvo_uid::text, 'visivel_para_equipe', false
      ));
    else
      if not (permissoes ? pedido.alvo_uid::text) then
        permissoes := permissoes || jsonb_build_array(pedido.alvo_uid::text);
      end if;
      perform public.atualizar_metadados_acesso(acesso.id, jsonb_build_object('visivel_para', permissoes));
    end if;
  end if;
exception when others then
  raise exception 'Não foi possível decidir a solicitação.' using errcode = '42501';
end
$$;

revoke all on function
  app.acesso_visibilidade_valida(jsonb), app.senhas_mesma_unidade(public.usuarios, text),
  app.senhas_gerencia_rede(public.usuarios), app.acesso_le_metadados(public.usuarios, text, text),
  app.acesso_le_segredo(public.usuarios, public.acessos), app.acesso_escreve(public.usuarios, text, text),
  app.solicitacao_acesso_decide(public.usuarios, text), app.acesso_texto_evento(text),
  app.acesso_carimbar(), app.acesso_marcar_troca(), app.acesso_exigir_troca(),
  app.acesso_segredo_carimbar(), app.acesso_evento_carimbar(), app.solicitacao_acesso_carimbar()
from public, anon, authenticated;
grant execute on function
  app.acesso_visibilidade_valida(jsonb), app.senhas_mesma_unidade(public.usuarios, text),
  app.senhas_gerencia_rede(public.usuarios), app.acesso_le_metadados(public.usuarios, text, text),
  app.acesso_le_segredo(public.usuarios, public.acessos), app.acesso_escreve(public.usuarios, text, text),
  app.solicitacao_acesso_decide(public.usuarios, text), app.acesso_texto_evento(text)
to authenticated;

revoke all on function public.criar_acesso(jsonb, text, text, text),
  public.trocar_senha_acesso(text, text, text, text), public.atualizar_metadados_acesso(text, jsonb),
  public.decidir_solicitacao_acesso(text, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.criar_acesso(jsonb, text, text, text),
  public.trocar_senha_acesso(text, text, text, text), public.atualizar_metadados_acesso(text, jsonb),
  public.decidir_solicitacao_acesso(text, text, text, text, text)
to authenticated;
