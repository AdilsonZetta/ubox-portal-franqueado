-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
begin;

create schema tests;
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['admin', 'fr1', 'eq1', 'fr2', 'redeSem', 'consultor', 'auditor', 'auditor2', 'inativo', 'auditorInativo']) with ordinality as t(apelido, n);

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

insert into auth.users (id, email) select id, email from tests.pessoas;

insert into public.unidades (id, nome, responsavel, email, ativo) values
  ('un-au', 'Unidade Au', 'Dono Au', 'um@ubox.test', true),
  ('un-au2', 'Outra Au', 'Dono Outra Au', 'dois@ubox.test', true);

insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, unidade, modulos_liberados)
select tests.id(a), a || '@ubox.test', n, p::public.papel, at, u,
  coalesce((select nome from public.unidades where id = u), ''), m
from (values
  ('admin', 'Admin Rede', 'admin', true, null, '{}'::text[]),
  ('fr1', 'Dono Au', 'franqueado', true, 'un-au', '{}'),
  ('eq1', 'Equipe Au', 'equipe_franqueado', true, 'un-au', '{}'),
  ('fr2', 'Dono Outra Au', 'franqueado', true, 'un-au2', '{}'),
  ('redeSem', 'Rede Sem Au', 'equipe_franqueadora', true, null, '{checklist}'),
  ('consultor', 'Consultor Rede', 'equipe_franqueadora', true, null, '{acompanhamento}'),
  ('auditor', 'Auditora Rede', 'equipe_franqueadora', true, null, '{auditoria}'),
  ('auditor2', 'Outro Auditor', 'equipe_franqueadora', true, null, '{auditoria}'),
  ('inativo', 'Conta Inativa', 'franqueado', false, 'un-au', '{}'),
  ('auditorInativo', 'Auditor Inativo', 'equipe_franqueadora', false, null, '{auditoria}')
) as v(a, n, p, at, u, m);

create function tests.itens() returns jsonb language sql immutable as $$
  select '[
    {"id":"a1","texto":"Fachada conforme manual","secao":"Loja","peso":1},
    {"id":"a2","texto":"Atendimento padrão","secao":"Equipe","peso":2},
    {"id":"a3","texto":"Estoque organizado","secao":"Estoque","peso":3}
  ]'::jsonb
$$;

create function tests.respostas(tudo_ok boolean default false) returns jsonb language sql immutable as $$
  select jsonb_agg((item - 'id') || jsonb_build_object(
    'itemId', item->>'id', 'obs', '', 'evidenciaUrl', '',
    'resultado', case when n = 2 and not tudo_ok then 'nao_ok' else 'ok' end) order by n)
  from jsonb_array_elements(tests.itens()) with ordinality as t(item, n)
$$;

