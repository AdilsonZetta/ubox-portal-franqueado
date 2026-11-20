-- Testes da fase 4 (Universidade).
-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
begin;

create schema tests;
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['admin', 'aluno', 'aluno2', 'aluno3', 'sem', 'dono', 'outro', 'rede', 'redeSem', 'consultor', 'adminInativo']) with ordinality as t(apelido, n);

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

select plan(106);

insert into auth.users (id, email) select id, email from tests.pessoas;
insert into public.unidades (id, nome, cidade, responsavel, email, ativo) values
 ('uni', 'Unidade Uni', 'Uberaba', 'Dono Uni', 'uni@ubox.test', true),
 ('outra', 'Outra Unidade', 'Uberaba', 'Outro Dono', 'outra@ubox.test', true);
insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, unidade, modulos_liberados)
select tests.id(a), a || '@ubox.test', n, p::public.papel, a <> 'adminInativo', u,
       case u when 'uni' then 'Unidade Uni' when 'outra' then 'Outra Unidade' else '' end, m
from (values
 ('admin', 'Admin Rede', 'admin', null, '{}'::text[]),
 ('adminInativo', 'Admin Inativo', 'admin', null, '{}'),
 ('aluno', 'Aluno Uni', 'equipe_franqueado', 'uni', '{universidade}'),
 ('aluno2', 'Aluno Dois', 'equipe_franqueado', 'uni', '{universidade}'),
 ('aluno3', 'Aluno Tres', 'equipe_franqueado', 'uni', '{universidade}'),
 ('sem', 'Sem Uni', 'equipe_franqueado', 'uni', '{}'),
 ('dono', 'Dono Uni', 'franqueado', 'uni', '{universidade}'),
 ('outro', 'Outro Dono', 'franqueado', 'outra', '{universidade}'),
 ('rede', 'Rede Uni', 'equipe_franqueadora', null, '{universidade}'),
 ('redeSem', 'Rede Sem', 'equipe_franqueadora', null, '{}'),
 ('consultor', 'Consultor Rede', 'equipe_franqueadora', null, '{acompanhamento}')
) v(a,n,p,u,m);

create function tests.perguntas(total integer) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('id', 'p' || n, 'enunciado', 'Questão ' || n,
    'opcoes', jsonb_build_array('A','B','C','D')) order by n)
  from generate_series(1,total) n
$$;
grant execute on function tests.perguntas(integer) to authenticated;

insert into public.cursos (id, titulo, descricao, ordem, aulas, publicado, atualizado_por, atualizado_por_nome)
values ('curso-a', 'Curso A', 'Abertura', 1, '{man-1}', true, tests.id('admin'), 'Admin Rede'),
       ('curso-rascunho', 'Rascunho', '', 2, '{}', false, tests.id('admin'), 'Admin Rede');
insert into public.provas (id, titulo, nota_minima, perguntas, total_perguntas, manual_retorno_id,
                           tempo_reestudo_seg, versao, publicado, atualizado_por, atualizado_por_nome)
values ('curso-a', 'Prova A', 75, tests.perguntas(4), 4, 'man-1', 60, 1, true, tests.id('admin'), 'Admin Rede');
insert into public.provas_gabarito (id, corretas, versao, atualizado_por)
values ('curso-a', '{1,0,3,2}', 1, tests.id('admin'));
insert into public.tentativas_prova (id, uid, curso_id, ciclo, numero, nome, unidade_id, unidade_nome, versao, aprovado, corrigido_em)
select tests.id('aluno2') || '_curso-a_' || ciclo || '_' || numero, tests.id('aluno2'),
  'curso-a', ciclo, numero, 'Aluno Dois', 'uni', 'Unidade Uni', 1, false, now()
