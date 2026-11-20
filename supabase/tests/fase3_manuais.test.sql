-- Testes da fase 3 (manuais, documentos e avisos).
-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
begin;

create schema tests;
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['admin', 'fr1', 'eq1', 'fr2', 'eq2', 'redeAc', 'redeSem', 'pend', 'pend2', 'inativoUn',
                  'frOff', 'eqOff', 'dono3', 'nova', 'novaEq', 'novoFr', 'eqApagar',
                  'legado', 'visit', 'visitMod', 'novaRede', 'eqOk', 'eqCrm', 'resp', 'respFalha', 'eqProibida', 'sem', 'redeZero', 'eqU2']) with ordinality as t(apelido, n);

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

-- Dados (como postgres: gatilhos e RLS não se aplicam) ------------------
insert into auth.users (id, email) select id, email from tests.pessoas;

insert into public.unidades (id, nome, cidade, responsavel, email, modulos_liberados, ativo) values
  ('un-1', 'Uberaba Centro', 'Uberaba', 'Dono Um', 'un1@ubox.test', '{manuais,crm,cliente}', true),
  ('un-2', 'Araxá', 'Araxá', 'Dono Dois', 'un2@ubox.test', '{manuais}', true),
  ('un-off', 'Desativada', 'Uberaba', 'Dono Off', 'off@ubox.test', '{manuais}', false),
  ('un-3', 'Só com dono', 'Uberaba', 'Dono Três', 'un3@ubox.test', '{}', true);

insert into public.usuarios (id, email, nome, papel, ativo, recusado, unidade_id, modulos_liberados, criado_por)
select tests.id(a), a || '@ubox.test', n, p::public.papel, at, false, u, m, null
from (values
  ('admin', 'Admin Rede', 'admin', true, null, '{}'::text[]),
  ('fr1', 'Franqueado Um', 'franqueado', true, 'un-1', '{manuais,crm}'),
  ('eq1', 'Equipe Um', 'equipe_franqueado', true, 'un-1', '{manuais}'),
  ('fr2', 'Franqueado Dois', 'franqueado', true, 'un-2', '{manuais}'),
  ('eq2', 'Equipe Dois', 'equipe_franqueado', true, 'un-2', '{manuais}'),
  ('redeAc', 'Consultor Rede', 'equipe_franqueadora', true, null, '{acompanhamento}'),
  ('redeSem', 'Rede Sem', 'equipe_franqueadora', true, null, '{manuais}'),
  ('pend', 'Pendente Um', 'franqueado', false, null, '{}'),
  ('pend2', 'Pendente Dois', 'franqueado', false, null, '{}'),
  ('inativoUn', 'Inativo Com Unidade', 'franqueado', false, 'un-1', '{}'),
  ('frOff', 'Franqueado Off', 'franqueado', true, 'un-off', '{manuais}'),
  ('eqOff', 'Equipe Off', 'equipe_franqueado', true, 'un-off', '{manuais}'),
  ('dono3', 'Dono Três', 'franqueado', true, null, '{}'),
  ('eqApagar', 'Equipe Apagar', 'equipe_franqueado', true, 'un-1', '{}')
) as v(a, n, p, at, u, m);
update public.unidades set uid = tests.id('dono3') where id = 'un-3';

-- Base extra da fase 2 (como postgres)
insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados) values
  (tests.id('legado'), 'legado@ubox.test', 'Franqueado Legado', 'franqueado', true, null, '{}'),
  (tests.id('eqCrm'), 'eqCrm@ubox.test', 'Equipe Crm', 'equipe_franqueado', true, 'un-1', '{manuais,crm}');
update public.unidades set uid = tests.id('fr1') where id = 'un-1';

update public.usuarios set modulos_liberados = '{manuais,universidade}', unidade = 'Uberaba Centro' where id in (tests.id('fr1'), tests.id('eq1'));
insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, unidade, modulos_liberados)
values (tests.id('sem'), 'sem@ubox.test', 'Sem Manuais', 'franqueado', true, 'un-1', 'Uberaba Centro', '{}'),
       (tests.id('redeZero'), 'redeZero@ubox.test', 'Rede Sem', 'equipe_franqueadora', true, null, '', '{}'),
       (tests.id('eqU2'), 'eqU2@ubox.test', 'Aluno Dois', 'equipe_franqueado', true, 'un-1', 'Uberaba Centro', '{universidade}');

