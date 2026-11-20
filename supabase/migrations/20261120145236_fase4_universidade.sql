-- Fase 4: Universidade, provas e correção das tentativas.
-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

create function app.fase4_perguntas_ok(perguntas jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  pergunta jsonb;
  opcao jsonb;
begin
  if jsonb_typeof(perguntas) <> 'array' then return false; end if;
  if jsonb_array_length(perguntas) not between 1 and 20 then return false; end if;

  for pergunta in select value from jsonb_array_elements(perguntas) loop
    if jsonb_typeof(pergunta) <> 'object' then return false; end if;
    if not coalesce(
      pergunta - array['id', 'enunciado', 'opcoes'] = '{}'::jsonb
      and jsonb_typeof(pergunta -> 'id') = 'string'
      and length(pergunta ->> 'id') between 1 and 40
      and jsonb_typeof(pergunta -> 'enunciado') = 'string'
      and length(pergunta ->> 'enunciado') between 1 and 600
      and jsonb_typeof(pergunta -> 'opcoes') = 'array', false
    ) then return false; end if;

    if jsonb_array_length(pergunta -> 'opcoes') not between 2 and 6 then return false; end if;
    for opcao in select value from jsonb_array_elements(pergunta -> 'opcoes') loop
      if jsonb_typeof(opcao) <> 'string' or length(opcao #>> '{}') not between 1 and 300 then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end
$$;

create function app.fase4_aulas_ok(aulas text[]) returns boolean
language sql immutable set search_path = '' as $$
  select cardinality(aulas) <= 20
    and (cardinality(aulas) = 0 or (array_ndims(aulas) = 1 and array_lower(aulas, 1) = 1))
    and not exists (select 1 from unnest(aulas) as aula where length(aula) between 1 and 128 is not true)
$$;

create function app.fase4_respostas_ok(respostas integer[]) returns boolean
language sql immutable set search_path = '' as $$
  select cardinality(respostas) between 1 and 20
    and array_ndims(respostas) = 1 and array_lower(respostas, 1) = 1
    and not exists (select 1 from unnest(respostas) as resposta where resposta between 0 and 5 is not true)
$$;

revoke all on function app.fase4_perguntas_ok(jsonb), app.fase4_aulas_ok(text[]),
  app.fase4_respostas_ok(integer[]) from public, anon, authenticated;
grant execute on function app.fase4_perguntas_ok(jsonb), app.fase4_aulas_ok(text[]),
  app.fase4_respostas_ok(integer[]) to authenticated;

create table public.cursos (
  id text primary key check (id ~ '^[A-Za-z0-9-]{1,64}$'),
  titulo text not null check (length(titulo) between 2 and 120),
  descricao text not null check (length(descricao) <= 1000),
  ordem integer not null check (ordem between 1 and 999),
  aulas text[] not null check (app.fase4_aulas_ok(aulas)),
  publicado boolean not null,
  atualizado_por uuid references public.usuarios (id) on delete set null,
  atualizado_por_nome text not null check (length(atualizado_por_nome) between 2 and 120),
  atualizado_em timestamptz not null default now()
);

create table public.provas (
  id text primary key references public.cursos (id),
  titulo text not null check (length(titulo) between 2 and 120),
  nota_minima integer not null check (nota_minima between 1 and 100),
  perguntas jsonb not null check (app.fase4_perguntas_ok(perguntas)),
  total_perguntas integer not null check (total_perguntas = jsonb_array_length(perguntas)),
  manual_retorno_id text not null check (length(manual_retorno_id) between 1 and 128),
  tempo_reestudo_seg integer not null check (tempo_reestudo_seg between 30 and 14400),
  versao integer not null check (versao >= 1),
  publicado boolean not null,
  atualizado_por uuid references public.usuarios (id) on delete set null,
  atualizado_por_nome text not null check (length(atualizado_por_nome) between 2 and 120),
  atualizado_em timestamptz not null default now(),
  unique (id, versao)
);

create table public.provas_gabarito (
  id text primary key,
  corretas integer[] not null check (app.fase4_respostas_ok(corretas)),
  versao integer not null check (versao >= 1),
  atualizado_por uuid references public.usuarios (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  total_perguntas integer generated always as (cardinality(corretas)) stored,
  unique (id, versao, total_perguntas),
  constraint gabarito_prova_fk foreign key (id, versao) references public.provas (id, versao)
    deferrable initially deferred
);

-- O par só pode ser confirmado com a mesma versão e quantidade de questões.
alter table public.provas add constraint prova_gabarito_fk
  foreign key (id, versao, total_perguntas) references public.provas_gabarito (id, versao, total_perguntas)
  deferrable initially deferred;

create table public.tentativas_prova (
  id text primary key,
  uid uuid not null references public.usuarios (id) on delete cascade,
  curso_id text not null references public.cursos (id),
  ciclo integer not null check (ciclo between 1 and 50),
  numero integer not null check (numero between 1 and 3),
  nome text not null,
  unidade_id text not null,
  unidade_nome text not null check (length(unidade_nome) <= 120),
  versao integer not null,
  aprovado boolean,
  criado_em timestamptz not null default now(),
  corrigido_em timestamptz,
  folha_id text check (folha_id = id)
);

create table public.tentativas_prova_folha (
  tentativa_id text primary key references public.tentativas_prova (id) on delete cascade,
  uid uuid not null references public.usuarios (id) on delete cascade,
  versao integer not null,
  respostas integer[] not null check (app.fase4_respostas_ok(respostas))
);

-- O gatilho marca a folha como obrigatória em toda tentativa da API. A FK
-- adiada exige que ela exista ao confirmar a transação, permitindo o mesmo
-- lote do Firestore. Importações antigas sem folha conservam folha_id nulo
-- e a política de inserção impede que a API acrescente uma folha a elas.
alter table public.tentativas_prova add constraint tentativa_folha_fk
  foreign key (folha_id) references public.tentativas_prova_folha (tentativa_id)
  deferrable initially deferred;

create index tentativas_prova_uid_idx on public.tentativas_prova (uid);
create index tentativas_prova_unidade_idx on public.tentativas_prova (unidade_id);
create index tentativas_prova_curso_idx on public.tentativas_prova (curso_id);
create index tentativas_prova_folha_id_idx on public.tentativas_prova (folha_id);
create index tentativas_prova_folha_uid_idx on public.tentativas_prova_folha (uid);

create function app.fase4_tentativa_na_vez(curso text, ciclo integer, numero integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select ($2 = 1 and $3 = 1)
    or exists (
      select 1 from public.tentativas_prova t
      where t.uid = (select auth.uid()) and t.aprovado = false
        and t.id = (select auth.uid())::text || '_' || $1 || '_' ||
          case when $3 > 1 then $2 || '_' || ($3 - 1)
               else ($2 - 1) || '_3' end
        and ($3 > 1 or ($2 > 1 and exists (
          select 1 from public.reestudos r
          where r.id = (select auth.uid())::text || '_' || $1 || '_' || ($2 - 1)
            and r.uid = (select auth.uid()) and r.status = 'concluido'
        )))
    )
$$;

create function app.fase4_le_resultado_unidade(unidade text) returns boolean
language sql stable set search_path = '' as $$
  select app.fase3_aluno('universidade') and u.papel = 'franqueado' and u.unidade_id = $1
  from app.perfil() u
$$;

create function app.fase4_versao_prova() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.versao::bigint <> old.versao::bigint + 1 then
    raise exception 'A versão da prova deve avançar de um em um.' using errcode = '42501';
  end if;
  return new;
end
$$;

create function app.fase4_envio() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.criado_em := now();
  new.folha_id := new.id;
  return new;
end
$$;

-- A função de gatilho acessa o gabarito sem conceder leitura ao aluno.
-- A condição WHEN do gatilho é avaliada antes da troca de papel.
create function app.fase4_corrigir() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.aprovado is not null or new.aprovado is null
    or (to_jsonb(new) - array['aprovado', 'corrigido_em'])
      is distinct from (to_jsonb(old) - array['aprovado', 'corrigido_em']) then
    raise exception 'A tentativa só pode receber um resultado.' using errcode = '42501';
  end if;

  if not (
    (new.aprovado = false and app.fase3_gere('universidade'))
    or (old.uid = (select auth.uid()) and exists (
      select 1 from public.provas p
      join public.provas_gabarito g on g.id = p.id
      join public.tentativas_prova_folha f on f.tentativa_id = old.id
      where p.id = old.curso_id and new.aprovado = case
        when g.versao <> old.versao then false
        else (select count(*) from unnest(f.respostas, g.corretas) as r(resposta, correta)
              where r.resposta = r.correta) * 100 >= p.nota_minima * p.total_perguntas
        end
    ))
  ) then
    raise exception 'Resultado da tentativa inválido.' using errcode = '42501';
  end if;

  new.corrigido_em := now();
  return new;
end
$$;

revoke all on function app.fase4_tentativa_na_vez(text, integer, integer),
  app.fase4_le_resultado_unidade(text), app.fase4_corrigir(),
  app.fase4_versao_prova(), app.fase4_envio() from public, anon, authenticated;
grant execute on function app.fase4_tentativa_na_vez(text, integer, integer),
  app.fase4_le_resultado_unidade(text), app.fase4_corrigir() to authenticated;

create trigger cursos_carimbo before insert or update on public.cursos
  for each row execute function app.fase3_carimbar('atualizado_em');
create trigger provas_carimbo before insert or update on public.provas
  for each row execute function app.fase3_carimbar('atualizado_em');
create trigger provas_versao before update on public.provas
  for each row when (app.da_api()) execute function app.fase4_versao_prova();
create trigger provas_gabarito_carimbo before insert or update on public.provas_gabarito
  for each row execute function app.fase3_carimbar('atualizado_em');
create trigger tentativas_prova_envio before insert on public.tentativas_prova
  for each row when (app.da_api()) execute function app.fase4_envio();
create trigger tentativas_prova_corrigir before update on public.tentativas_prova
  for each row when (app.da_api()) execute function app.fase4_corrigir();

-- O cronômetro existente já carimba o início no INSERT e no reinício válido.
drop trigger reestudos_antes_cronometro on public.reestudos;

alter table public.cursos enable row level security;
alter table public.provas enable row level security;
alter table public.provas_gabarito enable row level security;
alter table public.tentativas_prova enable row level security;
alter table public.tentativas_prova_folha enable row level security;

revoke all on public.cursos, public.provas, public.provas_gabarito,
  public.tentativas_prova, public.tentativas_prova_folha from public, anon, authenticated;
grant select, insert, update on public.cursos, public.provas, public.provas_gabarito,
  public.tentativas_prova to authenticated;
grant select, insert on public.tentativas_prova_folha to authenticated;

create policy cursos_ler on public.cursos for select to authenticated
  using ((select app.fase3_gere('universidade')) or (publicado and (
    (select app.gere_acompanhamento())
    or ((select app.fase3_ativo()) and (select app.tem_modulo(app.perfil(), 'universidade')))
  )));
create policy cursos_criar on public.cursos for insert to authenticated
  with check ((select app.fase3_gere('universidade')) and atualizado_por = (select auth.uid())
    and atualizado_por_nome = (select (app.perfil()).nome));
create policy cursos_editar on public.cursos for update to authenticated
  using ((select app.fase3_gere('universidade')))
  with check ((select app.fase3_gere('universidade')) and atualizado_por = (select auth.uid())
    and atualizado_por_nome = (select (app.perfil()).nome));

create policy provas_ler on public.provas for select to authenticated
  using ((select app.fase3_gere('universidade')) or (publicado
    and (select app.fase3_ativo()) and (select app.tem_modulo(app.perfil(), 'universidade'))));
create policy provas_criar on public.provas for insert to authenticated
  with check ((select app.fase3_gere('universidade')) and atualizado_por = (select auth.uid())
    and atualizado_por_nome = (select (app.perfil()).nome));
create policy provas_editar on public.provas for update to authenticated
  using ((select app.fase3_gere('universidade')))
  with check ((select app.fase3_gere('universidade')) and atualizado_por = (select auth.uid())
    and atualizado_por_nome = (select (app.perfil()).nome));

create policy provas_gabarito_ler on public.provas_gabarito for select to authenticated
  using ((select app.fase3_gere('universidade')));
create policy provas_gabarito_criar on public.provas_gabarito for insert to authenticated
  with check ((select app.fase3_gere('universidade')) and atualizado_por = (select auth.uid()));
create policy provas_gabarito_editar on public.provas_gabarito for update to authenticated
  using ((select app.fase3_gere('universidade')))
  with check ((select app.fase3_gere('universidade')) and atualizado_por = (select auth.uid()));

create policy tentativas_prova_ler on public.tentativas_prova for select to authenticated
  using (uid = (select auth.uid()) or (select app.fase3_gere('universidade'))
    or (select app.gere_acompanhamento()) or app.fase4_le_resultado_unidade(unidade_id));
create policy tentativas_prova_criar on public.tentativas_prova for insert to authenticated
  with check (uid = (select auth.uid()) and (select app.fase3_aluno('universidade'))
    and id = uid::text || '_' || curso_id || '_' || ciclo || '_' || numero
    and aprovado is null and corrigido_em is null
    and nome = (select (app.perfil()).nome) and unidade_id = (select app.minha_unidade_id())
    and unidade_nome = (select coalesce((app.perfil()).unidade, ''))
    and exists (select 1 from public.provas p where p.id = curso_id and p.publicado and p.versao = tentativas_prova.versao)
    and app.fase4_tentativa_na_vez(curso_id, ciclo, numero));
create policy tentativas_prova_editar on public.tentativas_prova for update to authenticated
  using (uid = (select auth.uid()) or (select app.fase3_gere('universidade')))
  with check (uid = (select auth.uid()) or (select app.fase3_gere('universidade')));

create policy tentativas_prova_folha_ler on public.tentativas_prova_folha for select to authenticated
  using (uid = (select auth.uid()) or (select app.fase3_gere('universidade')));
create policy tentativas_prova_folha_criar on public.tentativas_prova_folha for insert to authenticated
  with check (uid = (select auth.uid()) and exists (
    select 1 from public.tentativas_prova t join public.provas p on p.id = t.curso_id
    where t.id = tentativa_id and t.folha_id = tentativa_id and t.uid = (select auth.uid())
      and t.versao = tentativas_prova_folha.versao and t.aprovado is null
      and p.total_perguntas = cardinality(respostas)
  ));

-- Qualifica os parâmetros agora que a tabela real também tem a coluna ciclo.
create or replace function app.fase3_reestudo_liberado(curso text, ciclo integer, doc text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.fase3_aluno('universidade')
    and exists (select 1 from public.provas p where p.id = $1 and p.manual_retorno_id = $3)
    and exists (
      select 1 from public.tentativas_prova t
      where t.id = (select auth.uid())::text || '_' || $1 || '_' || $2 || '_3'
        and t.uid = (select auth.uid()) and t.aprovado = false
    )
$$;
