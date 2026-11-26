begin;
select plan(20);

create schema tests;
grant usage on schema tests to authenticated, anon;
create function tests.id(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function tests.entrar(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', tests.id(n), 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

insert into auth.users (id, email)
select tests.id(n), n || '@ubox.test' from generate_series(1, 8) n;
insert into public.unidades (id, nome, responsavel, email, ativo, modulos_liberados) values
  ('centro', 'Centro', 'Dona Centro', 'c@ubox.test', true, '{estoque}'),
  ('norte', 'Norte', 'Dono Norte', 'n@ubox.test', true, '{}'),
  ('sul', 'Sul', 'Dona Sul', 's@ubox.test', false, '{estoque}'),
  ('vazia', 'Vazia', 'Dona Vazia', 'v@ubox.test', true, '{estoque}');

insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, unidade, modulos_liberados)
select tests.id(n), n || '@ubox.test', nome, papel::public.papel, ativo, unidade_id,
  coalesce((select u.nome from public.unidades u where u.id = v.unidade_id), ''), modulos
from (values
  (1, 'Gestor', 'equipe_franqueadora', true, null, '{manuais,universidade,estoque}'::text[]),
  (2, 'Ana', 'franqueado', true, 'centro', '{manuais,universidade,estoque}'),
  (3, 'Bia', 'equipe_franqueado', true, 'centro', '{manuais,universidade,estoque}'),
  (4, 'Caio', 'franqueado', true, 'norte', '{manuais,universidade}'),
  (5, 'Conta inativa', 'equipe_franqueado', false, 'centro', '{manuais,universidade}'),
  (6, 'Unidade inativa', 'franqueado', true, 'sul', '{manuais,universidade}'),
  (7, 'Sem módulo', 'equipe_franqueado', true, 'centro', '{}'),
  (8, 'Sem permissão', 'equipe_franqueadora', true, null, '{}')
) v(n, nome, papel, ativo, unidade_id, modulos);

insert into public.progresso_manuais (id, uid, documento_id, nome, unidade_id, unidade_nome, status, tempo_minimo_seg, concluido_em)
values ('ana_manual', tests.id(2), 'manual', 'Ana', 'centro', 'Centro', 'concluido', 60, now());

select tests.entrar(1);
select results_eq('select nome from public.designados_manuais() order by nome',
  $$values ('Ana'::text), ('Bia'), ('Caio')$$, 'três designados ativos, inclusive quem não iniciou');
select is((select count(*) from public.designados_manuais() d join public.progresso_manuais p using (uid) where p.status = 'concluido'), 1::bigint, 'uma designada concluiu');
select results_eq('select nome from public.designados_universidade() order by nome',
  $$values ('Ana'::text), ('Bia'), ('Caio')$$, 'universidade exclui conta sem módulo, inativa e unidade inativa');
select results_eq('select id from public.unidades_do_estoque() order by id',
  $$values ('centro'::text), ('vazia')$$, 'estoque inclui unidade habilitada sem registros');
reset role;
select tests.entrar(2);
select is((select count(*) from public.designados_manuais()), 2::bigint, 'franqueada vê só a sua unidade nos manuais');
select is((select count(*) from public.designados_universidade()), 2::bigint, 'franqueada vê só a sua unidade na universidade');
select is((select count(*) from public.unidades_do_estoque()), 0::bigint, 'franqueada não consulta a rede de estoque');
reset role;
select tests.entrar(8);
select is((select count(*) from public.designados_manuais()), 0::bigint, 'franqueadora sem módulo não consulta os designados');
select is((select count(*) from public.designados_universidade()), 0::bigint, 'franqueadora sem módulo não consulta a universidade');
select is((select count(*) from public.unidades_do_estoque()), 0::bigint, 'franqueadora sem módulo não consulta unidades de estoque');
reset role;
select tests.entrar(3);
select is((select count(*) from public.designados_manuais()), 0::bigint, 'equipe da unidade não consulta os designados');
select is((select count(*) from public.designados_universidade()), 0::bigint, 'equipe da unidade não consulta a universidade');
select lives_ok($$select public.salvar_contagem_aberta_estoque(null, '[{"itemId":"caixas","itemNome":"Caixas","unidadeMedida":"un","sistema":0,"contado":0,"diferenca":0},{"itemId":"fita","contado":null}]', '')$$, 'equipe salva zero e campo em branco na contagem aberta');
select is(public.salvar_contagem_aberta_estoque(null, '[{"itemId":"caixas","contado":0},{"itemId":"fita","contado":null}]', ''),
  (select id from public.estoque_contagens), 'uma gravação sem ID reaproveita a contagem aberta');
select is((select count(*) from public.estoque_contagens), 1::bigint, 'só há uma contagem aberta na unidade');
select is((select itens->0->'contado' from public.estoque_contagens), '0'::jsonb, 'rascunho guarda zero como número');
select is((select itens->1->'contado' from public.estoque_contagens), 'null'::jsonb, 'rascunho guarda campo em branco');
select throws_ok($$select public.confirmar_contagem_estoque((select id from public.estoque_contagens), '[{"itemId":"caixas","itemNome":"Caixas","unidadeMedida":"un","sistema":0,"contado":0,"diferenca":0}]', '')$$, '42501', null, 'equipe não confirma contagem');
reset role;
select tests.entrar(2);
select lives_ok($$select public.confirmar_contagem_estoque((select id from public.estoque_contagens), '[{"itemId":"caixas","itemNome":"Caixas","unidadeMedida":"un","sistema":0,"contado":0,"diferenca":0}]', '')$$, 'franqueada confirma apenas a linha contada');
reset role;
set local role anon;
select throws_ok('select * from public.designados_manuais()', '42501', null, 'anon não pode executar a consulta');
reset role;
select * from finish();
rollback;