select plan(123);

insert into public.documentos (id, titulo, categoria_id, status, publico)
select id, 'Manual ' || id, 'cat-1', 'publicado', true
from unnest(array['pub', 'man-1', 'man-2', 'man-3', 'doc-1']) as d(id);
insert into public.documentos (id, titulo, categoria_id, status, publico)
values ('rascunho', 'Rascunho', 'cat-1', 'rascunho', true),
       ('restrito', 'Restrito', 'cat-1', 'publicado', false);

insert into public.quizzes (id, titulo) values ('q1', 'Quiz legado');
insert into public.gabaritos (id, respostas) values ('g1', '[0]');
insert into public.quiz_gabaritos (gabarito_id, quiz_id, respostas) values ('item', 'q1', '[0]');
insert into public.tentativas (id, uid, quiz_id, nota) values
  ('t-fr1', tests.id('fr1'), 'q1', 80), ('t-ch', tests.id('fr2'), 'q1', 80);
insert into public.certificados (id, uid, trilha_id, nome, trilha_titulo, codigo, tentativa_id)
values ('c-ch', tests.id('fr2'), 'trilha', 'Dono Dois', 'Trilha', 'UBOX-001', 'sem-quiz');

insert into public.manuais_trilha (id, documento_id, titulo, ordem, anterior_id, tempo_minimo_seg, atualizado_por, atualizado_por_nome)
select id, id, 'Manual ' || id, ordem, anterior, 60, tests.id('admin'), 'Admin Rede'
from (values ('man-1', 1, ''), ('man-2', 2, 'man-1'), ('man-3', 3, 'man-2')) as d(id, ordem, anterior);
insert into public.progresso_manuais (id, uid, documento_id, nome, unidade_id, unidade_nome, status,
                                    iniciado_em, tempo_minimo_seg, concluido_em)
select tests.id('eq1') || '_' || doc, tests.id('eq1'), doc, 'Equipe Um', 'un-1', 'Uberaba Centro',
       status, now() - interval '2 hours', 60, concluido
from (values ('man-1', 'concluido', now() - interval '1 hour'), ('man-2', 'em_andamento', null)) as d(doc, status, concluido);

create function tests.iniciar_manual(a text, doc text, nome text, tempo int default 60,
                                    estado text default 'em_andamento', chave text default null)
returns void language sql as $$
  insert into public.progresso_manuais (id, uid, documento_id, nome, unidade_id, unidade_nome, status, tempo_minimo_seg)
  values (coalesce(chave, tests.id(a) || '_' || doc), tests.id(a), doc, nome, 'un-1', 'Uberaba Centro', estado, tempo)
$$;

select tests.entrar('admin');
select is((select count(*)::int from public.documentos where id = 'pub'), 1, '[regras] admin lê manual publicado');

select tests.entrar('fr1');
select is((select count(*)::int from public.documentos where id = 'pub'), 1, '[regras] franqueado com manuais lê o manual');

select tests.entrar('legado');
select is((select count(*)::int from public.documentos where id = 'pub'), 0, '[regras] franqueado sem lista não lê o manual');

select tests.entrar('redeSem');
select is((select count(*)::int from public.documentos where id = 'pub'), 1, '[regras] equipe da franqueadora com manuais lê o manual');

select tests.entrar('redeZero');
select is((select count(*)::int from public.documentos where id = 'pub'), 0, '[regras] equipe da franqueadora sem manuais não lê o manual');

select tests.entrar('eq1');
select is((select count(*)::int from public.documentos where id = 'pub'), 1, '[regras] equipe da unidade com manuais lê o manual');

select tests.entrar('eqApagar');
select is((select count(*)::int from public.documentos where id = 'pub'), 0, '[regras] equipe da unidade sem manuais não lê o manual');

select tests.entrar('inativoUn');
select is((select count(*)::int from public.documentos where id = 'pub'), 0, '[regras] inativo não lê o manual');

select tests.entrar('frOff');
select is((select count(*)::int from public.documentos where id = 'pub'), 0, '[regras] unidade desativada não lê o manual');
select tests.sair();
update public.usuarios set modulos_liberados = '{manuais}' where id = tests.id('legado');

