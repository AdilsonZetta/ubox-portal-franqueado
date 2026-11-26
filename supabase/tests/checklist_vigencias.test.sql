begin;

create schema tests;
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['admin', 'fr1', 'fr2', 'rede', 'consultor']) with ordinality as t(apelido, n);

create function tests.id(a text) returns uuid language sql stable as $$ select id from tests.pessoas where apelido = a $$;
create function tests.entrar(a text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.id(a), 'role', 'authenticated', 'email', (select email from tests.pessoas where apelido = a))::text, true);
  execute 'set local role authenticated';
end $$;
create function tests.sair() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
-- Quantas linhas um comando afetou (o RLS esconde linhas em UPDATE/DELETE sem dar erro).
create function tests.linhas(cmd text) returns int language plpgsql as $$
declare n int;
begin
  execute cmd;
  get diagnostics n = row_count;
  return n;
end $$;
grant usage on schema tests to anon, authenticated;
grant select on tests.pessoas to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (id, email) select id, email from tests.pessoas;

insert into public.unidades (id, nome, responsavel, email, ativo, modulos_liberados) values
  ('un-ck', 'Unidade Ck', 'Pessoa Teste', 'um@ubox.test', true, '{checklist}'),
  ('un-ck2', 'Outra Ck', 'Pessoa Teste', 'dois@ubox.test', true, '{checklist}'),
  ('un-off', 'Unidade Inativa', 'Pessoa Teste', 'off@ubox.test', false, '{checklist}');

insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, unidade, modulos_liberados)
select tests.id(a), a || '@ubox.test', n, p::public.papel, at, u,
  coalesce((select nome from public.unidades where id = u), ''), m
from (values
  ('admin', 'Admin Rede', 'admin', true, null, '{}'::text[]),
  ('fr1', 'Dono Ck', 'franqueado', true, 'un-ck', '{checklist}'),
  ('fr2', 'Dono Outra Ck', 'franqueado', true, 'un-ck2', '{checklist}'),
  ('rede', 'Rede Ck', 'equipe_franqueadora', true, null, '{checklist}'),
  ('consultor', 'Consultor Rede', 'equipe_franqueadora', true, null, '{acompanhamento}')
) as v(a, n, p, at, u, m);

create function tests.itens() returns jsonb language sql immutable as $$
  select '[
    {"id":"i1","texto":"Luzes","secao":"Loja","peso":1,"exigeEvidencia":false,"exigeObs":false},
    {"id":"i2","texto":"Caixa","secao":"Loja","peso":2,"exigeEvidencia":true,"exigeObs":false},
    {"id":"i3","texto":"Limpeza","secao":"Corredor","peso":3,"exigeEvidencia":false,"exigeObs":true}
  ]'::jsonb
$$;

insert into checklist_modelos (
  id, titulo, tipo, frequencia, itens, total_itens, peso_total, versao,
  publico, unidades, ativo, criado_em, atualizado_por, atualizado_por_nome, atualizado_em
)
select id, 'Abertura da loja', 'abertura', frequencia, tests.itens(), 3, 6, 2,
  cardinality(unidades) = 0, unidades, ativo, '2026-01-01T00:00:00Z',
  tests.id('admin'), 'Admin Rede', '2026-01-01T00:00:00Z'
from (values
  ('ck-rede', '{}'::text[], true, 'diaria'),
  ('ck-avulsa', '{}', true, 'avulsa'),
  ('ck-outra', '{un-ck2}', true, 'semanal'),
  ('ck-off', '{}', false, 'diaria')
) as modelos(id, unidades, ativo, frequencia);

create function tests.vigencia(
  modelo text, unidade text default 'un-ck', vencimento date default '2026-11-27'
) returns void language sql as $$
  insert into public.checklist_vigencias (modelo_id, unidade_id, inicio, primeiro_vencimento)
  values (modelo, unidade, '2026-11-26', vencimento)
$$;

select plan(18);

select tests.entrar('admin');
select lives_ok($$insert into checklist_vigencias
  (modelo_id, unidade_id, inicio, primeiro_vencimento, registrado_por, registrado_por_nome, registrado_em)
  values ('ck-rede', 'un-ck', '2026-11-26', '2026-11-27', tests.id('fr1'), 'Outro nome', '2000-01-01')$$,
  'Admin cadastra vigência e o banco substitui os carimbos fornecidos');
select is((select registrado_por from checklist_vigencias), tests.id('admin'), 'Banco grava o autor da sessão');
select is((select registrado_por_nome from checklist_vigencias), 'Admin Rede', 'Banco grava o nome do autor');
select cmp_ok((select registrado_em from checklist_vigencias), '>=', transaction_timestamp(), 'Banco grava a hora do registro');
select throws_ok($$select tests.vigencia('ck-rede', 'un-ck2', '2026-11-25')$$,
  '23514', null, 'Vencimento anterior ao início é rejeitado');
select throws_ok($$select tests.vigencia('ck-avulsa')$$, '23514', null, 'Rotina avulsa é rejeitada');
select throws_ok($$select tests.vigencia('ck-off')$$, '23514', null, 'Rotina inativa é rejeitada');
select throws_ok($$select tests.vigencia('ck-rede')$$, '23505', null, 'A unidade só tem uma vigência por modelo');
select throws_ok($$update checklist_vigencias set unidade_id = 'un-ck2'$$,
  '42501', null, 'A unidade da vigência é imutável');

select tests.entrar('fr1');
select is((select count(*)::int from checklist_vigencias), 1, 'Unidade lê a própria vigência');
select throws_ok($$select tests.vigencia('ck-rede', 'un-ck2')$$, '42501', null, 'Unidade não insere vigência');
select is(tests.linhas($$update checklist_vigencias set primeiro_vencimento = '2026-11-29'$$), 0, 'Unidade não atualiza vigência');
select is(tests.linhas($$delete from checklist_vigencias$$), 0, 'Unidade não remove vigência');
select is((select count(*)::int from unidades_do_checklist()), 0, 'Unidade não lê o diretório da rede');

select tests.entrar('fr2');
select is((select count(*)::int from checklist_vigencias), 0, 'Outra unidade não lê a vigência');

select tests.entrar('consultor');
select is((select count(*)::int from checklist_vigencias), 1, 'Acompanhamento lê a vigência');

select tests.entrar('rede');
select is((select count(*)::int from unidades_do_checklist()), 2, 'Gestor encontra unidades antes da primeira execução');
select results_eq($$
  insert into checklist_vigencias (modelo_id, unidade_id, inicio, primeiro_vencimento)
  values ('ck-rede', 'un-ck', '2026-11-26', '2026-11-28'),
         ('ck-outra', 'un-ck2', '2026-11-26', '2026-11-28')
  on conflict (modelo_id, unidade_id) do update set
    modelo_id = excluded.modelo_id, unidade_id = excluded.unidade_id,
    inicio = excluded.inicio, primeiro_vencimento = excluded.primeiro_vencimento
  returning registrado_por_nome, primeiro_vencimento
$$, $$values ('Rede Ck'::text, '2026-11-28'::date), ('Rede Ck'::text, '2026-11-28'::date)$$,
  'Upsert em lote registra as datas e carimba com a sessão da franqueadora');

select tests.sair();
select * from finish();
rollback;