from (values (1,1), (1,2), (1,3), (9,3)) v(ciclo, numero);
insert into public.reestudos (id, uid, curso_id, ciclo, documento_id)
values (tests.id('aluno2') || '_curso-a_1', tests.id('aluno2'), 'curso-a', 1, 'man-1');
insert into public.certificados (id, uid, trilha_id, nome, trilha_titulo, codigo, tentativa_id)
values (tests.id('sem') || '_curso-a', tests.id('sem'), 'curso-a', 'Sem Uni',
        'Curso A', 'UBOX-SEM123', tests.id('sem') || '_curso-a_1_1');

-- Força as restrições adiadas dentro da asserção pgTAP. A transação externa
-- do arquivo termina em rollback, enquanto no uso real elas rodam no commit.
create function tests.enviar(a text, ciclo integer, numero integer, respostas integer[],
                            versao integer default 1, aprovado boolean default null,
                            versao_folha integer default null) returns void language plpgsql as $$
declare
  chave text := tests.id(a) || '_curso-a_' || ciclo || '_' || numero;
begin
  insert into public.tentativas_prova (id, uid, curso_id, ciclo, numero, nome, unidade_id, unidade_nome, versao, aprovado)
  select chave, tests.id(a), 'curso-a', ciclo, numero, v.nome, 'uni', 'Unidade Uni', versao, aprovado
  from (values ('aluno', 'Aluno Uni'), ('aluno2', 'Aluno Dois'), ('aluno3', 'Aluno Tres'), ('sem', 'Sem Uni')) v(apelido, nome)
  where v.apelido = a;
  insert into public.tentativas_prova_folha (tentativa_id, uid, versao, respostas)
  values (chave, tests.id(a), coalesce(versao_folha, versao), respostas);
  set constraints public.tentativa_folha_fk immediate;
  set constraints public.tentativa_folha_fk deferred;
end $$;

create function tests.publicar(versao integer, perguntas jsonb, corretas integer[], nota integer default 70)
returns void language plpgsql as $$
begin
  insert into public.provas (id, titulo, nota_minima, perguntas, total_perguntas, manual_retorno_id,
                             tempo_reestudo_seg, versao, publicado, atualizado_por, atualizado_por_nome)
  values ('curso-b', 'Prova B', nota, perguntas, 2, 'man-2', 120, versao, true, auth.uid(), (app.perfil()).nome)
  on conflict (id) do update set versao = excluded.versao, perguntas = excluded.perguntas,
    nota_minima = excluded.nota_minima, atualizado_por = excluded.atualizado_por,
    atualizado_por_nome = excluded.atualizado_por_nome;
  insert into public.provas_gabarito (id, corretas, versao, atualizado_por)
  values ('curso-b', corretas, versao, auth.uid())
  on conflict (id) do update set versao = excluded.versao, corretas = excluded.corretas,
    atualizado_por = excluded.atualizado_por;
  set constraints public.prova_gabarito_fk, public.gabarito_prova_fk immediate;
  set constraints public.prova_gabarito_fk, public.gabarito_prova_fk deferred;
end $$;

select tests.entrar('aluno');
select is((select count(*)::int from public.cursos where id = 'curso-a'), 1, '[regras] aluno lê curso publicado');
select is((select count(*)::int from public.cursos where publicado), 1, '[regras] aluno lista cursos publicados');
select is((select count(*)::int from public.cursos where id = 'curso-rascunho'), 0, '[regras] aluno não lê curso em rascunho');
select is((select count(*)::int from public.provas where id = 'curso-a' and not (perguntas -> 0 ? 'correta')), 1, '[regras] aluno lê a prova publicada (sem respostas)');
select is((select count(*)::int from public.provas_gabarito where id = 'curso-a'), 0, '[regras] aluno NUNCA lê o gabarito');
select is((select count(*)::int from public.provas_gabarito), 0, '[regras] aluno não lista gabaritos');
select is((select count(*)::int from public.tentativas_prova where id = tests.id('aluno') || '_curso-a_1_1'), 0, '[regras] aluno lê a própria tentativa que ainda não existe');