create function tests.modelo(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into public.auditoria_modelos
  select (jsonb_populate_record(null::public.auditoria_modelos, '{
    "titulo":"Visita trimestral","descricao":"","total_itens":3,"peso_total":6,
    "nota_minima":80,"versao":1,"ativo":true,"gerado_por_ia":false,"ia_modelo":"",
    "atualizado_por_nome":"Auditora Rede"
  }'::jsonb || jsonb_build_object('id', chave, 'itens', tests.itens(), 'atualizado_por', tests.id('auditor')) || extra)).*
$$;

create function tests.auditoria(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into public.auditorias
  select (jsonb_populate_record(null::public.auditorias, '{
    "unidade_id":"un-au","unidade_nome":"Unidade Au","modelo_id":"au-mod",
    "modelo_titulo":"Auditoria de padrão","modelo_versao":1,"modalidade":"visita",
    "data_visita":"2026-01-01T00:00:00Z","auditor_nome":"Auditora Rede",
    "total_itens":3,"peso_total":6,"qtd_ok":2,"qtd_nao_ok":1,"qtd_na":0,
    "pontos_obtidos":4,"pontos_possiveis":6,"score":66,"nota_minima":70,"checklist_execucao_id":"",
    "resultado":"reprovada","obs_geral":"","gerado_por_ia":false,"ia_modelo":"",
    "status":"rascunho","assinatura_auditor_nome":"","ciencia_nome":"","contestacao":""
  }'::jsonb || jsonb_build_object('id', chave, 'respostas', tests.respostas(), 'auditor_uid', tests.id('auditor')) || extra)).*
$$;

create function tests.tudo_ok() returns jsonb language sql immutable as $$
  select '{"qtd_ok":3,"qtd_nao_ok":0,"pontos_obtidos":6,"score":100}'::jsonb
    || jsonb_build_object('respostas', tests.respostas(true))
$$;

create function tests.acao(chave text, aud text, extra jsonb default '{}') returns void language sql as $$
  insert into public.auditoria_acoes
  select (jsonb_populate_record(null::public.auditoria_acoes, '{
    "unidade_id":"un-au","item_id":"a2","item_texto":"Atendimento padrão",
    "descricao":"Treinar a equipe no roteiro de atendimento.","responsavel":"Dono Au",
    "prazo":"2026-12-15T12:00:00Z","status":"aberta","evidencia_url":"",
    "comentario_unidade":"","comentario_franqueadora":"","atualizado_por_nome":"Auditora Rede"
  }'::jsonb || jsonb_build_object('id', chave, 'auditoria_id', aud, 'atualizado_por', tests.id('auditor')) || extra)).*
$$;

-- Uma escrita negada pode falhar no gatilho ou não encontrar uma linha visível pelo RLS.
create function tests.recusa_atualizacao(cmd text) returns boolean language plpgsql as $$
begin
  return tests.linhas(cmd) = 0;
exception when insufficient_privilege then
  return true;
end $$;

select tests.modelo('au-mod', '{"titulo":"Auditoria de padrão","nota_minima":70,"criado_em":"2026-01-01","atualizado_em":"2026-01-01"}');
select tests.modelo('au-off', '{"titulo":"Antigo","ativo":false,"nota_minima":70,"criado_em":"2026-01-01","atualizado_em":"2026-01-01"}');

insert into public.checklist_modelos (id, titulo, tipo, frequencia, itens, total_itens, peso_total,
  criado_em, atualizado_em, atualizado_por, atualizado_por_nome)
values ('ck-mod', 'Abertura da loja', 'abertura', 'diaria', tests.itens(), 3, 6,
  '2026-01-01', '2026-01-01', tests.id('admin'), 'Admin Rede');

insert into public.checklist_execucoes (id, modelo_id, modelo_titulo, modelo_versao, tipo, frequencia,
  unidade_id, unidade_nome, uid, nome, respostas, total_itens, qtd_ok, qtd_nao_ok, qtd_na,
  pontos_obtidos, pontos_possiveis, score, criado_em)
select id, 'ck-mod', 'Abertura da loja', 1, 'abertura', 'diaria', unidade_id, unidade_nome,
  tests.id(autor), nome, tests.respostas(), 3, 2, 1, 0, 4, 6, 66, '2026-01-01'
from (values ('ck-ref', 'un-au', 'Unidade Au', 'eq1', 'Equipe Au'),
             ('ck-ref-outra', 'un-au2', 'Outra Au', 'fr2', 'Dono Outra Au'))
as execucoes(id, unidade_id, unidade_nome, autor, nome);

select tests.auditoria('au-rasc', '{"criado_em":"2026-01-01","atualizado_em":"2026-01-01"}');
select tests.auditoria(chave, '{
    "status":"aguardando_ciencia","assinatura_auditor_nome":"Auditora Rede",
    "assinatura_auditor_em":"2026-01-01","criado_em":"2026-01-01","atualizado_em":"2026-01-01"
  }'::jsonb || jsonb_build_object('assinatura_auditor_uid', tests.id('auditor'),
    'unidade_id', unidade, 'unidade_nome', nome))
from (values ('au-ass', 'un-au', 'Unidade Au'), ('au-ass2', 'un-au', 'Unidade Au'),
             ('au-outra', 'un-au2', 'Outra Au')) as bases(chave, unidade, nome);

select plan(109);

select tests.entrar('auditor');
select lives_ok($$select tests.modelo('au-novo')$$, '[regras] au: auditor cria modelo');
select throws_ok($$select tests.modelo('au-x', '{"nota_minima":120}')$$, '23514', null, '[regras] au: modelo com nota mínima acima de 100 é recusado');
select throws_ok($$select tests.modelo('au-x', '{"gerado_por_ia":true,"ia_modelo":"   "}')$$, '23514', null, '[regras] au: modelo de IA só com espaços é recusado');
select lives_ok($$select tests.modelo('au-ia', '{"gerado_por_ia":true,"ia_modelo":"Grok"}')$$, '[regras] au: modelo com IA registrada é aceito');

select tests.entrar('redeSem');
select throws_ok($$select tests.modelo('au-x', jsonb_build_object('atualizado_por', tests.id('redeSem'), 'atualizado_por_nome', 'Rede Sem Au'))$$, '42501', null, '[regras] au: sem o módulo não cria modelo');

select tests.entrar('fr1');
select is((select count(*)::int from public.auditoria_modelos), 0, '[regras] au: franqueado não lê modelos');

select tests.entrar('auditor');
select throws_ok($$update public.auditoria_modelos set itens = jsonb_build_array(tests.itens()->0, tests.itens()->1), total_itens = 2, peso_total = 3 where id = 'au-novo'$$, '42501', null, '[regras] au: mudar itens sem subir a versão é recusado');
select is(tests.linhas($$update public.auditoria_modelos set itens = jsonb_build_array(tests.itens()->0, tests.itens()->1), total_itens = 2, peso_total = 3, versao = 2 where id = 'au-novo'$$), 1, '[regras] au: mudar itens sobe a versão');
select is(tests.linhas($$update public.auditoria_modelos set nota_minima = 75 where id = 'au-novo'$$), 1, '[regras] au: mudar só a nota mínima mantém a versão');

select tests.entrar('admin');
select throws_ok($$delete from public.auditoria_modelos where id = 'au-mod'$$, '42501', null, '[regras] au: ninguém apaga modelo');

select tests.entrar('auditor');
select lives_ok($$select tests.auditoria('au-1')$$, '[regras] au: auditor cria rascunho');
select throws_ok($$select tests.auditoria('au-x', '{"resultado":"aprovada"}')$$, '42501', null, '[regras] au: resultado tem que seguir a nota mínima');
select throws_ok($$select tests.auditoria('au-x', '{"score":100,"resultado":"aprovada"}')$$, '23514', null, '[regras] au: score inflado é recusado');
select lives_ok($$select tests.auditoria('au-2', tests.tudo_ok() || '{"resultado":"aprovada"}'::jsonb)$$, '[regras] au: tudo OK e acima da nota sai aprovada');
select throws_ok($$select tests.auditoria('au-x', tests.tudo_ok() || '{"checklist_execucao_id":"ck-ref","checklist_score":50,"resultado":"aprovada"}'::jsonb)$$, '42501', null, '[regras] au: checklist abaixo da nota reprova mesmo com auditoria 100%');
select lives_ok($$select tests.auditoria('au-3', tests.tudo_ok() || '{"checklist_execucao_id":"ck-ref","checklist_score":50,"resultado":"reprovada"}'::jsonb)$$, '[regras] au: checklist de referência da unidade é aceito');
select throws_ok($$select tests.auditoria('au-x', '{"checklist_execucao_id":"ck-ref-outra","checklist_score":66}')$$, '42501', null, '[regras] au: checklist de outra unidade é recusado');
select throws_ok($$select tests.auditoria('au-x', '{"checklist_execucao_id":"nao-existe","checklist_score":66}')$$, '42501', null, '[regras] au: checklist inexistente é recusado');
select throws_ok($$select tests.auditoria('au-x', '{"checklist_execucao_id":"ck-ref"}')$$, '42501', null, '[regras] au: referência sem score é recusada');
select throws_ok($$select tests.auditoria('au-x', '{"unidade_id":"un-fantasma"}')$$, '42501', null, '[regras] au: unidade inexistente é recusada');
select throws_ok($$select tests.auditoria('au-x', '{"modelo_id":"au-off","modelo_titulo":"Antigo"}')$$, '42501', null, '[regras] au: modelo inativo é recusado');
select throws_ok($$select tests.auditoria('au-x', '{"modelo_versao":0}')$$, '42501', null, '[regras] au: versão antiga do modelo é recusada');
select throws_ok($$select tests.auditoria('au-x', jsonb_build_object('assinatura_auditor_uid', tests.id('auditor'), 'assinatura_auditor_nome', 'Auditora Rede', 'assinatura_auditor_em', statement_timestamp()))$$, '42501', null, '[regras] au: auditoria não nasce assinada');
select throws_ok($$select tests.auditoria('au-x', '{"status":"aguardando_ciencia"}')$$, '42501', null, '[regras] au: auditoria não nasce aguardando ciência');
select throws_ok($$select tests.auditoria('au-x', jsonb_build_object('auditor_uid', tests.id('auditor2'), 'auditor_nome', 'Outro Auditor'))$$, '42501', null, '[regras] au: auditor forjado é recusado');

select tests.entrar('redeSem');
select throws_ok($$select tests.auditoria('au-x', jsonb_build_object('auditor_uid', tests.id('redeSem'), 'auditor_nome', 'Rede Sem Au'))$$, '42501', null, '[regras] au: sem o módulo não audita');

select tests.entrar('fr1');
select throws_ok($$select tests.auditoria('au-x', jsonb_build_object('auditor_uid', tests.id('fr1'), 'auditor_nome', 'Dono Au'))$$, '42501', null, '[regras] au: franqueado não cria auditoria');

select tests.entrar('auditor');
select throws_ok($$select tests.auditoria('au-x', '{"criado_em":"2026-01-01"}')$$, '42501', null, '[regras] au: data do aparelho é recusada');

select tests.entrar('fr1');
select is((select count(*)::int from public.auditorias where id = 'au-rasc'), 0, '[regras] au: unidade não lê rascunho');

select tests.entrar('eq1');
select is((select count(*)::int from public.auditorias where id = 'au-ass'), 1, '[regras] au: equipe da unidade lê auditoria assinada');

select tests.entrar('fr1');
select is((select count(*)::int from public.auditorias where unidade_id = 'un-au' and status in ('aguardando_ciencia', 'concluida')), 2, '[regras] au: unidade lista as próprias auditorias assinadas');
-- Uma consulta sem filtro de status é recusada no Firestore e filtrada pelo RLS no Postgres.
select results_eq($$select id from public.auditorias where unidade_id = 'un-au' order by id$$,
  $$values ('au-ass'::text), ('au-ass2'::text)$$, '[regras] au: unidade não lista sem filtrar o status');

select tests.entrar('fr2');
select is((select count(*)::int from public.auditorias where id = 'au-ass'), 0, '[regras] au: outra unidade não lê');

select tests.entrar('auditor');
select is((select count(*)::int from public.auditorias), 7, '[regras] au: auditor lê todas');

select tests.entrar('redeSem');
select is((select count(*)::int from public.auditorias), 0, '[regras] au: franqueadora sem módulo não lê');

select tests.entrar('auditor');
select is((select count(*)::int from public.checklist_execucoes where unidade_id = 'un-au'), 1, '[regras] au: auditor lê execuções de checklist para referenciar');
select ok(tests.recusa_atualizacao($$update public.checklist_execucoes set score = 100 where id = 'ck-ref'$$), '[regras] au: auditor não escreve execução de checklist');
select is(tests.linhas($$update public.auditorias set obs_geral = 'Loja limpa, estoque desorganizado.' where id = 'au-1'$$), 1, '[regras] au: auditor edita o próprio rascunho');

select tests.entrar('auditor2');
select ok(tests.recusa_atualizacao($$update public.auditorias set obs_geral = 'x' where id = 'au-1'$$), '[regras] au: outro auditor não edita o rascunho');

select tests.entrar('auditor');
select throws_ok($$update public.auditorias set unidade_id = 'un-au2', unidade_nome = 'Outra Au' where id = 'au-1'$$, '42501', null, '[regras] au: rascunho não troca de unidade');
select throws_ok($$update public.auditorias set status = 'aguardando_ciencia', assinatura_auditor_uid = tests.id('auditor'), assinatura_auditor_nome = 'Outra Pessoa' where id = 'au-1'$$, '42501', null, '[regras] au: assinatura com nome forjado é recusada');
select throws_ok($$update public.auditorias set status = 'aguardando_ciencia', assinatura_auditor_uid = tests.id('auditor'), assinatura_auditor_nome = 'Auditora Rede', assinatura_auditor_em = '2026-01-01' where id = 'au-1'$$, '42501', null, '[regras] au: assinatura sem hora do servidor é recusada');
select is(tests.linhas($$update public.auditorias set status = 'aguardando_ciencia' where id = 'au-1'$$), 1, '[regras] au: auditor assina');
select ok(tests.recusa_atualizacao($$update public.auditorias set respostas = tests.respostas(true), qtd_ok = 3, qtd_nao_ok = 0, pontos_obtidos = 6, score = 100, resultado = 'aprovada' where id = 'au-1'$$), '[regras] au: assinada, o auditor não muda o score');

select tests.entrar('admin');
select ok(tests.recusa_atualizacao($$update public.auditorias set obs_geral = 'mudado' where id = 'au-1'$$), '[regras] au: assinada, o admin não muda o texto');

select tests.entrar('eq1');
select ok(tests.recusa_atualizacao($$update public.auditorias set status = 'concluida', ciencia_uid = tests.id('eq1'), ciencia_nome = 'Equipe Au' where id = 'au-ass'$$), '[regras] au: equipe não assina a ciência');

select tests.entrar('fr2');
select ok(tests.recusa_atualizacao($$update public.auditorias set status = 'concluida', ciencia_uid = tests.id('fr2'), ciencia_nome = 'Dono Outra Au' where id = 'au-ass'$$), '[regras] au: franqueado de outra unidade não assina');

select tests.entrar('fr1');
select throws_ok($$update public.auditorias set status = 'concluida', ciencia_uid = tests.id('fr1'), ciencia_nome = 'Outro' where id = 'au-ass'$$, '42501', null, '[regras] au: ciência com nome forjado é recusada');
select throws_ok($$update public.auditorias set status = 'concluida', resultado = 'aprovada' where id = 'au-ass'$$, '42501', null, '[regras] au: ciência não altera o resultado');
select is(tests.linhas($$update public.auditorias set status = 'concluida', contestacao = 'Discordo do item de estoque: reposição chegou no dia.' where id = 'au-ass'$$), 1, '[regras] au: franqueado assina ciente com contestação');
select ok(tests.recusa_atualizacao($$update public.auditorias set contestacao = 'Outra' where id = 'au-ass'$$), '[regras] au: concluída, a contestação não muda');

select tests.entrar('auditor');
select ok(tests.recusa_atualizacao($$update public.auditorias set obs_geral = 'x' where id = 'au-ass'$$), '[regras] au: concluída, o auditor não muda nada');

select tests.entrar('fr1');
select ok(tests.recusa_atualizacao($$update public.auditorias set status = 'concluida' where id = 'au-rasc'$$), '[regras] au: rascunho não recebe ciência');

select tests.entrar('admin');
select throws_ok($$delete from public.auditorias where id = 'au-ass'$$, '42501', null, '[regras] au: ninguém apaga auditoria');

select tests.entrar('auditor');
select lives_ok($$select tests.acao('ac-1', 'au-ass2')$$, '[regras] au: plano para auditoria assinada');
select throws_ok($$select tests.acao('ac-x', 'au-rasc')$$, '42501', null, '[regras] au: plano para rascunho é recusado');
select throws_ok($$select tests.acao('ac-x', 'au-outra')$$, '42501', null, '[regras] au: plano com unidade trocada é recusado');
select throws_ok($$select tests.acao('ac-x', 'au-ass2', '{"status":"validada"}')$$, '42501', null, '[regras] au: plano não nasce concluído');

select tests.entrar('fr1');
select throws_ok($$select tests.acao('ac-x', 'au-ass2', jsonb_build_object('atualizado_por', tests.id('fr1'), 'atualizado_por_nome', 'Dono Au'))$$, '42501', null, '[regras] au: franqueado não cria plano');

select tests.entrar('eq1');
select is((select count(*)::int from public.auditoria_acoes where unidade_id = 'un-au'), 1, '[regras] au: unidade lista o próprio plano');

select tests.entrar('fr2');
select is((select count(*)::int from public.auditoria_acoes where unidade_id = 'un-au'), 0, '[regras] au: outra unidade não lista o plano');

select tests.entrar('fr1');
select is(tests.linhas($$update public.auditoria_acoes set status = 'em_andamento', comentario_unidade = 'Treino marcado para sexta.' where id = 'ac-1'$$), 1, '[regras] au: franqueado coloca em andamento');

select tests.entrar('eq1');
select ok(tests.recusa_atualizacao($$update public.auditoria_acoes set status = 'concluida_unidade', evidencia_url = 'https://drive.google.com/x' where id = 'ac-1'$$), '[regras] au: equipe não atualiza o plano');

select tests.entrar('fr1');
select throws_ok($$update public.auditoria_acoes set status = 'concluida_unidade' where id = 'ac-1'$$, '42501', null, '[regras] au: concluir sem evidência é recusado');
select throws_ok($$update public.auditoria_acoes set status = 'concluida_unidade', evidencia_url = 'http://drive.google.com/x' where id = 'ac-1'$$, '42501', null, '[regras] au: evidência sem https é recusada');
select throws_ok($$update public.auditoria_acoes set status = 'validada', evidencia_url = 'https://drive.google.com/x' where id = 'ac-1'$$, '42501', null, '[regras] au: unidade não valida o próprio plano');
select throws_ok($$update public.auditoria_acoes set status = 'em_andamento', prazo = '2027-06-01T12:00:00Z' where id = 'ac-1'$$, '42501', null, '[regras] au: unidade não muda o prazo');
select is(tests.linhas($$update public.auditoria_acoes set status = 'concluida_unidade', evidencia_url = 'https://drive.google.com/file/d/treino' where id = 'ac-1'$$), 1, '[regras] au: franqueado conclui com evidência https');

select tests.entrar('auditor');
select throws_ok($$update public.auditoria_acoes set evidencia_url = '' where id = 'ac-1'$$, '42501', null, '[regras] au: franqueadora não troca a evidência');
select is(tests.linhas($$update public.auditoria_acoes set status = 'reaberta', comentario_franqueadora = 'Falta a lista de presença.' where id = 'ac-1'$$), 1, '[regras] au: franqueadora reabre com comentário');
select throws_ok($$update public.auditoria_acoes set status = 'validada' where id = 'ac-1'$$, '42501', null, '[regras] au: franqueadora não valida o que a unidade não concluiu');

select tests.entrar('fr1');
select is(tests.linhas($$update public.auditoria_acoes set status = 'concluida_unidade', evidencia_url = 'https://drive.google.com/file/d/presenca' where id = 'ac-1'$$), 1, '[regras] au: franqueado conclui de novo');

select tests.entrar('auditor');
select is(tests.linhas($$update public.auditoria_acoes set status = 'validada', comentario_franqueadora = 'Ok, validado.' where id = 'ac-1'$$), 1, '[regras] au: franqueadora valida');
select ok(tests.recusa_atualizacao($$update public.auditoria_acoes set comentario_franqueadora = 'mudou' where id = 'ac-1'$$), '[regras] au: plano validado não muda mais');

select tests.entrar('fr1');
select ok(tests.recusa_atualizacao($$update public.auditoria_acoes set status = 'em_andamento' where id = 'ac-1'$$), '[regras] au: unidade não reabre plano validado');

select tests.entrar('admin');
select throws_ok($$delete from public.auditoria_acoes where id = 'ac-1'$$, '42501', null, '[regras] au: ninguém apaga plano');

select tests.entrar('consultor');
select is((select count(*)::int from public.auditorias where status in ('aguardando_ciencia', 'concluida')), 4, '[regras] ac: consultor lista auditorias assinadas');
-- A consulta ampla continua filtrada pelo status de cada linha.
select results_eq($$select id from public.auditorias order by id$$,
  $$values ('au-1'::text), ('au-ass'::text), ('au-ass2'::text), ('au-outra'::text)$$, '[regras] ac: consultor não lista auditorias sem filtrar rascunhos');
select is((select count(*)::int from public.auditorias where id = 'au-rasc'), 0, '[regras] ac: consultor não lê rascunho de auditoria');
select is((select count(*)::int from public.auditoria_acoes), 1, '[regras] ac: consultor lê plano de ação da auditoria');
select is((select count(*)::int from public.auditoria_modelos), 0, '[regras] ac: consultor não lê modelos de auditoria');

select tests.entrar('inativo');
select is((select count(*)::int from public.auditorias), 0, 'Franqueado inativo não lê auditorias da própria unidade');
select is((select count(*)::int from public.auditoria_acoes), 0, 'Franqueado inativo não lê ações da própria unidade');

select tests.entrar('auditorInativo');
select is((select count(*)::int from public.auditoria_modelos), 0, 'Auditor inativo não lê modelos');
select is((select count(*)::int from public.auditorias), 0, 'Auditor inativo não lê auditorias');
select is((select count(*)::int from public.auditoria_acoes), 0, 'Auditor inativo não lê ações');

select tests.entrar('redeSem');
select is((select count(*)::int from public.auditoria_modelos), 0, 'Equipe da franqueadora sem auditoria não lê modelos');
select is((select count(*)::int from public.auditoria_acoes), 0, 'Equipe da franqueadora sem auditoria ou acompanhamento não lê ações');

select tests.entrar('auditor');
select lives_ok($$select public.criar_acoes_auditoria('au-ass2', '[
    {"id":"ac-lote-1","item_id":"a1","item_texto":"Fachada","descricao":"Revisar fachada","responsavel":"Dono Au","prazo":"2026-12-15T12:00:00Z"},
    {"id":"ac-lote-2","item_id":"a2","item_texto":"Atendimento","descricao":"Treinar equipe","responsavel":"Dono Au","prazo":"2026-12-15T12:00:00Z"}
  ]'::jsonb)$$, 'Auditor cria duas ações em um lote para auditoria assinada');
select is((select count(*)::int from public.auditoria_acoes where id in ('ac-lote-1', 'ac-lote-2') and unidade_id = 'un-au'), 2, 'O lote grava as duas ações na unidade da auditoria');
select throws_ok($$select public.criar_acoes_auditoria('au-ass2', '[
    {"id":"ac-erro-1","item_id":"a1","item_texto":"Fachada","descricao":"Revisar fachada","responsavel":"Dono Au","prazo":"2026-12-15T12:00:00Z"},
    {"id":"ac-erro-2","item_id":"a2","item_texto":"Atendimento","descricao":"x","responsavel":"Dono Au","prazo":"2026-12-15T12:00:00Z"}
  ]'::jsonb)$$, '23514', null, 'Lote com uma ação inválida é recusado');
select is((select count(*)::int from public.auditoria_acoes where id in ('ac-erro-1', 'ac-erro-2')), 0, 'Falha de uma ação desfaz o lote inteiro');
select throws_ok($$select public.criar_acoes_auditoria('au-rasc', '[
    {"id":"ac-lote-1","item_id":"a1","item_texto":"Fachada","descricao":"Revisar fachada","responsavel":"Dono Au","prazo":"2026-12-15T12:00:00Z"},
    {"id":"ac-lote-2","item_id":"a2","item_texto":"Atendimento","descricao":"Treinar equipe","responsavel":"Dono Au","prazo":"2026-12-15T12:00:00Z"}
  ]'::jsonb)$$, '42501', null, 'O lote não cria ações para auditoria em rascunho');

select tests.entrar('consultor');
select throws_ok($$select public.criar_acoes_auditoria('au-ass', '[
    {"id":"ac-erro-1","item_id":"a1","item_texto":"Fachada","descricao":"Revisar fachada","responsavel":"Dono Au","prazo":"2026-12-15T12:00:00Z"},
    {"id":"ac-erro-2","item_id":"a2","item_texto":"Atendimento","descricao":"x","responsavel":"Dono Au","prazo":"2026-12-15T12:00:00Z"}
  ]'::jsonb)$$, '42501', null, 'O lote respeita a permissão de escrita da sessão');

select tests.entrar('admin');
select is(tests.linhas($$update public.auditoria_modelos set ativo = false where id = 'au-mod'$$),
  1, 'Admin desativa modelo criado por outra pessoa');
select is(tests.linhas($$update public.auditorias set status = 'aguardando_ciencia' where id = 'au-rasc'$$),
  1, 'Admin assina rascunho de outro auditor mesmo após desativar o modelo');
select ok((select auditor_uid = tests.id('auditor') and assinatura_auditor_uid = tests.id('admin')
    and assinatura_auditor_nome = 'Admin Rede' and assinatura_auditor_em = atualizado_em
    from public.auditorias where id = 'au-rasc'),
  'Banco preserva a autoria do rascunho e carimba a assinatura do admin');
select ok((select ciencia_uid = tests.id('fr1') and ciencia_nome = 'Dono Au' and ciencia_em = atualizado_em
    from public.auditorias where id = 'au-ass'),
  'Banco carimba a ciência com a identidade da sessão');
select ok((select atualizado_por = tests.id('auditor') and atualizado_por_nome = 'Auditora Rede'
    and criado_em = atualizado_em from public.auditoria_acoes where id = 'ac-lote-1'),
  'Banco carimba a autoria e a hora da criação do plano');
select ok((select auditor_uid = tests.id('auditor') and auditor_nome = 'Auditora Rede'
    and criado_em = atualizado_em from public.auditorias where id = 'au-2'),
  'Banco carimba a autoria e a hora da criação da auditoria');

select tests.entrar('fr1');
select is((select count(*)::int from public.auditorias), 4, 'Franqueado sem módulos lê auditorias assinadas da própria unidade');
select is((select count(*)::int from public.auditoria_acoes), 3, 'Franqueado sem módulos lê ações da própria unidade');

select tests.sair();
update public.unidades set ativo = false where id = 'un-au';
select tests.entrar('fr1');
select is((select count(*)::int from public.auditorias), 0, 'Unidade desativada não lê auditorias assinadas');
select is((select count(*)::int from public.auditoria_acoes), 0, 'Unidade desativada não lê ações');
select tests.entrar('consultor');
select is((select count(*)::int from public.auditorias where unidade_id = 'un-au'), 4,
  'Consultor lê auditorias assinadas de unidade desativada');

select tests.anonimo();
select throws_ok($$select * from public.auditoria_modelos$$, '42501', null, 'Anônimo não lê modelos');
select throws_ok($$select * from public.auditorias$$, '42501', null, 'Anônimo não lê auditorias');
select throws_ok($$select * from public.auditoria_acoes$$, '42501', null, 'Anônimo não lê ações');
select throws_ok($$select public.criar_acoes_auditoria('au-ass2', '[]')$$, '42501', null, 'Anônimo não executa o lote de ações');

select tests.sair();
select * from finish();
rollback;
