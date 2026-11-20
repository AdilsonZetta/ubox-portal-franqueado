-- Fase 12: CRM e Gestão Comercial (Módulo 11).
-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

create table public.crm_config (
  id text primary key default 'rede',
  origens jsonb not null,
  motivos_perda jsonb not null,
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null default now()
);

create table public.crm_leads (
  id text primary key default gen_random_uuid()::text,
  unidade_id text not null,
  unidade_nome text not null,
  origem text not null,
  valor_estimado_centavos numeric,
  etapa text not null default 'novo',
  motivo_perda text not null default '',
  responsavel_uid uuid not null references public.usuarios(id),
  responsavel_nome text not null,
  proximo_contato timestamptz,
  ultima_atividade_em timestamptz,
  arquivado boolean not null default false,
  criado_em timestamptz not null default now(),
  etapa_em timestamptz not null default now(),
  fechado_em timestamptz,
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null default now()
);

create table public.crm_contatos (
  id text primary key,
  unidade_id text not null,
  nome text not null,
  telefone text not null,
  email text not null,
  interesse_tamanho text not null,
  interesse_periodo text not null,
  interesse_uso text not null,
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_em timestamptz not null default now()
);

create table public.crm_atividades (
  id text primary key default gen_random_uuid()::text,
  lead_id text not null,
  unidade_id text not null,
  tipo text not null,
  texto text not null,
  uid uuid not null references public.usuarios(id),
  nome text not null,
  gerado_por_ia boolean not null,
  ia_modelo text not null,
  criado_em timestamptz not null default now()
);

create table public.crm_propostas (
  id text primary key default gen_random_uuid()::text,
  lead_id text not null,
  unidade_id text not null,
  box text not null,
  preco_mensal_centavos numeric not null,
  periodo_meses numeric not null,
  validade timestamptz not null,
  status text not null default 'enviada',
  obs text not null,
  gerado_por_ia boolean not null,
  ia_modelo text not null,
  criado_em timestamptz not null default now(),
  atualizado_por uuid not null references public.usuarios(id),
  atualizado_por_nome text not null,
  atualizado_em timestamptz not null default now()
);

create index crm_leads_unidade_idx on public.crm_leads (unidade_id, id);
create index crm_contatos_unidade_idx on public.crm_contatos (unidade_id, id);
create index crm_atividades_lead_idx on public.crm_atividades (unidade_id, lead_id, id);
create index crm_propostas_lead_idx on public.crm_propostas (unidade_id, lead_id, id);

create function app.gere_crm() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(app.conta_ativa(u) and
    (u.papel = 'admin' or (u.papel = 'equipe_franqueadora' and app.tem_modulo(u, 'crm'))), false)
  from app.perfil() u
$$;

create function app.unidade_crm(u public.usuarios) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(app.conta_ativa(u) and u.papel in ('franqueado', 'equipe_franqueado')
    and app.tem_modulo(u, 'crm') and app.unidade_ativa(u) and coalesce(u.unidade_id, '') <> '', false)
$$;

create function app.responsavel_crm_ok(p_uid uuid, p_nome text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.unidade_crm(app.perfil()) and exists (
    select 1 from public.usuarios u
    where u.id = p_uid and u.unidade_id = app.minha_unidade_id() and u.nome = p_nome
      and app.unidade_crm(u)
  )
$$;

create function app.crm_lista_textos_ok(p_lista jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_lista) = 'array' then jsonb_array_length(p_lista) between 1 and 20
    else false end
$$;

-- crmConfigPath aponta para a linha rede. A presença da linha substitui toda a lista padrão.
create function app.origem_crm_ok(p_origem text) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select c.origens ? p_origem from public.crm_config c where c.id = 'rede'),
    p_origem in ('Site', 'Instagram', 'Google', 'Indicação', 'Passante', 'WhatsApp', 'Outro'))
$$;

create function app.motivo_perda_crm_ok(p_motivo text) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select c.motivos_perda ? p_motivo from public.crm_config c where c.id = 'rede'),
    p_motivo in ('Preço', 'Sem box do tamanho', 'Escolheu concorrente', 'Desistiu', 'Sem retorno', 'Outro'))
$$;

-- crmLeadPath aponta para o lead pelo id. A consulta respeita o RLS de quem grava.
create function app.crm_lead_na_unidade(p_lead_id text, p_unidade_id text) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.crm_leads l where l.id = p_lead_id and l.unidade_id = p_unidade_id)
$$;