select tests.entrar('sem');
select is((select count(*)::int from public.cursos where id = 'curso-a'), 0, '[regras] sem universidade não lê cursos');
select is((select count(*)::int from public.certificados where id = auth.uid() || '_curso-a'), 0, '[regras] sem universidade não lê o próprio certificado');
select throws_ok($$select tests.enviar('sem', 1, 1, '{0,1,0,0}')$$, '42501', null, '[regras] sem universidade não envia prova');

select tests.entrar('dono');
select is((select count(*)::int from public.provas_gabarito where id = 'curso-a'), 0, '[regras] franqueado NUNCA lê o gabarito');

select tests.entrar('rede');
select is((select count(*)::int from public.provas_gabarito where id = 'curso-a'), 1, '[regras] franqueadora com universidade lê o gabarito');

select tests.entrar('redeSem');
select is((select count(*)::int from public.provas_gabarito where id = 'curso-a'), 0, '[regras] franqueadora sem universidade não lê o gabarito');

select tests.entrar('aluno');
select throws_ok($$select tests.enviar('aluno', 1, 2, '{0,1,0,0}')$$, '42501', null, '[regras] aluno não pula para a 2ª tentativa');
select throws_ok($$select tests.enviar('aluno', 1, 1, '{0,1,0,0}', 1, true)$$, '42501', null, '[regras] aluno não cria tentativa já aprovada');
select throws_ok($$select tests.enviar('aluno', 1, 1, '{0,1}')$$, '42501', null, '[regras] aluno não cria tentativa com número de respostas errado');
select throws_ok($$select tests.enviar('aluno3', 1, 1, '{0,1,0,0}')$$, '42501', null, '[regras] aluno não cria tentativa em nome de outro');
select lives_ok($$select tests.enviar('aluno', 1, 1, '{0,1,0,0}')$$, '[regras] aluno envia a 1ª tentativa');
select is((select criado_em from public.tentativas_prova where id = auth.uid() || '_curso-a_1_1'), now(), 'envio é carimbado pelo servidor');
select throws_ok($$update public.tentativas_prova set aprovado = false, unidade_id = 'outra' where id = auth.uid() || '_curso-a_1_1'$$, '42501', null, 'correção não altera os dados do envio');
select throws_ok($$select tests.enviar('aluno', 1, 1, '{1,0,3,2}')$$, '23505', null, '[regras] aluno não reenvia a mesma tentativa');
select throws_ok($$select tests.enviar('aluno', 1, 2, '{0,1,0,0}')$$, '42501', null, '[regras] 2ª tentativa só depois de corrigir a 1ª');
select throws_ok($$update public.tentativas_prova set aprovado = true where id = tests.id('aluno') || '_curso-a_1_1'$$, '42501', null, '[regras] rules recusam aprovar resposta errada');
select throws_ok($$update public.tentativas_prova_folha set respostas = '{1,0,3,2}' where tentativa_id = tests.id('aluno') || '_curso-a_1_1'$$, '42501', null, '[regras] aluno não troca as respostas na correção');
select is(tests.linhas($$update public.tentativas_prova set aprovado = false where id = tests.id('aluno') || '_curso-a_1_1'$$), 1, '[regras] rules aceitam a reprovação correta');
select is((select corrigido_em from public.tentativas_prova where id = auth.uid() || '_curso-a_1_1'), now(), 'correção é carimbada pelo servidor');
select throws_ok($$update public.tentativas_prova set aprovado = true where id = tests.id('aluno') || '_curso-a_1_1'$$, '42501', null, '[regras] tentativa corrigida é imutável');
select throws_ok($$delete from public.tentativas_prova where id = tests.id('aluno') || '_curso-a_1_1'$$, '42501', null, '[regras] ninguém apaga tentativa');
select lives_ok($$select tests.enviar('aluno', 1, 2, '{1,0,3,0}')$$, '[regras] aluno envia a 2ª tentativa (3 de 4 certas)');
select throws_ok($$update public.tentativas_prova set aprovado = false where id = tests.id('aluno') || '_curso-a_1_2'$$, '42501', null, '[regras] rules recusam reprovar quem atingiu a nota');
select is(tests.linhas($$update public.tentativas_prova set aprovado = true where id = tests.id('aluno') || '_curso-a_1_2'$$), 1, '[regras] rules aprovam quem atingiu a nota mínima');
select throws_ok($$select tests.enviar('aluno', 1, 3, '{0,1,0,0}')$$, '42501', null, '[regras] depois de aprovado não abre a 3ª');
select throws_ok($$insert into public.reestudos (id, uid, curso_id, ciclo, documento_id) values (tests.id('aluno') || '_curso-a_1', tests.id('aluno'), 'curso-a', 1, 'man-1')$$, '42501', null, '[regras] reestudo só depois de reprovar 3x');