select tests.entrar('legado');
select is((select count(*)::int from public.documentos where id = 'pub'), 0, '[regras] franqueado sem unidade não lê mesmo com módulos');
select tests.sair();
update public.usuarios set modulos_liberados = '{manuais}', unidade_id = 'un-1' where id = tests.id('legado');

select tests.entrar('legado');
select is((select count(*)::int from public.documentos where id = 'pub'), 1, '[regras] franqueado legado lê depois de ligado à unidade');

select tests.entrar('fr1');
select is((select count(*)::int from public.gabaritos), 0, '[regras] aluno com universidade não lê mais o gabarito legado');

select tests.entrar('fr1');
select is((select count(*)::int from public.quiz_gabaritos), 0, '[regras] aluno com universidade não lê o gabarito legado do quiz');

select tests.entrar('admin');
select is((select count(*)::int from public.gabaritos), 1, '[regras] admin lê o gabarito legado');

select tests.entrar('fr2');
select is((select count(*)::int from public.gabaritos), 0, '[regras] quem não tem universidade não lê o gabarito');

select tests.entrar('redeSem');
select is((select count(*)::int from public.quiz_gabaritos), 0, '[regras] equipe só de manuais não lê o gabarito do quiz');

select tests.entrar('fr1');
select is((select count(*)::int from public.tentativas where id = 't-fr1'), 1, '[regras] franqueado com universidade lê a própria tentativa');

select tests.entrar('fr2');
select is((select count(*)::int from public.tentativas where id = 't-ch'), 0, '[regras] sem universidade não lê a própria tentativa');

select tests.entrar('fr2');
select is((select count(*)::int from public.certificados where id = 'c-ch'), 0, '[regras] sem universidade não lê o próprio certificado');

select tests.entrar('fr1');
select is((select count(*)::int from public.manuais_trilha), 3, '[regras] franqueado lê a trilha de manuais');

select tests.entrar('sem');
select is((select count(*)::int from public.manuais_trilha), 0, '[regras] franqueado sem o módulo manuais não lê a trilha');

select tests.entrar('fr1');
select is((select count(*)::int from public.progresso_manuais where id = tests.id('fr1') || '_man-1'), 0, '[regras] franqueado lê o próprio progresso que ainda não existe');
select lives_ok($$select tests.iniciar_manual('fr1', 'man-1', 'Franqueado Um')$$, '[regras] franqueado grava o próprio progresso do primeiro manual');
select throws_ok($$select tests.iniciar_manual('eq1', 'man-3', 'Equipe Um')$$, '42501', null, '[regras] não grava progresso de outro uid');
select throws_ok($$select tests.iniciar_manual('fr1', 'man-1', 'Franqueado Um' , 60, 'em_andamento', 'qualquer')$$, '42501', null, '[regras] não cria progresso com id diferente de uid_documento');
select throws_ok($$select tests.iniciar_manual('fr1', 'man-2', 'Franqueado Um')$$, '42501', null, '[regras] não pula manual sem concluir o anterior');
select throws_ok($$select tests.iniciar_manual('fr1', 'man-3', 'Franqueado Um' , 60, 'concluido')$$, '42501', null, '[regras] não cria progresso já concluído');

select tests.entrar('eq1');
select throws_ok($$select tests.iniciar_manual('eq1', 'man-3', 'Equipe Um' , 30)$$, '42501', null, '[regras] não cria progresso com tempo mínimo diferente da trilha');

select tests.entrar('sem');
select throws_ok($$select tests.iniciar_manual('sem', 'man-1', 'Sem Manuais')$$, '42501', null, '[regras] franqueado sem o módulo não grava progresso');

select tests.entrar('fr1');
select throws_ok($$update public.progresso_manuais set status = 'concluido' where id = tests.id('fr1') || '_man-1'$$, '42501', null, '[regras] não conclui antes do tempo mínimo');
select is(tests.linhas($$update public.progresso_manuais set reinicios = 1 where id = tests.id('fr1') || '_man-1'$$), 1, '[regras] reinício zera o cronômetro do servidor');
select throws_ok($$update public.progresso_manuais set reinicios = 5 where id = tests.id('fr1') || '_man-1'$$, '42501', null, '[regras] reinício não pula o contador');
select throws_ok($$update public.progresso_manuais set iniciado_em = now() - interval '2 hours', reinicios = 2 where id = tests.id('fr1') || '_man-1'$$, '42501', null, '[regras] reinício não volta o iniciadoEm para o passado');
select is((select iniciado_em from public.progresso_manuais where id = tests.id('fr1') || '_man-1'), now(), 'cronômetro guarda a hora do servidor');