create function app.crm_ia_ok(p_gerado boolean, p_modelo text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(char_length(p_modelo) <= 80
    and (not p_gerado or (char_length(p_modelo) >= 2 and p_modelo ~ '(?p)^.*[^[:space:]].*$'))
    and p_gerado is not null, false)
$$;

alter table public.crm_config enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_contatos enable row level security;
alter table public.crm_atividades enable row level security;
alter table public.crm_propostas enable row level security;

revoke all on public.crm_config, public.crm_leads, public.crm_contatos, public.crm_atividades,
  public.crm_propostas from public, anon, authenticated;
grant select, insert, update on public.crm_config, public.crm_leads, public.crm_contatos,
  public.crm_propostas to authenticated;
grant select, insert on public.crm_atividades to authenticated;

create policy crm_config_leitura on public.crm_config for select to authenticated
  using ((select app.gere_crm() or app.unidade_crm(app.perfil())));
create policy crm_config_insercao on public.crm_config for insert to authenticated
  with check (id = 'rede' and (select app.gere_crm()));
create policy crm_config_atualizacao on public.crm_config for update to authenticated
  using (id = 'rede' and (select app.gere_crm()))
  with check (id = 'rede' and (select app.gere_crm()));

create policy crm_leads_leitura on public.crm_leads for select to authenticated
  using ((select app.gere_crm()) or
    (unidade_id = (select app.minha_unidade_id()) and (select app.unidade_crm(app.perfil()))));

-- Contatos, atividades e propostas compartilham a regra de leitura exclusiva da própria unidade.
do $$
declare tabela text;
begin
  foreach tabela in array array['crm_leads', 'crm_contatos', 'crm_atividades', 'crm_propostas'] loop
    if tabela <> 'crm_leads' then
      execute format('create policy crm_unidade_leitura on public.%I for select to authenticated
        using (unidade_id = (select app.minha_unidade_id()) and (select app.unidade_crm(app.perfil())))', tabela);
    end if;
    execute format('create policy crm_unidade_insercao on public.%I for insert to authenticated
      with check (unidade_id = (select app.minha_unidade_id()) and (select app.unidade_crm(app.perfil())))', tabela);
    if tabela <> 'crm_atividades' then
      execute format('create policy crm_unidade_atualizacao on public.%I for update to authenticated
        using (unidade_id = (select app.minha_unidade_id()) and (select app.unidade_crm(app.perfil())))
        with check (unidade_id = (select app.minha_unidade_id()) and (select app.unidade_crm(app.perfil())))', tabela);
    end if;
  end loop;
end
$$;

create function app.crm_carimbar() returns trigger
language plpgsql set search_path = '' as $$
declare
  autor public.usuarios := app.perfil();
  anterior jsonb;
  recebido jsonb := to_jsonb(new);
begin
  if tg_op = 'UPDATE' then anterior := to_jsonb(old); end if;
  if autor.id is null
    or (new.atualizado_por is not null and new.atualizado_por is distinct from autor.id
      and recebido->'atualizado_por' is distinct from anterior->'atualizado_por')
    or (new.atualizado_em is not null and new.atualizado_em is distinct from now()
      and recebido->'atualizado_em' is distinct from anterior->'atualizado_em') then
    raise exception 'Carimbo do CRM inválido.' using errcode = '42501';
  end if;

  new.atualizado_por := autor.id;
  new.atualizado_em := now();
  if tg_table_name <> 'crm_contatos' then
    if new.atualizado_por_nome is not null and new.atualizado_por_nome is distinct from autor.nome
      and recebido->'atualizado_por_nome' is distinct from anterior->'atualizado_por_nome' then
      raise exception 'Autoria do CRM inválida.' using errcode = '42501';
    end if;
    new.atualizado_por_nome := autor.nome;
  end if;
  return new;
end
$$;

create function app.crm_config_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from 'rede'
    or (tg_op = 'UPDATE' and new.id is distinct from old.id)
    or not app.crm_lista_textos_ok(new.origens) or not app.crm_lista_textos_ok(new.motivos_perda) then
    raise exception 'Configuração do CRM inválida.' using errcode = '42501';
  end if;
  return new;
end
$$;

create function app.crm_lead_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
declare
  instante timestamptz := now();
  fechado boolean := new.etapa in ('ganho', 'perdido');
  unidade public.usuarios := app.perfil();
begin
  if not coalesce(char_length(new.origem) between 1 and 40
    and (new.valor_estimado_centavos is null or (new.valor_estimado_centavos between 0 and 100000000
      and new.valor_estimado_centavos = trunc(new.valor_estimado_centavos)))
    and new.etapa in ('novo', 'contato', 'visita', 'proposta', 'ganho', 'perdido')
    and char_length(new.motivo_perda) <= 60
    and ((new.etapa = 'perdido') = (char_length(new.motivo_perda) >= 2))
    and new.responsavel_uid is not null and char_length(new.responsavel_nome) between 2 and 120
    and new.arquivado is not null and (fechado = (new.fechado_em is not null))
    and (new.ultima_atividade_em is null or isfinite(new.ultima_atividade_em) or new.ultima_atividade_em = 'infinity')
    and (new.proximo_contato is null or isfinite(new.proximo_contato)), false) then
    raise exception 'Lead CRM inválido.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.unidade_nome is distinct from unidade.unidade or new.etapa <> 'novo' or new.arquivado
      or new.fechado_em is not null or new.ultima_atividade_em is not null
      or coalesce(new.criado_em, instante) <> instante or coalesce(new.etapa_em, instante) <> instante
      or not app.origem_crm_ok(new.origem)
      or not app.responsavel_crm_ok(new.responsavel_uid, new.responsavel_nome) then
      raise exception 'Criação de lead CRM inválida.' using errcode = '42501';
    end if;
    new.criado_em := instante;
    new.etapa_em := instante;
    return new;
  end if;

  if (new.id, new.unidade_id, new.unidade_nome, new.criado_em)
      is distinct from (old.id, old.unidade_id, old.unidade_nome, old.criado_em) then
    raise exception 'Campos imutáveis do lead CRM.' using errcode = '42501';
  end if;
  if old.etapa in ('ganho', 'perdido') then
    if (to_jsonb(new) - array['arquivado', 'atualizado_por', 'atualizado_por_nome', 'atualizado_em'])
      is distinct from
      (to_jsonb(old) - array['arquivado', 'atualizado_por', 'atualizado_por_nome', 'atualizado_em']) then
      raise exception 'Lead CRM fechado só permite arquivamento.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- O cliente pede explicitamente o horário do servidor com infinity; o marcador nunca é gravado.
  if (new.etapa = old.etapa and new.etapa_em is distinct from old.etapa_em)
    or (new.etapa <> old.etapa and not coalesce(new.etapa_em in (instante, 'infinity'), false))
    or (new.fechado_em is not null and new.fechado_em not in (instante, 'infinity'))
    or (new.ultima_atividade_em is distinct from old.ultima_atividade_em
      and not coalesce(new.ultima_atividade_em in (instante, 'infinity'), false))
    or (new.origem <> old.origem and not app.origem_crm_ok(new.origem))
    or (new.etapa = 'perdido' and not app.motivo_perda_crm_ok(new.motivo_perda))
    or ((new.responsavel_uid, new.responsavel_nome) is distinct from (old.responsavel_uid, old.responsavel_nome)
      and not app.responsavel_crm_ok(new.responsavel_uid, new.responsavel_nome)) then
    raise exception 'Alteração de lead CRM inválida.' using errcode = '42501';
  end if;
  if new.etapa <> old.etapa then new.etapa_em := instante; end if;
  if fechado then new.fechado_em := instante; end if;
  if new.ultima_atividade_em is distinct from old.ultima_atividade_em then new.ultima_atividade_em := instante; end if;
  return new;
end
$$;

create function app.crm_contato_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.id, new.unidade_id) is distinct from (old.id, old.unidade_id) then
    raise exception 'Campos imutáveis do contato CRM.' using errcode = '42501';
  end if;
  -- Valide antes das restrições da tabela para evitar detalhes de erro com a linha do cliente.
  if not coalesce(new.id is not null and new.unidade_id is not null and char_length(new.nome) between 2 and 120
    and new.telefone ~ '^[0-9 ()+.-]{0,30}$'
    and char_length(new.email) <= 120 and (new.email = '' or new.email ~ '^[^@ ]+@[^@ ]+[.][^@ ]+$')
    and char_length(new.interesse_tamanho) <= 60 and char_length(new.interesse_periodo) <= 60
    and char_length(new.interesse_uso) <= 200, false) then
    raise exception 'Contato CRM inválido.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and (
    not app.unidade_crm(app.perfil()) or new.unidade_id is distinct from app.minha_unidade_id()
    or not app.crm_lead_na_unidade(new.id, new.unidade_id)) then
    raise exception 'Contato CRM sem lead na unidade.' using errcode = '42501';
  end if;
  return new;
end
$$;

create function app.crm_exigir_contato() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.crm_contatos c where c.id = new.id and c.unidade_id = new.unidade_id) then
    raise exception 'Lead CRM sem contato na unidade.' using errcode = '42501';
  end if;
  return null;
end
$$;

create function app.crm_atividade_antes_inserir() returns trigger
language plpgsql set search_path = '' as $$
declare autor public.usuarios := app.perfil();
begin
  if not coalesce(autor.id is not null and coalesce(new.uid, autor.id) = autor.id
    and coalesce(new.nome, autor.nome) = autor.nome and coalesce(new.criado_em, now()) = now()
    and new.id is not null and new.unidade_id is not null
    and char_length(new.lead_id) between 1 and 64 and app.crm_lead_na_unidade(new.lead_id, new.unidade_id)
    and new.tipo in ('ligacao', 'whatsapp', 'visita', 'email', 'nota')
    and char_length(new.texto) between 2 and 2000 and app.crm_ia_ok(new.gerado_por_ia, new.ia_modelo), false) then
    raise exception 'Atividade CRM inválida.' using errcode = '42501';
  end if;
  new.uid := autor.id;
  new.nome := autor.nome;
  new.criado_em := now();
  return new;
end
$$;

create function app.crm_proposta_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.status <> 'enviada' or new.status is null or new.status not in ('aceita', 'recusada', 'expirada')
      or (to_jsonb(new) - array['status', 'atualizado_por', 'atualizado_por_nome', 'atualizado_em'])
        is distinct from
        (to_jsonb(old) - array['status', 'atualizado_por', 'atualizado_por_nome', 'atualizado_em']) then
      raise exception 'Alteração de proposta CRM inválida.' using errcode = '42501';
    end if;
  else
    if not coalesce(new.id is not null and new.unidade_id is not null
      and char_length(new.lead_id) between 1 and 64 and app.crm_lead_na_unidade(new.lead_id, new.unidade_id)
      and char_length(new.box) between 1 and 60
      and new.preco_mensal_centavos between 1 and 100000000
      and new.preco_mensal_centavos = trunc(new.preco_mensal_centavos)
      and new.periodo_meses between 1 and 120 and new.periodo_meses = trunc(new.periodo_meses)
      and new.validade > now() and isfinite(new.validade) and new.status = 'enviada'
      and char_length(new.obs) <= 1000 and app.crm_ia_ok(new.gerado_por_ia, new.ia_modelo)
      and coalesce(new.criado_em, now()) = now(), false) then
      raise exception 'Proposta CRM inválida.' using errcode = '42501';
    end if;
    new.criado_em := now();
  end if;
  return new;
end
$$;

do $$
declare tabela text;
begin
  foreach tabela in array array['crm_config', 'crm_leads', 'crm_contatos', 'crm_propostas'] loop
    execute format('create trigger crm_a_carimbar before insert or update on public.%I
      for each row when (app.da_api()) execute function app.crm_carimbar()', tabela);
  end loop;
end
$$;

create trigger crm_config_validar before insert or update on public.crm_config
  for each row when (app.da_api()) execute function app.crm_config_antes_gravar();
create trigger crm_lead_validar before insert or update on public.crm_leads
  for each row when (app.da_api()) execute function app.crm_lead_antes_gravar();
create trigger crm_contato_validar before insert or update on public.crm_contatos
  for each row when (app.da_api()) execute function app.crm_contato_antes_gravar();
create trigger crm_atividade_validar before insert on public.crm_atividades
  for each row when (app.da_api()) execute function app.crm_atividade_antes_inserir();
create trigger crm_proposta_validar before insert or update on public.crm_propostas
  for each row when (app.da_api()) execute function app.crm_proposta_antes_gravar();

-- Equivalente ao getAfter: o contato exige o lead no INSERT e o gatilho adiado do lead
-- recusa no fim da transação qualquer INSERT direto que não tenha contato da mesma unidade.
-- A RPC grava as duas linhas atomicamente e mantém o RLS ativo nos dois INSERTs.
create constraint trigger crm_lead_exige_contato after insert on public.crm_leads
  deferrable initially deferred for each row when (app.da_api()) execute function app.crm_exigir_contato();

create function public.criar_lead_crm(p_id text, p_lead jsonb, p_contato jsonb) returns text
language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_lead) is distinct from 'object'
    or p_lead - array['unidade_id', 'unidade_nome', 'origem', 'valor_estimado_centavos', 'etapa',
      'motivo_perda', 'responsavel_uid', 'responsavel_nome', 'proximo_contato', 'ultima_atividade_em',
      'arquivado', 'criado_em', 'etapa_em', 'fechado_em', 'atualizado_por', 'atualizado_por_nome', 'atualizado_em'] <> '{}' then
    raise exception 'Campos de lead CRM inválidos.' using errcode = '42501';
  end if;
  -- A conversão de JSON para o tipo da tabela também aceitaria números e booleanos em texto.
  if exists (
    select 1 from jsonb_each(p_lead) as campo(chave, valor)
    where jsonb_typeof(campo.valor) <> case
        when campo.chave = 'valor_estimado_centavos' then 'number'
        when campo.chave = 'arquivado' then 'boolean'
        else 'string'
      end
      and not (campo.valor = 'null'::jsonb and campo.chave in
        ('valor_estimado_centavos', 'proximo_contato', 'ultima_atividade_em', 'fechado_em'))
  ) then
    raise exception 'Tipos de lead CRM inválidos.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_contato) is distinct from 'object'
    or p_contato - array['unidade_id', 'nome', 'telefone', 'email', 'interesse_tamanho', 'interesse_periodo',
      'interesse_uso', 'atualizado_por', 'atualizado_em'] <> '{}' then
    raise exception 'Campos de contato CRM inválidos.' using errcode = '42501';
  end if;
  if exists (select 1 from jsonb_each(p_contato) as campo(chave, valor)
    where jsonb_typeof(campo.valor) <> 'string') then
    raise exception 'Tipos de contato CRM inválidos.' using errcode = '42501';
  end if;

  insert into public.crm_leads
    select (jsonb_populate_record(null::public.crm_leads, p_lead || jsonb_build_object('id', p_id))).*;
  insert into public.crm_contatos
    select (jsonb_populate_record(null::public.crm_contatos, p_contato || jsonb_build_object('id', p_id))).*;
  return p_id;
exception when data_exception or unique_violation then
  -- Erros de tipo e unicidade podem incluir os valores recebidos no erro original.
  raise exception 'Dados de CRM inválidos.' using errcode = '42501';
end
$$;

create function public.registrar_atividade_crm(
  p_id text, p_lead_id text, p_unidade_id text, p_tipo text, p_texto text, p_gerado_por_ia boolean,
  p_ia_modelo text, p_atualizar_lead boolean, p_agendar boolean, p_proximo_contato timestamptz
) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.crm_atividades (id, lead_id, unidade_id, tipo, texto, gerado_por_ia, ia_modelo)
    values (p_id, p_lead_id, p_unidade_id, p_tipo, p_texto, p_gerado_por_ia, p_ia_modelo);
  if p_atualizar_lead then
    update public.crm_leads
      set ultima_atividade_em = now(),
        proximo_contato = case when p_agendar then p_proximo_contato else proximo_contato end
      where id = p_lead_id and unidade_id = p_unidade_id;
    if not found then
      raise exception 'Lead CRM indisponível.' using errcode = '42501';
    end if;
  end if;
end
$$;

revoke all on function app.gere_crm(), app.unidade_crm(public.usuarios), app.responsavel_crm_ok(uuid, text),
  app.crm_lista_textos_ok(jsonb), app.origem_crm_ok(text), app.motivo_perda_crm_ok(text),
  app.crm_lead_na_unidade(text, text), app.crm_ia_ok(boolean, text), app.crm_carimbar(),
  app.crm_config_antes_gravar(), app.crm_lead_antes_gravar(), app.crm_contato_antes_gravar(),
  app.crm_exigir_contato(), app.crm_atividade_antes_inserir(), app.crm_proposta_antes_gravar(),
  public.criar_lead_crm(text, jsonb, jsonb),
  public.registrar_atividade_crm(text, text, text, text, text, boolean, text, boolean, boolean, timestamptz)
  from public, anon, authenticated, service_role;

grant execute on function app.gere_crm(), app.unidade_crm(public.usuarios), app.responsavel_crm_ok(uuid, text),
  app.crm_lista_textos_ok(jsonb), app.origem_crm_ok(text), app.motivo_perda_crm_ok(text),
  app.crm_lead_na_unidade(text, text), app.crm_ia_ok(boolean, text),
  public.criar_lead_crm(text, jsonb, jsonb),
  public.registrar_atividade_crm(text, text, text, text, text, boolean, text, boolean, boolean, timestamptz)
  to authenticated;