select tests.entrar('aluno2');
select throws_ok($$select tests.enviar('aluno2', 1, 4, '{0,1,0,0}')$$, '23514', null, '[regras] não existe 4ª tentativa no ciclo');
select throws_ok($$select tests.enviar('aluno2', 2, 1, '{0,1,0,0}')$$, '42501', null, '[regras] reprovado 3x não abre ciclo novo sem reestudar');
select throws_ok($$insert into public.reestudos (id, uid, curso_id, ciclo, documento_id) values (tests.id('aluno2') || '_curso-a_9', tests.id('aluno2'), 'curso-a', 9, 'man-2')$$, '42501', null, '[regras] reestudo precisa ser do manual de retorno');
select is(tests.linhas($$update public.reestudos set reinicios = 1 where id = tests.id('aluno2') || '_curso-a_1'$$), 1, '[regras] reestudo não conclui sem o tempo (reinício recente)');
select throws_ok($$update public.reestudos set status = 'concluido' where id = tests.id('aluno2') || '_curso-a_1'$$, '42501', null, '[regras] reestudo recusa conclusão antes do tempo');

select tests.sair();
update public.reestudos set iniciado_em = now() - interval '2 hours' where id = tests.id('aluno2') || '_curso-a_1';

select tests.entrar('aluno2');
select is(tests.linhas($$update public.reestudos set status = 'concluido' where id = tests.id('aluno2') || '_curso-a_1'$$), 1, '[regras] reestudo conclui depois do tempo');
select lives_ok($$select tests.enviar('aluno2', 2, 1, '{1,0,3,2}')$$, '[regras] depois do reestudo abre o ciclo 2');
select is(tests.linhas($$update public.tentativas_prova set aprovado = true where id = tests.id('aluno2') || '_curso-a_2_1'$$), 1, '[regras] ciclo 2 aprova com tudo certo');

select tests.entrar('dono');
select is((select count(*)::int from public.tentativas_prova where unidade_id = 'uni'), 7, '[regras] franqueado vê resultados da própria equipe');
select is((select count(*)::int from public.tentativas_prova where id = tests.id('aluno') || '_curso-a_1_1'), 1, '[regras] franqueado da unidade lê a tentativa (pai) da equipe');
select is((select count(*)::int from public.tentativas_prova_folha where tentativa_id = tests.id('aluno') || '_curso-a_1_1'), 0, '[regras] franqueado da unidade NÃO lê a folha de respostas da equipe');
select ok((select count(*) > 0 and bool_and(not (to_jsonb(t) ? 'respostas')) from public.tentativas_prova t where unidade_id = 'uni'), '[regras] consulta da equipe não traz respostas');
select throws_ok($$insert into public.cursos (id, titulo, descricao, ordem, aulas, publicado, atualizado_por, atualizado_por_nome) values ('curso-c', 'Curso Novo', 'Novo', 3, '{}', true, tests.id('dono'), 'Dono Uni')$$, '42501', null, '[regras] franqueado não cria curso');

select tests.entrar('outro');
select is((select count(*)::int from public.tentativas_prova where unidade_id = 'uni'), 0, '[regras] franqueado de outra unidade não vê resultados');

