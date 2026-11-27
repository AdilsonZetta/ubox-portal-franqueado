begin;
select plan(43);

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


insert into public.unidades (id, nome, responsavel, email, ativo) values
  ('a', 'Unidade A', 'Pessoa A', 'a@ubox.test', true),
  ('b', 'Unidade B', 'Pessoa B', 'b@ubox.test', true),
  ('c', 'Unidade C', 'Pessoa C', 'c@ubox.test', false);
insert into auth.users (id, email)
select tests.id(n), n || '@ubox.test' from generate_series(1, 9) n;
insert into public.usuarios (id, email, nome, papel, ativo, area, unidade_id)
select tests.id(n), n || '@ubox.test', nome, papel::public.papel, true, area, unidade
from (values
  (1, 'Admin', 'admin', null, null),
  (2, 'Autora', 'equipe_franqueadora', 'marketing', null),
  (3, 'Outra área', 'equipe_franqueadora', 'financeiro', null),
  (4, 'Franqueado A', 'franqueado', null, 'a'),
  (5, 'Pessoa designada', 'equipe_franqueado', null, 'a'),
  (6, 'Pessoa sem atribuição', 'equipe_franqueado', null, 'a'),
  (7, 'Franqueado B', 'franqueado', null, 'b'),
  (8, 'Franqueado C', 'franqueado', null, 'c'),
  (9, 'Pessoa B', 'equipe_franqueado', null, 'b')
) v(n, nome, papel, area, unidade);

select tests.entrar(2);
select lives_ok($$select public.criar_demanda('Interna', '', 'marketing', 'alta', null, array[tests.id(2)], '[]')$$, 'cria interna');
select lives_ok($$select public.criar_demanda_unidades(array['a','b','a'], 'Campanha', '', null, 'alta', null, array[tests.id(2)], array[tests.id(5),tests.id(9)], '[]')$$, 'equipe cria para duas unidades');
select is((select count(*) from public.demandas where destino = 'unidade'), 2::bigint, 'autora lê uma cópia por unidade');
select is((select count(distinct grupo_id) from public.demandas where destino = 'unidade'), 1::bigint, 'cópias compartilham o grupo');
select is((select count(*) from public.listar_pessoas_unidades(array['a'])), 3::bigint, 'rede lista pessoas da unidade selecionada');
select throws_ok($$select public.criar_demanda_unidades(array['b'], 'Inválida', '', null, 'alta', null, '{}', array[tests.id(5)], '[]')$$, 'P0001', null, 'rejeita responsável de outra unidade');
select throws_ok($$select public.criar_demanda_unidades(array['c'], 'Inválida', '', null, 'alta', null, '{}', '{}', '[]')$$, 'P0001', null, 'rejeita unidade inativa');
select throws_ok($$select public.atualizar_demanda((select id from public.demandas where unidade_id = 'a'), 'Editada', '', null, 'alta', null, array[tests.id(9)], '[]')$$, 'P0001', null, 'edição rejeita responsável de outra unidade');
select lives_ok($$select public.atualizar_demanda((select id from public.demandas where unidade_id = 'a'), 'Campanha A', '', null, 'alta', null, array[tests.id(5)], '[]')$$, 'autora edita responsáveis da unidade');
select lives_ok($$select public.criar_demanda_unidades(array['a'], 'Toda a unidade', '', null, 'alta', null, array[tests.id(2)], '{}', '[]')$$, 'envia à unidade toda com acompanhamento da rede');

