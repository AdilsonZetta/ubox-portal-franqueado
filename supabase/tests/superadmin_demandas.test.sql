begin;
select plan(26);

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
select tests.id(n), n || '@ubox.test' from generate_series(1, 5) n;
insert into public.usuarios (id, email, nome, papel, ativo, area)
select tests.id(n), n || '@ubox.test', nome, papel::public.papel, true, area
from (values
  (1, 'Admin', 'admin', null),
  (2, 'Pessoa designada', 'equipe_franqueadora', 'sistemas'),
  (3, 'Pessoa da área', 'equipe_franqueadora', 'marketing'),
  (4, 'Outra área', 'equipe_franqueadora', 'financeiro'),
  (5, 'Unidade', 'franqueado', null)
) v(n, nome, papel, area);

select tests.entrar(2);
select throws_ok($$select public.definir_admin(tests.id(2), true)$$, '42501', 'Sem permissão.', 'equipe não promove');
select tests.entrar(1);
select throws_ok($$select public.definir_admin(tests.id(1), false)$$, 'P0001', 'A rede precisa de pelo menos um admin ativo.', 'protege o último admin na despromoção');
select throws_ok($$update public.usuarios set ativo = false where id = tests.id(1)$$, 'P0001', 'A rede precisa de pelo menos um admin ativo.', 'protege o último admin na desativação');
select throws_ok($$update public.usuarios set recusado = true where id = tests.id(1)$$, 'P0001', 'A rede precisa de pelo menos um admin ativo.', 'protege o último admin na recusa');
select throws_ok($$delete from public.usuarios where id = tests.id(1)$$, 'P0001', 'A rede precisa de pelo menos um admin ativo.', 'protege o último admin na exclusão');
select lives_ok($$select public.definir_admin(tests.id(2), true)$$, 'admin promove pessoa da equipe');
select is((select papel::text from public.usuarios where id = tests.id(2)), 'admin', 'promoção muda o papel');
select is((select count(*) from public.usuarios_papel_historico where usuario_id = tests.id(2) and autor_id = tests.id(1) and de = 'equipe_franqueadora' and para = 'admin'), 1::bigint, 'promoção registra autor e mudança');
select lives_ok($$select public.definir_admin(tests.id(2), false)$$, 'admin remove outro admin mantendo um ativo');
select throws_ok($$select public.criar_demanda('Catálogo', '', 'marketing', 'alta', null, array[tests.id(5)], '[]')$$, 'P0001', null, 'unidade não pode ser responsável');
select lives_ok($$select public.criar_demanda('Catálogo', '', 'marketing', 'alta', null, array[tests.id(2)], '[]')$$, 'admin cria demanda para área e responsável');
select throws_ok($$update public.demandas set titulo = 'Edição direta'$$, '42501', null, 'admin edita apenas por RPC');
select tests.entrar(5);
select is((select count(*) from public.demandas), 0::bigint, 'unidade não lê demandas');
select throws_ok($$select public.criar_demanda('Catálogo', '', 'marketing', 'alta', null, '{}', '[]')$$, '42501', null, 'unidade não cria demanda');
select is((select count(*) from public.listar_pessoas_rede()), 0::bigint, 'unidade não lista pessoas');
select is(public.minhas_demandas_abertas(), 0, 'unidade recebe zero no badge');
select tests.entrar(4);
select is((select count(*) from public.demandas), 0::bigint, 'outra área sem atribuição não lê');
select tests.entrar(3);
select is((select count(*) from public.demandas), 1::bigint, 'mesma área lê demanda');
select is(public.minhas_demandas_abertas(), 1, 'badge conta demanda aberta da área');
select tests.entrar(2);
select is((select count(*) from public.demandas), 1::bigint, 'responsável lê demanda de outra área');
select lives_ok($$select public.mudar_status_demanda((select id from public.demandas), 'em_andamento')$$, 'responsável muda status');
select lives_ok($$select public.comentar_demanda((select id from public.demandas), 'Em revisão.')$$, 'responsável comenta');
select throws_ok($$select public.atualizar_demanda((select id from public.demandas), 'Outro título', '', 'marketing', 'alta', null, '{}', '[]')$$, '42501', null, 'responsável sem autoria não edita');
select is(public.minhas_demandas_abertas(), 1, 'badge conta demanda aberta atribuída');
select lives_ok($$select public.mudar_status_demanda((select id from public.demandas), 'concluida')$$, 'responsável conclui demanda');
select is(public.minhas_demandas_abertas(), 0, 'badge exclui demandas concluídas');
reset role;
select * from finish();
rollback;