select tests.entrar('aluno');
select is((select count(*)::int from public.tentativas_prova where unidade_id = 'uni' and uid <> auth.uid()), 0, '[regras] equipe não vê resultados da unidade inteira');
select is((select count(*)::int from public.tentativas_prova where uid = auth.uid()), 2, '[regras] aluno lista as próprias tentativas');
select is((select count(*)::int from public.tentativas_prova_folha where tentativa_id = tests.id('aluno') || '_curso-a_1_1'), 1, '[regras] dono lê a própria folha');

select tests.entrar('aluno2');
select is((select count(*)::int from public.tentativas_prova_folha where tentativa_id = tests.id('aluno') || '_curso-a_1_1'), 0, '[regras] outro aluno da unidade não lê a folha alheia');
select throws_ok($$insert into public.tentativas_prova_folha values (tests.id('aluno2') || '_curso-a_1_1', auth.uid(), 1, '{1,0,3,2}')$$, '42501', null, '[regras] folha não pode ser criada depois da tentativa');

select tests.entrar('rede');
select is((select count(*)::int from public.tentativas_prova), 7, '[regras] franqueadora vê resultados da rede');
select is((select count(*)::int from public.tentativas_prova_folha where tentativa_id = tests.id('aluno') || '_curso-a_1_1'), 1, '[regras] franqueadora lê a folha');
select lives_ok($$insert into public.cursos (id, titulo, descricao, ordem, aulas, publicado, atualizado_por, atualizado_por_nome) values ('curso-b', 'Curso Novo', 'Novo', 3, '{}', true, tests.id('rede'), 'Rede Uni')$$, '[regras] franqueadora cria curso');
select lives_ok($$select tests.publicar(1, tests.perguntas(2), '{0,1}')$$, '[regras] franqueadora publica prova + gabarito no mesmo lote');
select throws_ok($$update public.provas set versao = 2 where id = 'curso-b'; set constraints public.prova_gabarito_fk immediate$$, '23503', null, '[regras] prova sozinha (sem gabarito na mesma versão) é recusada');
select throws_ok($$select tests.publicar(2, jsonb_set(tests.perguntas(2), '{0,correta}', '1'), '{0,1}')$$, '23514', null, '[regras] prova recusa pergunta com resposta embutida');
select throws_ok($$select tests.publicar(2, tests.perguntas(2), '{0,1,1}')$$, '23503', null, '[regras] gabarito precisa ter o mesmo número de questões');
select throws_ok($$select tests.publicar(2, tests.perguntas(2), '{0,1}', 120)$$, '23514', null, '[regras] nota mínima acima de 100 é recusada');
select throws_ok($$select tests.publicar(2, jsonb_set(tests.perguntas(2), '{0,opcoes}', '["a",7]'), '{0,1}')$$, '23514', null, '[regras] prova recusa alternativa não-texto');
select throws_ok($$select tests.publicar(2, jsonb_set(tests.perguntas(2), '{0,opcoes}', '["a",""]'), '{0,1}')$$, '23514', null, '[regras] prova recusa alternativa vazia');
select throws_ok($$select tests.publicar(2, jsonb_set(tests.perguntas(2), '{0,opcoes}', jsonb_build_array('a', repeat('x', 301))), '{0,1}')$$, '23514', null, '[regras] prova recusa alternativa gigante');
select throws_ok($$select tests.publicar(2, jsonb_set(tests.perguntas(2), '{0,opcoes}', '["a",{"correta":true}]'), '{0,1}')$$, '23514', null, '[regras] prova recusa alternativa em mapa');
select lives_ok($$select tests.publicar(2, tests.perguntas(2), '{0,1}')$$, '[regras] prova com alternativas válidas na versão 2');
select throws_ok($$select tests.publicar(4, tests.perguntas(2), '{0,1}')$$, '42501', null, 'versão da prova não pode saltar');

select tests.entrar('dono');
select throws_ok($$select tests.publicar(3, tests.perguntas(2), '{0,1}')$$, '42501', null, '[regras] franqueado não publica prova');