select tests.entrar(3);
select is((select count(*) from public.demandas), 0::bigint, 'outra área sem atribuição não lê');
select tests.entrar(5);
select results_eq($$select titulo from public.demandas order by titulo$$, $$values ('Campanha A'::text), ('Toda a unidade'::text)$$, 'equipe designada lê demandas pessoais e coletivas');
select tests.entrar(6);
select results_eq($$select titulo from public.demandas$$, $$values ('Toda a unidade'::text)$$, 'equipe sem atribuição lê só as coletivas');
select is(public.minhas_demandas_abertas(), 1, 'badge da equipe usa a mesma visibilidade');
select tests.entrar(7);
select results_eq($$select titulo from public.demandas$$, $$values ('Campanha'::text)$$, 'franqueado B lê só a cópia B');
select tests.entrar(4);
select results_eq($$select titulo from public.demandas order by titulo$$, $$values ('Campanha A'::text), ('Toda a unidade'::text)$$, 'franqueado A lê A e nenhuma interna');
select is((select count(*) from public.demanda_responsaveis), 2::bigint, 'RLS de responsáveis segue a demanda');
select is((select count(*) from public.demanda_eventos), 4::bigint, 'RLS de histórico segue a demanda');
select is((select usuario_nome from public.demanda_responsaveis where usuario_id = tests.id(5)), 'Pessoa designada', 'nome denormalizado');
select is(public.minhas_demandas_abertas(), 2, 'badge do franqueado inclui toda a unidade');
select lives_ok($$select public.mudar_status_demanda((select id from public.demandas where titulo = 'Campanha A'), 'concluida')$$, 'franqueado muda status');
select lives_ok($$select public.comentar_demanda((select id from public.demandas where titulo = 'Campanha A'), 'Feito.')$$, 'franqueado comenta');
select lives_ok($$select public.adicionar_link_demanda((select id from public.demandas where titulo = 'Campanha A'), 'Guia', 'https://ubox.test/guia')$$, 'franqueado adiciona link');
select is((select jsonb_array_length(anexos) from public.demandas where titulo = 'Campanha A'), 1, 'link é salvo');
select is(public.minhas_demandas_abertas(), 1, 'badge exclui concluídas');
select is((select count(*) from public.listar_pessoas_unidades(array['a'])), 0::bigint, 'franqueado não usa o diretório da rede');
select throws_ok($$select public.atualizar_demanda((select id from public.demandas limit 1), 'Inválida', '', null, 'alta', null, '{}', '[]')$$, '42501', null, 'franqueado não edita');
select throws_ok($$select public.excluir_demanda((select id from public.demandas limit 1))$$, '42501', null, 'franqueado não exclui');
select throws_ok($$select public.criar_demanda_unidades(array['a'], 'Inválida', '', null, 'alta', null, '{}', '{}', '[]')$$, '42501', null, 'franqueado não cria para unidades');
select throws_ok($$select public.criar_demanda('Inválida', '', 'marketing', 'alta', null, '{}', '[]')$$, '42501', null, 'franqueado não cria interna');
select tests.entrar(7);
select is((select status from public.demandas), 'a_fazer', 'cópia B mantém status independente');
select is((select count(*) from public.demanda_eventos), 1::bigint, 'cópia B mantém histórico independente');
select is((select public.demanda_unidade_nome(d) from public.demandas d), 'Unidade B', 'nome da unidade disponível na demanda');
select is((select public.tem_responsaveis_unidade(d) from public.demandas d), true, 'indica atribuição individual');
select tests.entrar(8);
select is(public.minhas_demandas_abertas(), 0, 'unidade inativa tem badge zero');
select is((select count(*) from public.demandas), 0::bigint, 'unidade inativa não lê demandas');

select tests.entrar(2);
select results_eq($$select id from public.listar_unidades_demanda() order by id$$,
  $$values ('a'::text), ('b'::text)$$, 'diretório de envio lista apenas unidades ativas');
select lives_ok($$select public.atualizar_demanda((select id from public.demandas where unidade_id = 'b'),
  'Campanha', '', null, 'alta', null, array[tests.id(9)], (
    select jsonb_agg(jsonb_build_object('nome', 'Guia ' || n, 'url', 'https://ubox.test/' || n))
    from generate_series(1, 8) n
  ))$$, 'permite oito links');
select tests.entrar(7);
select throws_ok($$select public.adicionar_link_demanda((select id from public.demandas), 'Extra', 'https://ubox.test/extra')$$,
  'P0001', null, 'franqueado não adiciona o nono link');
select is((select jsonb_array_length(anexos) from public.demandas), 8, 'limite preserva os links existentes');

reset role;
update public.unidades set ativo = false where id = 'b';
select tests.entrar(7);
select is((select count(*) from public.demandas), 0::bigint, 'desativar unidade retira a visibilidade de demanda existente');
reset role;
update public.usuarios set ativo = false where id = tests.id(5);
select tests.entrar(5);
select is((select count(*) from public.demandas), 0::bigint, 'conta inativa não lê suas demandas');
set local role anon;
select throws_ok($$select public.listar_pessoas_unidades(array['a'])$$, '42501', null, 'anônimo não executa RPC de pessoas');
reset role;
select * from finish();
rollback;