select tests.entrar('eq1');
select is(tests.linhas($$update public.progresso_manuais set status = 'concluido' where id = tests.id('eq1') || '_man-2'$$), 1, '[regras] conclui depois do tempo mínimo');
select throws_ok($$update public.progresso_manuais set status = 'em_andamento', reinicios = 1 where id = tests.id('eq1') || '_man-2'$$, '42501', null, '[regras] concluído não volta para em andamento');
select lives_ok($$select tests.iniciar_manual('eq1', 'man-3', 'Equipe Um')$$, '[regras] próximo manual abre depois de concluir o anterior');

select tests.entrar('fr1');
select is(tests.linhas($$update public.progresso_manuais set status = 'concluido' where id = tests.id('eq1') || '_man-3'$$), 0, '[regras] outra pessoa não conclui o progresso de alguém');

select tests.entrar('eq1');
select throws_ok($$delete from public.progresso_manuais where id = tests.id('eq1') || '_man-3'$$, '42501', null, '[regras] ninguém apaga progresso');

select tests.entrar('eq2');
select is((select count(*)::int from public.progresso_manuais where id = tests.id('eq1') || '_man-2'), 0, '[regras] equipe de outra unidade não lê progresso alheio');
select is((select count(*)::int from public.progresso_manuais where unidade_id = 'un-1'), 0, '[regras] equipe de outra unidade não lista a unidade alheia');

select tests.entrar('eq1');
-- RLS filtra o progresso dos colegas e preserva as linhas que pertencem à própria pessoa.
select is((select count(*)::int from public.progresso_manuais where unidade_id = 'un-1' and uid <> tests.id('eq1')), 0, '[regras] equipe da unidade não lista a unidade toda');
select is((select count(*)::int from public.progresso_manuais where uid = tests.id('eq1')), 3, '[regras] pessoa lista o próprio progresso');

select tests.entrar('fr1');
select is((select count(*)::int from public.progresso_manuais where unidade_id = 'un-1'), 4, '[regras] franqueado lista o progresso da própria unidade');

select tests.entrar('redeSem');
select is((select count(*)::int from public.progresso_manuais), 4, '[regras] franqueadora com o módulo lê o progresso da rede');

select tests.entrar('redeZero');
select is((select count(*)::int from public.progresso_manuais), 0, '[regras] franqueadora sem o módulo não lê o progresso da rede');

select tests.entrar('redeSem');
select is(tests.linhas($$update public.manuais_trilha set atualizado_por = tests.id('redeSem'), atualizado_por_nome = 'Rede Sem', tempo_minimo_seg = 120 where id = 'man-3'$$), 1, '[regras] franqueadora com o módulo configura a trilha');

select tests.entrar('admin');
select is(tests.linhas($$update public.manuais_trilha set atualizado_por = tests.id('admin'), atualizado_por_nome = 'Admin Rede', tempo_minimo_seg = 120 where id = 'man-3'$$), 1, '[regras] admin configura a trilha');

select tests.entrar('fr1');
select is(tests.linhas($$update public.manuais_trilha set atualizado_por = tests.id('fr1'), atualizado_por_nome = 'Franqueado Um', tempo_minimo_seg = 120 where id = 'man-3'$$), 0, '[regras] franqueado não configura a trilha');

select tests.entrar('redeZero');
select is(tests.linhas($$update public.manuais_trilha set atualizado_por = tests.id('redeZero'), atualizado_por_nome = 'Rede Sem', tempo_minimo_seg = 120 where id = 'man-3'$$), 0, '[regras] franqueadora sem o módulo não configura a trilha');