select tests.entrar('aluno3');
select throws_ok($$insert into public.tentativas_prova (id, uid, curso_id, ciclo, numero, nome, unidade_id, unidade_nome, versao) values (tests.id('aluno3') || '_curso-a_1_1', auth.uid(), 'curso-a', 1, 1, 'Aluno Tres', 'uni', 'Unidade Uni', 1); set constraints public.tentativa_folha_fk immediate$$, '23503', null, '[regras] tentativa sem folha de respostas é recusada');
select throws_ok($$insert into public.tentativas_prova_folha (tentativa_id, uid, versao, respostas, correta) values (tests.id('aluno3') || '_curso-a_1_1', auth.uid(), 1, '{1,0,3,2}', 1)$$, '42703', null, '[regras] folha com campo extra é recusada');
select throws_ok($$select tests.enviar('aluno3', 1, 1, '{0,1,0,0}', 1, null, 9)$$, '42501', null, '[regras] folha com versão diferente da tentativa é recusada');
select throws_ok($$insert into public.tentativas_prova (respostas) values (array[1,0,3,2])$$, '42703', null, '[regras] tentativa não aceita respostas no doc pai');
select lives_ok($$select tests.enviar('aluno3', 1, 1, '{1,0,3,2}')$$, '[regras] aluno 3 envia a 1ª tentativa (certa)');

select tests.sair();
update public.provas set versao = 2 where id = 'curso-a';
update public.provas_gabarito set versao = 2 where id = 'curso-a';

select tests.entrar('aluno3');
select throws_ok($$update public.tentativas_prova set aprovado = true where id = tests.id('aluno3') || '_curso-a_1_1'$$, '42501', null, '[regras] versão mudou: rules não aprovam mesmo com tudo certo');
select is(tests.linhas($$update public.tentativas_prova set aprovado = false where id = tests.id('aluno3') || '_curso-a_1_1'$$), 1, '[regras] versão mudou: dono fecha como reprovada (perde a chance)');
select throws_ok($$select tests.enviar('aluno3', 1, 2, '{0,1,0,0}')$$, '42501', null, '[regras] envio com versão antiga da prova é recusado');
select lives_ok($$select tests.enviar('aluno3', 1, 2, '{1,0,3,2}', 2)$$, '[regras] envio na versão nova é aceito');

select tests.entrar('dono');
select is(tests.linhas($$update public.tentativas_prova set aprovado = false where id = tests.id('aluno3') || '_curso-a_1_2'$$), 0, '[regras] franqueado não fecha tentativa pendente');

select tests.entrar('rede');
select throws_ok($$update public.tentativas_prova set aprovado = true where id = tests.id('aluno3') || '_curso-a_1_2'$$, '42501', null, '[regras] franqueadora não aprova tentativa pendente');
select is(tests.linhas($$update public.tentativas_prova set aprovado = false where id = tests.id('aluno3') || '_curso-a_1_2'$$), 1, '[regras] franqueadora fecha tentativa pendente como reprovada');
select throws_ok($$update public.tentativas_prova set aprovado = false where id = tests.id('aluno3') || '_curso-a_1_2'$$, '42501', null, '[regras] franqueadora não reabre tentativa corrigida');

select tests.entrar('aluno');
select lives_ok($$insert into public.certificados (id, uid, trilha_id, nome, trilha_titulo, codigo, tentativa_id) values (tests.id('aluno') || '_curso-a', tests.id('aluno'), 'curso-a', 'Aluno Uni', 'Curso A', 'UBOX-ABC123', tests.id('aluno') || '_curso-a_1_2')$$, '[regras] aluno emite certificado do curso aprovado');
select throws_ok($$insert into public.tentativas (id, uid, quiz_id, nota, aprovado) values ('t-novo', auth.uid(), 'q1', 100, true)$$, '42501', null, '[regras] aluno não cria tentativa legada (nota do aparelho)');

