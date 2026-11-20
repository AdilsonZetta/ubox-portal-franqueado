-- Testes das gravações atômicas da Universidade.
begin;

create schema tests;
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['aluno', 'aluno2', 'dono', 'rede']) with ordinality as t(apelido, n);

create function tests.id(a text) returns uuid language sql stable as $$ select id from tests.pessoas where apelido = a $$;
create function tests.entrar(a text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.id(a), 'role', 'authenticated', 'email', (select email from tests.pessoas where apelido = a))::text, true);
  execute 'set local role authenticated';
end $$;
create function tests.anonimo() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;
create function tests.sair() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
grant usage on schema tests to anon, authenticated;
grant select on tests.pessoas to authenticated;

select plan(13);

insert into auth.users (id, email) select id, email from tests.pessoas;
insert into public.unidades (id, nome, cidade, responsavel, email, ativo)
values ('uni', 'Unidade Uni', 'Uberaba', 'Dono Uni', 'uni@ubox.test', true);
insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, unidade, modulos_liberados)
select tests.id(a), a || '@ubox.test', n, p::public.papel, true, u,
       case when u is not null then 'Unidade Uni' else '' end, '{universidade}'
from (values
 ('aluno', 'Aluno Uni', 'equipe_franqueado', 'uni'),
 ('aluno2', 'Aluno Dois', 'equipe_franqueado', 'uni'),
 ('dono', 'Dono Uni', 'franqueado', 'uni'),
 ('rede', 'Rede Uni', 'equipe_franqueadora', null)
) v(a,n,p,u);

insert into public.cursos (id, titulo, descricao, ordem, aulas, publicado, atualizado_por, atualizado_por_nome)
values ('curso-rpc', 'Curso RPC', 'Abertura', 1, '{man-1}', true, tests.id('rede'), 'Rede Uni');

-- As restrições adiadas precisam ser verificadas antes do rollback da suíte,
-- no mesmo sub-bloco da RPC, para simular a validação do commit pelo PostgREST.
create function tests.salvar(autor text, versao_prova integer, versao_gabarito integer)
returns void language plpgsql as $$
begin
  perform public.salvar_prova_universidade(
    p_prova => jsonb_build_object(
      'id', 'curso-rpc', 'titulo', 'Prova ' || versao_prova, 'nota_minima', 75,
      'perguntas', '[{"id":"p1","enunciado":"Questão 1","opcoes":["A","B"]},{"id":"p2","enunciado":"Questão 2","opcoes":["A","B"]}]'::jsonb,
      'total_perguntas', 2, 'manual_retorno_id', 'man-1', 'tempo_reestudo_seg', 60,
      'versao', versao_prova, 'publicado', true, 'atualizado_por', auth.uid(),
      'atualizado_por_nome', autor),
    p_gabarito => jsonb_build_object(
      'id', 'curso-rpc', 'corretas', jsonb_build_array(0, 1),
      'versao', versao_gabarito, 'atualizado_por', auth.uid())
  );
  set constraints public.prova_gabarito_fk, public.gabarito_prova_fk immediate;
  set constraints public.prova_gabarito_fk, public.gabarito_prova_fk deferred;
end $$;

create function tests.enviar(aluno text, nome text, respostas integer[])
returns void language plpgsql as $$
declare
  aluno_id uuid := tests.id(aluno);
  chave text := aluno_id || '_curso-rpc_1_1';
begin
  perform public.enviar_tentativa_universidade(
    p_tentativa => jsonb_build_object(
      'id', chave, 'uid', aluno_id, 'curso_id', 'curso-rpc', 'ciclo', 1, 'numero', 1,
      'nome', nome, 'unidade_id', 'uni', 'unidade_nome', 'Unidade Uni', 'versao', 2),
    p_folha => jsonb_build_object(
      'tentativa_id', chave, 'uid', aluno_id, 'versao', 2, 'respostas', respostas)
  );
  set constraints public.tentativa_folha_fk immediate;
  set constraints public.tentativa_folha_fk deferred;
end $$;

select tests.entrar('dono');
select throws_ok($$select tests.salvar('Dono Uni', 1, 1)$$, '42501', null, 'franqueado não grava prova');

select tests.entrar('rede');
select throws_ok($$select tests.salvar('Rede Uni', 1, 2)$$, '23503', null, 'versões divergentes são recusadas');
select tests.sair();
select is(
  (select count(*) from public.provas) + (select count(*) from public.provas_gabarito),
  0::bigint, 'versões divergentes não deixam prova nem gabarito');
select tests.entrar('rede');
select lives_ok($$select tests.salvar('Rede Uni', 1, 1)$$, 'franqueadora grava prova e gabarito');
select lives_ok($$select tests.salvar('Rede Uni', 2, 2)$$, 'franqueadora atualiza prova e gabarito');
select results_eq(
  $$select p.titulo, p.versao, g.versao, g.corretas
    from public.provas p join public.provas_gabarito g using (id) where p.id = 'curso-rpc'$$,
  $$values ('Prova 2'::text, 2, 2, array[0,1])$$,
  'prova e gabarito refletem a nova versão');

select tests.entrar('aluno');
select throws_ok($$select tests.enviar('aluno2', 'Aluno Dois', array[0,1])$$,
  '42501', null, 'aluno não envia tentativa em nome de outro');
select throws_ok($$select tests.enviar('aluno', 'Aluno Uni', array[0])$$,
  '42501', null, 'folha com quantidade incorreta é recusada');
select tests.sair();
select is(
  (select count(*) from public.tentativas_prova) + (select count(*) from public.tentativas_prova_folha),
  0::bigint, 'envios recusados não deixam tentativa nem folha');
select tests.entrar('aluno');
select lives_ok($$select tests.enviar('aluno', 'Aluno Uni', array[0,1])$$, 'aluno envia tentativa e folha');
select is((select respostas from public.tentativas_prova_folha where tentativa_id = auth.uid() || '_curso-rpc_1_1'),
  array[0,1], 'folha do aluno contém as respostas enviadas');

select tests.anonimo();
select throws_ok($$select public.salvar_prova_universidade('{}', '{}')$$,
  '42501', 'permission denied for function salvar_prova_universidade', 'anônimo não executa a gravação da prova');
select throws_ok($$select public.enviar_tentativa_universidade('{}', '{}')$$,
  '42501', 'permission denied for function enviar_tentativa_universidade', 'anônimo não executa o envio da tentativa');

select tests.sair();
select * from finish();
rollback;