select tests.entrar('admin');
select throws_ok($$update public.manuais_trilha set atualizado_por = tests.id('admin'), atualizado_por_nome = 'Admin Rede', tempo_minimo_seg = 5 where id = 'man-3'$$, '42501', null, '[regras] trilha recusa tempo mínimo abaixo de 30 s');
select throws_ok($$insert into public.manuais_trilha (id, documento_id, titulo, ordem, tempo_minimo_seg, atualizado_por, atualizado_por_nome) values ('nao-existe', 'nao-existe', 'Manual inexistente', 1, 60, tests.id('admin'), 'Admin Rede')$$, '42501', null, '[regras] trilha recusa item de documento que não existe');

select tests.entrar('redeSem');
select throws_ok($$update public.manuais_trilha set atualizado_por = tests.id('redeSem'), atualizado_por_nome = 'Outro Nome', tempo_minimo_seg = 120 where id = 'man-3'$$, '42501', null, '[regras] trilha recusa nome do autor forjado');

select tests.entrar('admin');
select throws_ok($$delete from public.manuais_trilha where id = 'man-3'$$, '42501', null, '[regras] ninguém apaga item da trilha');

select tests.entrar('redeAc');
select ok((select count(*) from public.manuais_trilha) = 3 and (select count(*) from public.progresso_manuais) = 4, '[regras] ac: consultor lê progresso e trilha de manuais');

select tests.sair();

-- Curso e prova inexistentes não liberam reestudo nem certificado.
select tests.entrar('eqU2');
select throws_ok($$
  insert into public.reestudos (id, uid, curso_id, documento_id)
  values (tests.id('eqU2') || '_curso-a_1', tests.id('eqU2'), 'curso-a', 'man-1')
$$, '42501', null, 'reestudo é recusado para curso sem prova');
select throws_ok($$
  insert into public.certificados (id, uid, trilha_id, nome, trilha_titulo, codigo, tentativa_id)
  values (tests.id('eqU2') || '_curso-a', tests.id('eqU2'), 'curso-a', 'Aluno Dois',
          'Curso A', 'UBOX-ABC123', tests.id('eqU2') || '_curso-a_1_1')
$$, '42501', null, 'certificado de curso é recusado para curso inexistente');
select tests.sair();

-- Dados da Universidade, importados como postgres.
insert into public.cursos (id, titulo, descricao, ordem, aulas, publicado, atualizado_por, atualizado_por_nome)
values ('curso-a', 'Curso A', 'Abertura', 1, '{man-1}', true, tests.id('admin'), 'Admin Rede'),
       ('curso-rascunho', 'Rascunho', '', 2, '{}', false, tests.id('admin'), 'Admin Rede');
insert into public.provas (id, titulo, nota_minima, perguntas, total_perguntas, manual_retorno_id,
                           tempo_reestudo_seg, versao, publicado, atualizado_por, atualizado_por_nome)
values ('curso-a', 'Prova A', 75, '[{"id":"p1","enunciado":"Questão","opcoes":["A","B"]}]', 1, 'man-1', 60, 1, true, tests.id('admin'), 'Admin Rede');
insert into public.provas_gabarito (id, corretas, versao, atualizado_por)
values ('curso-a', '{0}', 1, tests.id('admin'));
insert into public.tentativas_prova (id, uid, curso_id, ciclo, numero, nome, unidade_id, unidade_nome, versao, aprovado, corrigido_em)
select tests.id(a) || '_curso-a_' || ciclo || '_' || numero, tests.id(a), 'curso-a',
       ciclo, numero, nome, 'un-1', 'Uberaba Centro', 1, aprovado, now()
from (values ('fr1', 1, 2, 'Franqueado Um', true), ('eqU2', 1, 3, 'Aluno Dois', false),
             ('eqU2', 9, 3, 'Aluno Dois', false)) d(a, ciclo, numero, nome, aprovado);
insert into public.reestudos (id, uid, curso_id, ciclo, documento_id)
values (tests.id('eqU2') || '_curso-a_1', tests.id('eqU2'), 'curso-a', 1, 'man-1');

select tests.entrar('fr1');
select throws_ok($$insert into public.reestudos (id, uid, curso_id, ciclo, documento_id) values (tests.id('fr1') || '_curso-a_1', tests.id('fr1'), 'curso-a', 1, 'man-1')$$, '42501', null, '[regras] reestudo só depois de reprovar 3x');