select tests.entrar('aluno2');
select throws_ok($$insert into public.certificados (id, uid, trilha_id, nome, trilha_titulo, codigo, tentativa_id) values (tests.id('aluno2') || '_curso-a', tests.id('aluno2'), 'curso-a', 'Aluno Dois', 'Curso A', 'UBOX-ABC123', tests.id('aluno2') || '_curso-a_1_3')$$, '42501', null, '[regras] não emite certificado com tentativa reprovada');
select throws_ok($$insert into public.certificados (id, uid, trilha_id, nome, trilha_titulo, codigo, tentativa_id) values (tests.id('aluno2') || '_curso-a', tests.id('aluno2'), 'curso-a', 'Aluno Dois', 'Curso A', 'UBOX-ABC123', tests.id('aluno') || '_curso-a_1_2')$$, '42501', null, '[regras] não emite certificado com tentativa alheia');

select tests.entrar('consultor');
select is((select count(*)::int from public.tentativas_prova), 9, '[regras] ac: consultor lê tentativas da Universidade');
select is((select count(*)::int from public.tentativas_prova_folha where tentativa_id = tests.id('aluno') || '_curso-a_1_1'), 0, '[regras] ac: consultor não lê a folha de respostas');
select is((select count(*)::int from public.provas_gabarito), 0, '[regras] ac: consultor não lê gabaritos');
select is((select count(*)::int from public.cursos where publicado), 2, '[regras] ac: consultor lê cursos publicados');
-- Uma consulta SQL sem filtro continua sujeita ao RLS.
select is((select count(*)::int from public.cursos), 2, '[regras] ac: consultor não lista cursos sem filtrar publicados');
select is((select count(*)::int from public.cursos where id = 'curso-rascunho'), 0, '[regras] ac: consultor não lê curso em preparo');

select tests.entrar('admin');
select is((select count(*)::int from public.provas_gabarito), 2, 'admin ativo lê o gabarito');
select is((select count(*)::int from public.tentativas_prova_folha where tentativa_id = tests.id('aluno') || '_curso-a_1_1'), 1, 'admin ativo lê a folha');

select tests.entrar('adminInativo');
select is((select count(*)::int from public.provas_gabarito), 0, 'admin inativo não lê gabarito');
select is((select count(*)::int from public.tentativas_prova_folha), 0, 'admin inativo não lê folha');

select tests.entrar('redeSem');
select is((select count(*)::int from public.tentativas_prova_folha), 0, 'franqueadora sem universidade não lê folha');

select tests.entrar('aluno2');
select lives_ok($$insert into public.reestudos (id, uid, curso_id, ciclo, documento_id, iniciado_em) values (tests.id('aluno2') || '_curso-a_9', tests.id('aluno2'), 'curso-a', 9, 'man-1', now() - interval '2 hours')$$, 'reestudo aceita envio com data antiga e a substitui');
select is((select iniciado_em from public.reestudos where id = tests.id('aluno2') || '_curso-a_9'), now(), 'servidor define início no insert');
select is(tests.linhas($$update public.reestudos set reinicios = 1, iniciado_em = now() - interval '2 hours' where id = tests.id('aluno2') || '_curso-a_9'$$), 1, 'reinício aceita data enviada pelo cliente');
select is((select iniciado_em from public.reestudos where id = tests.id('aluno2') || '_curso-a_9'), now(), 'servidor redefine início no reinício');
select tests.anonimo();
select throws_ok($$select * from public.cursos$$, '42501', null, 'anônimo não lê cursos');
select throws_ok($$select * from public.provas$$, '42501', null, 'anônimo não lê provas');
select throws_ok($$select * from public.provas_gabarito$$, '42501', null, 'anônimo não lê provas_gabarito');
select throws_ok($$select * from public.tentativas_prova$$, '42501', null, 'anônimo não lê tentativas_prova');
select throws_ok($$select * from public.tentativas_prova_folha$$, '42501', null, 'anônimo não lê tentativas_prova_folha');
select throws_ok($$select * from public.reestudos$$, '42501', null, 'anônimo não lê reestudos');
select throws_ok($$select * from public.certificados$$, '42501', null, 'anônimo não lê certificados');

select tests.sair();
select * from finish();
rollback;