select tests.entrar('eqU2');
select throws_ok($$insert into public.reestudos (id, uid, curso_id, ciclo, documento_id) values (tests.id('eqU2') || '_curso-a_9', tests.id('eqU2'), 'curso-a', 9, 'man-2')$$, '42501', null, '[regras] reestudo precisa ser do manual de retorno');
select lives_ok($$insert into public.reestudos (id, uid, curso_id, ciclo, documento_id) values (tests.id('eqU2') || '_curso-a_9', tests.id('eqU2'), 'curso-a', 9, 'man-1')$$, 'aluno inicia reestudo do manual de retorno após terceira reprovação');
select is(tests.linhas($$update public.reestudos set reinicios = 1 where id = tests.id('eqU2') || '_curso-a_1'$$), 1, '[regras] reestudo não conclui sem o tempo (reinício recente)');
select throws_ok($$update public.reestudos set status = 'concluido' where id = tests.id('eqU2') || '_curso-a_1'$$, '42501', null, '[regras] reestudo recusa conclusão antes do tempo');
select tests.sair();
update public.reestudos set iniciado_em = now() - interval '2 hours' where id = tests.id('eqU2') || '_curso-a_1';

select tests.entrar('eqU2');
select is(tests.linhas($$update public.reestudos set status = 'concluido' where id = tests.id('eqU2') || '_curso-a_1'$$), 1, '[regras] reestudo conclui depois do tempo');

select tests.entrar('fr1');
select lives_ok($$insert into public.certificados (id, uid, trilha_id, nome, trilha_titulo, codigo, tentativa_id) values (tests.id('fr1') || '_curso-a', tests.id('fr1'), 'curso-a', 'Franqueado Um', 'Curso A', 'UBOX-ABC123', tests.id('fr1') || '_curso-a_1_2')$$, '[regras] aluno emite certificado do curso aprovado');

select tests.entrar('eqU2');
select throws_ok($$insert into public.certificados (id, uid, trilha_id, nome, trilha_titulo, codigo, tentativa_id) values (tests.id('eqU2') || '_curso-a', tests.id('eqU2'), 'curso-a', 'Aluno Dois', 'Curso A', 'UBOX-ABC123', tests.id('eqU2') || '_curso-a_1_3')$$, '42501', null, '[regras] não emite certificado com tentativa reprovada');
select throws_ok($$insert into public.certificados (id, uid, trilha_id, nome, trilha_titulo, codigo, tentativa_id) values (tests.id('eqU2') || '_curso-a', tests.id('eqU2'), 'curso-a', 'Aluno Dois', 'Curso A', 'UBOX-ABC123', tests.id('fr1') || '_curso-a_1_2')$$, '42501', null, '[regras] não emite certificado com tentativa alheia');

select tests.entrar('fr1');
select throws_ok($$insert into public.tentativas (id, uid, quiz_id, nota, aprovado) values ('t-novo', tests.id('fr1'), 'q1', 100, true)$$, '42501', null, '[regras] aluno não cria tentativa legada (nota do aparelho)');

-- Paridade de visibilidade, chaves de subcoleções e validações entre tabelas.
select tests.sair();
update public.documentos set leitura_obrigatoria = true where id = 'pub';
update public.documentos set uids = array[tests.id('eq1')], uids_extra = array[tests.id('fr1')]
where id = 'restrito';
insert into public.categorias (id, nome, publico)
values ('cat-legada', 'Categoria legada', null), ('cat-privada', 'Categoria privada', false);
insert into public.trilhas (id, titulo, publicado, publico, itens) values
  ('trilha-legada', 'Trilha legada', null, null, '[]'),
  ('trilha-rascunho', 'Trilha em edição', false, true, '[]'),
  ('sem-prova', 'Trilha só de leitura', true, true, '[{"tipo":"documento"}]'),
  ('com-prova', 'Trilha com quiz', true, true, '[{"tipo":"quiz"}]');
insert into public.avisos (id, titulo, publico, uids) values
  ('aviso-publico', 'Aviso público', true, '{}'),
  ('aviso-direcionado', 'Aviso direcionado', false, array[tests.id('eq1')]);
insert into public.usuarios (id, email, nome, papel, ativo)
values (tests.id('novaRede'), 'novaRede@ubox.test', 'Rede Universidade', 'equipe_franqueadora', true),
       (tests.id('nova'), 'nova@ubox.test', 'Admin Inativo', 'admin', false);
update public.usuarios set modulos_liberados = '{universidade}' where id = tests.id('novaRede');

select tests.entrar('admin');
select lives_ok($$
  insert into public.documento_versoes (documento_id, versao_id, titulo, autor_id)
  values ('pub', '1', 'Manual publicado', tests.id('admin')),
         ('restrito', '1', 'Manual restrito', tests.id('admin'))
$$, 'versões de documentos diferentes podem ter o mesmo id local');
select lives_ok($$
  insert into public.quizzes (id, titulo) values ('q2', 'Outro quiz');
  insert into public.quiz_gabaritos (quiz_id, gabarito_id, respostas)
  values ('q2', 'item', '[1]')
$$, 'gabaritos de quizzes diferentes podem ter o mesmo id local');
select is(tests.linhas($$
  update public.quiz_gabaritos set respostas = '[2]' where id = 'q2/gabarito/item'
$$), 1, 'admin pode editar respostas de gabarito legado');
select throws_ok($$
  update public.quiz_gabaritos set gabarito_id = 'outro' where id = 'q2/gabarito/item'
$$, '42501', null, 'admin não pode alterar o caminho do gabarito');
select throws_ok($$update public.documentos set criado_em = now() - interval '1 day' where id = 'pub'$$,
  '42501', null, 'admin não pode trocar a data de criação');
select throws_ok($$update public.avisos set titulo = 'Aviso alterado' where id = 'aviso-publico'$$,
  '42501', null, 'nem admin pode alterar um aviso');
select throws_ok($$
  insert into public.certificados (id, uid, trilha_id, nome, trilha_titulo, codigo, tentativa_id)
  values (tests.id('admin') || '_sem-prova', tests.id('admin'), 'sem-prova', 'Admin Rede',
          'Trilha só de leitura', 'UBOX-ABC123', 'sem-quiz')
$$, '42501', null, 'admin sem universidade não emite certificado');

select tests.entrar('fr1');
select is((select count(*)::int from public.categorias), 1, 'categoria legada sem público continua visível');
select is((select count(*)::int from public.trilhas), 3, 'trilha legada continua visível e rascunho fica oculto');
select is((select count(*)::int from public.documentos where id = 'restrito'), 0, 'uids_extra não concede leitura por si só');
select is((select count(*)::int from public.documento_versoes), 0, 'franqueado não lê versões');
select is((select count(*)::int from public.avisos), 1, 'franqueado lê apenas aviso da sua audiência');

select tests.entrar('eq1');
select is((select count(*)::int from public.documentos where id = 'restrito'), 1, 'uid materializado concede acesso ao publicado');
select is((select count(*)::int from public.avisos), 2, 'uid materializado concede acesso ao aviso direcionado');

select tests.entrar('sem');
select lives_ok($$
  insert into public.leituras (id, uid, documento_id, versao, lido_em)
  values (tests.id('sem') || '_pub_v1', tests.id('sem'), 'pub', 1, now() - interval '1 day')
$$, 'conta ativa sem manuais pode registrar leitura pública');
select is((select lido_em from public.leituras where id = tests.id('sem') || '_pub_v1'), now(), 'data da leitura é carimbada no servidor');
select throws_ok($$
  insert into public.leituras (id, uid, documento_id, versao)
  values (tests.id('sem') || '_pub_v2', tests.id('sem'), 'pub', 2)
$$, '42501', null, 'leitura exige a versão publicada atual');
select throws_ok($$
  insert into public.leituras (id, uid, documento_id, versao)
  values (tests.id('sem') || '_rascunho_v1', tests.id('sem'), 'rascunho', 1)
$$, '42501', null, 'leitura não registra rascunho');
select throws_ok($$
  insert into public.leituras (id, uid, documento_id, versao)
  values (tests.id('sem') || '_restrito_v1', tests.id('sem'), 'restrito', 1)
$$, '42501', null, 'leitura respeita a audiência');
select lives_ok($$
  insert into public.aceites (id, uid, documento_id, versao, nome, email, texto)
  values (tests.id('sem') || '_pub_v1', tests.id('sem'), 'pub', 1, 'Sem Manuais', 'sem@ubox.test', 'Li e concordo')
$$, 'aceite da versão obrigatória é permitido');
select throws_ok($$
  insert into public.aceites (id, uid, documento_id, versao, nome, email, texto)
  values (tests.id('sem') || '_man-1_v1', tests.id('sem'), 'man-1', 1, 'Sem Manuais', 'sem@ubox.test', 'Li e concordo')
$$, '42501', null, 'aceite exige documento de leitura obrigatória');
select throws_ok($$
  insert into public.aceites (id, uid, documento_id, versao, nome, email, texto)
  values (tests.id('sem') || '_pub_v1', tests.id('sem'), 'pub', 1, 'Sem Manuais', 'outro@ubox.test', 'Li e concordo')
$$, '42501', null, 'aceite exige o e-mail da sessão');
select lives_ok($$
  insert into public.avisos_leituras (id, uid, aviso_id)
  values (tests.id('sem') || '_aviso-publico', tests.id('sem'), 'aviso-publico')
$$, 'conta ativa sem manuais registra leitura de aviso');

select tests.entrar('fr1');
select lives_ok($$
  insert into public.certificados (id, uid, trilha_id, nome, trilha_titulo, codigo, tentativa_id)
  values (tests.id('fr1') || '_sem-prova', tests.id('fr1'), 'sem-prova', 'Franqueado Um',
          'Trilha só de leitura', 'UBOX-ABC123', 'sem-quiz')
$$, 'trilha legada sem quiz permite certificado sem tentativa');
select throws_ok($$
  insert into public.certificados (id, uid, trilha_id, nome, trilha_titulo, codigo, tentativa_id)
  values (tests.id('fr1') || '_com-prova', tests.id('fr1'), 'com-prova', 'Franqueado Um',
          'Trilha com quiz', 'UBOX-ABC123', 'sem-quiz')
$$, '42501', null, 'trilha legada com quiz exige tentativa aprovada');

select tests.entrar('redeSem');
select is((select count(*)::int from public.documentos where id in ('rascunho', 'restrito')), 0,
  'franqueadora com manuais não lê rascunho nem publicado fora da audiência');
select is((select count(*)::int from public.reestudos), 0, 'franqueadora sem universidade não lê reestudos');
select is((select count(*)::int from public.leituras), 0, 'franqueadora não lê leituras alheias');
select is((select count(*)::int from public.aceites), 0, 'franqueadora não lê aceites alheios');
select is((select count(*)::int from public.avisos_leituras), 0, 'franqueadora não lê confirmações alheias de avisos');

select tests.entrar('novaRede');
select is((select count(*)::int from public.reestudos), 2, 'franqueadora com universidade lê reestudos da rede');
select is((select count(*)::int from public.quizzes), 0, 'franqueadora com universidade não lê quizzes legados');
select is((select count(*)::int from public.quiz_gabaritos), 0, 'franqueadora com universidade não lê gabarito de quiz legado');
select is((select count(*)::int from public.gabaritos), 0, 'franqueadora com universidade não lê gabarito legado');
select is((select count(*)::int from public.tentativas), 0, 'franqueadora com universidade não lê tentativas legadas alheias');
select is((select count(*)::int from public.certificados), 0, 'franqueadora com universidade não lê certificados alheios');

select tests.entrar('nova');
select is((select count(*)::int from public.documentos), 0, 'admin inativo não lê nem manuais publicados');
select is((select count(*)::int from public.gabaritos), 0, 'admin inativo não lê gabaritos');
select is((select count(*)::int from public.progresso_manuais), 0, 'admin inativo não lê progresso alheio');
select is((select count(*)::int from public.reestudos), 0, 'admin inativo não lê reestudos alheios');

select tests.anonimo();
select throws_ok(format('select * from public.%I', tabela), '42501', null, 'anon não lê ' || tabela)
from unnest(array[
  'categorias', 'documentos', 'documento_versoes', 'trilhas', 'quizzes', 'quiz_gabaritos', 'gabaritos',
  'avisos', 'leituras', 'aceites', 'tentativas', 'certificados', 'avisos_leituras',
  'manuais_trilha', 'progresso_manuais', 'reestudos'
]) as t(tabela);
select tests.sair();

select * from finish();
rollback;
