-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
begin;

create schema tests;
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['admin', 'fr1', 'eq1', 'fr2', 'rede', 'sem', 'redeSem', 'consultor', 'auditor', 'inativo', 'unOff']) with ordinality as t(apelido, n);

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
  ('un-ck', 'Unidade Ck', 'Pessoa Teste', 'um@ubox.test', true),
  ('un-ck2', 'Outra Ck', 'Pessoa Teste', 'dois@ubox.test', true),
  ('un-off', 'Unidade Inativa', 'Pessoa Teste', 'off@ubox.test', false);

insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, unidade, modulos_liberados)
select tests.id(a), a || '@ubox.test', n, p::public.papel, at, u,
  coalesce((select nome from public.unidades where id = u), ''), m
from (values
  ('admin', 'Admin Rede', 'admin', true, null, '{}'::text[]),
  ('fr1', 'Dono Ck', 'franqueado', true, 'un-ck', '{checklist}'),
  ('eq1', 'Equipe Ck', 'equipe_franqueado', true, 'un-ck', '{checklist}'),
  ('fr2', 'Dono Outra Ck', 'franqueado', true, 'un-ck2', '{checklist}'),
  ('rede', 'Rede Ck', 'equipe_franqueadora', true, null, '{checklist}'),
  ('sem', 'Sem Módulo', 'franqueado', true, 'un-ck', '{}'),
  ('redeSem', 'Rede Sem', 'equipe_franqueadora', true, null, '{}'),
  ('consultor', 'Consultor Rede', 'equipe_franqueadora', true, null, '{acompanhamento}'),
  ('auditor', 'Auditora Rede', 'equipe_franqueadora', true, null, '{auditoria}'),
  ('inativo', 'Conta Inativa', 'franqueado', false, 'un-ck', '{checklist}'),
  ('unOff', 'Unidade Inativa', 'franqueado', true, 'un-off', '{checklist}')
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
select id, 'Abertura da loja', 'abertura', 'diaria', tests.itens(), 3, 6, 2,
  cardinality(unidades) = 0, unidades, ativo, '2026-01-01T00:00:00Z',
  tests.id('admin'), 'Admin Rede', '2026-01-01T00:00:00Z'
from (values
  ('ck-rede', '{}'::text[], true),
  ('ck-un', '{un-ck}', true),
  ('ck-outra', '{un-ck2}', true),
  ('ck-off', '{}', false)
) as modelos(id, unidades, ativo);

-- Os auxiliares de teste executam com a identidade de quem chama.
create function tests.modelo(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into checklist_modelos
  select (jsonb_populate_record(null::checklist_modelos, '{
    "titulo":"Fechamento","descricao":"Rotina de fechamento","tipo":"fechamento",
    "frequencia":"diaria","total_itens":3,"peso_total":6,"versao":1,"publico":true,
    "unidades":[],"ativo":true,"gerado_por_ia":false,"ia_modelo":"","atualizado_por_nome":"Rede Ck"
  }'::jsonb || jsonb_build_object('id', chave, 'itens', tests.itens(), 'atualizado_por', tests.id('rede')) || extra)).*
$$;

create function tests.execucao(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into checklist_execucoes
  select (jsonb_populate_record(null::checklist_execucoes, '{
    "modelo_id":"ck-rede","modelo_titulo":"Abertura da loja","modelo_versao":2,
    "tipo":"abertura","frequencia":"diaria","unidade_id":"un-ck","unidade_nome":"Unidade Ck",
    "nome":"Equipe Ck","respostas":[
      {"itemId":"i1","texto":"Luzes","peso":1,"resultado":"ok","obs":"","evidenciaUrl":""},
      {"itemId":"i2","texto":"Caixa","peso":2,"resultado":"nao_ok","obs":"Faltou troco","evidenciaUrl":"https://drive.google.com/f"},
      {"itemId":"i3","texto":"Limpeza","peso":3,"resultado":"ok","obs":"","evidenciaUrl":""}
    ],
    "total_itens":3,"qtd_ok":2,"qtd_nao_ok":1,"qtd_na":0,"pontos_obtidos":4,"pontos_possiveis":6,"score":66,
    "obs_geral":"","obs_proprietario":"","obs_proprietario_nome":""
  }'::jsonb || jsonb_build_object('id', chave, 'uid', tests.id('eq1')) || extra)).*
$$;

select tests.execucao('ex-outra', jsonb_build_object(
  'unidade_id', 'un-ck2', 'unidade_nome', 'Outra Ck', 'uid', tests.id('fr2'),
  'nome', 'Dono Outra Ck', 'criado_em', '2026-01-01T00:00:00Z'));

select plan(90);

select tests.entrar('eq1');
select is((select count(*)::int from checklist_modelos where ativo = true and publico = true), 1, '[regras] ck: unidade lista modelos da rede');

select tests.entrar('fr1');
select is((select count(*)::int from checklist_modelos where ativo = true and 'un-ck' = any(unidades)), 1, '[regras] ck: unidade lista modelos da própria unidade');
select is((select count(*)::int from checklist_modelos where ativo = true and 'un-ck2' = any(unidades)), 0, '[regras] ck: unidade não lista modelos de outra unidade');
select is((select count(*)::int from checklist_modelos where id = 'ck-off'), 0, '[regras] ck: unidade não lê modelo inativo');
select is((select count(*)::int from checklist_modelos where id = 'ck-outra'), 0, '[regras] ck: unidade não lê modelo de outra unidade');

select tests.entrar('sem');
select is((select count(*)::int from checklist_modelos where ativo = true and publico = true), 0, '[regras] ck: sem o módulo não lê modelos');

select tests.entrar('rede');
select is((select count(*)::int from checklist_modelos), 4, '[regras] ck: franqueadora com módulo lista tudo');

select tests.entrar('redeSem');
select is((select count(*)::int from checklist_modelos), 0, '[regras] ck: franqueadora sem módulo não lista');

select tests.entrar('rede');
select lives_ok($$select tests.modelo('ck-novo')$$, '[regras] ck: franqueadora cria modelo');
select throws_ok($$select tests.modelo('ck-x', jsonb_build_object('versao', 3))$$, '42501', null, '[regras] ck: modelo nasce na versão 1');
select throws_ok($$select tests.modelo('ck-x', jsonb_build_object('itens', '[]'::jsonb, 'total_itens', 0, 'peso_total', 0))$$, '23514', null, '[regras] ck: modelo exige itens');
select throws_ok($$select tests.modelo('ck-x', jsonb_build_object('total_itens', 2))$$, '23514', null, '[regras] ck: total de itens precisa bater');
select throws_ok($$select tests.modelo('ck-x', jsonb_build_object('peso_total', 31))$$, '23514', null, '[regras] ck: peso total fora da faixa é recusado');
select throws_ok($$select tests.modelo('ck-x', jsonb_build_object('frequencia', 'anual'::text))$$, '23514', null, '[regras] ck: frequência desconhecida é recusada');
select throws_ok($$select tests.modelo('ck-x', jsonb_build_object('gerado_por_ia', true))$$, '23514', null, '[regras] ck: modelo com IA exige o modelo de IA');
select lives_ok($$select tests.modelo('ck-ia', jsonb_build_object('gerado_por_ia', true, 'ia_modelo', 'Gemini'::text))$$, '[regras] ck: modelo com IA registrada é aceito');
select throws_ok($$select tests.modelo('ck-x', jsonb_build_object('publico', false))$$, '23514', null, '[regras] ck: modelo direcionado exige unidade');
select throws_ok($$select tests.modelo('ck-x', jsonb_build_object('unidades', '{un-ck}'::text[]))$$, '23514', null, '[regras] ck: modelo da rede toda não lista unidades');
select throws_ok($$select tests.modelo('ck-x', jsonb_build_object('atualizado_por_nome', 'Outro Nome'::text))$$, '42501', null, '[regras] ck: autor forjado é recusado');

select tests.entrar('fr1');
select throws_ok($$select tests.modelo('ck-x', jsonb_build_object('atualizado_por', tests.id('fr1'), 'atualizado_por_nome', 'Dono Ck'::text))$$, '42501', null, '[regras] ck: franqueado não cria modelo');

select tests.entrar('redeSem');
select throws_ok($$select tests.modelo('ck-x', jsonb_build_object('atualizado_por', tests.id('redeSem'), 'atualizado_por_nome', 'Rede Sem Ck'::text))$$, '42501', null, '[regras] ck: sem módulo não cria modelo');

select tests.entrar('rede');
select throws_ok($$update checklist_modelos set itens = tests.itens() || '[{"id":"i4","texto":"Alarme","secao":"","peso":1,"exigeEvidencia":false,"exigeObs":false}]'::jsonb, total_itens = 4, peso_total = 7, atualizado_por = tests.id('rede'), atualizado_por_nome = 'Rede Ck' where id = 'ck-novo'$$, '42501', null, '[regras] ck: mudar itens sem subir a versão é recusado');
select is(tests.linhas($$update checklist_modelos set itens = tests.itens() || '[{"id":"i4","texto":"Alarme","secao":"","peso":1,"exigeEvidencia":false,"exigeObs":false}]'::jsonb, total_itens = 4, peso_total = 7, versao = 2, atualizado_por = tests.id('rede'), atualizado_por_nome = 'Rede Ck' where id = 'ck-novo'$$), 1, '[regras] ck: mudar itens sobe a versão');
select is(tests.linhas($$update checklist_modelos set ativo = false, atualizado_por = tests.id('rede'), atualizado_por_nome = 'Rede Ck' where id = 'ck-novo'$$), 1, '[regras] ck: desativar mantém a versão');
select throws_ok($$update checklist_modelos set versao = 3, atualizado_por = tests.id('rede'), atualizado_por_nome = 'Rede Ck' where id = 'ck-novo'$$, '42501', null, '[regras] ck: versão não sobe sem mudança relevante');
select throws_ok($$update checklist_modelos set titulo = 'Fechamento noturno', atualizado_por = tests.id('rede'), atualizado_por_nome = 'Rede Ck' where id = 'ck-novo'$$, '42501', null, '[regras] ck: mudar o título sem subir a versão é recusado');
select throws_ok($$update checklist_modelos set frequencia = 'semanal', atualizado_por = tests.id('rede'), atualizado_por_nome = 'Rede Ck' where id = 'ck-novo'$$, '42501', null, '[regras] ck: mudar a frequência sem subir a versão é recusado');
select throws_ok($$update checklist_modelos set tipo = 'limpeza', atualizado_por = tests.id('rede'), atualizado_por_nome = 'Rede Ck' where id = 'ck-novo'$$, '42501', null, '[regras] ck: mudar o tipo sem subir a versão é recusado');
select throws_ok($$update checklist_modelos set peso_total = 8, atualizado_por = tests.id('rede'), atualizado_por_nome = 'Rede Ck' where id = 'ck-novo'$$, '42501', null, '[regras] ck: mudar o peso total sem subir a versão é recusado');
select is(tests.linhas($$update checklist_modelos set titulo = 'Fechamento noturno', frequencia = 'semanal', versao = 3, atualizado_por = tests.id('rede'), atualizado_por_nome = 'Rede Ck' where id = 'ck-novo'$$), 1, '[regras] ck: mudar título e frequência sobe a versão');
select throws_ok($$select tests.modelo('ck-x', jsonb_build_object('gerado_por_ia', true, 'ia_modelo', '   '::text))$$, '23514', null, '[regras] ck: modelo de IA só com espaços é recusado');
select throws_ok($$update checklist_modelos set atualizado_por = tests.id('rede'), atualizado_por_nome = 'Rede Ck', criado_em = criado_em - interval '1 day' where id = 'ck-novo'$$, '42501', null, '[regras] ck: edição mantém criadoEm');

select tests.entrar('admin');
select throws_ok($$delete from checklist_modelos where id = 'ck-rede'$$, '42501', null, '[regras] ck: ninguém apaga modelo');

select tests.entrar('eq1');
select lives_ok($$select tests.execucao('ex-1')$$, '[regras] ck: equipe envia checklist com totais coerentes');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('score', 100))$$, '42501', null, '[regras] ck: score inflado é recusado');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('qtd_ok', 3, 'qtd_nao_ok', 0, 'pontos_obtidos', 4, 'score', 66))$$, '42501', null, '[regras] ck: pontos sem não conformidade precisam fechar 100%');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('pontos_obtidos', 6, 'score', 100))$$, '42501', null, '[regras] ck: não conformidade sem perder pontos é recusada');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('qtd_na', 1))$$, '42501', null, '[regras] ck: contagem que não fecha com os itens é recusada');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('pontos_obtidos', 8, 'pontos_possiveis', 12, 'score', 66))$$, '42501', null, '[regras] ck: pontos acima do peso total são recusados');
select lives_ok($$select tests.execucao('ex-na', jsonb_build_object('qtd_ok', 0, 'qtd_nao_ok', 0, 'qtd_na', 3, 'pontos_obtidos', 0, 'pontos_possiveis', 0, 'score', 100))$$, '[regras] ck: tudo N/A vale 100%');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('modelo_versao', 1))$$, '42501', null, '[regras] ck: versão antiga do modelo é recusada');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('respostas', '[{"itemId":"i1"}]'::jsonb))$$, '42501', null, '[regras] ck: respostas a menos que os itens são recusadas');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('modelo_id', 'ck-off'::text))$$, '42501', null, '[regras] ck: modelo inativo não aceita execução');

select tests.entrar('fr1');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('modelo_id', 'ck-outra'::text, 'uid', tests.id('fr1'), 'nome', 'Dono Ck'::text))$$, '42501', null, '[regras] ck: modelo de outra unidade não aceita execução');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('modelo_id', 'nao-existe'::text, 'uid', tests.id('fr1'), 'nome', 'Dono Ck'::text))$$, '42501', null, '[regras] ck: modelo inexistente é recusado');

select tests.entrar('eq1');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('unidade_id', 'un-ck2'::text, 'unidade_nome', 'Outra Ck'::text))$$, '42501', null, '[regras] ck: execução em nome de outra unidade é recusada');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('uid', tests.id('fr1'), 'nome', 'Dono Ck'::text))$$, '42501', null, '[regras] ck: execução em nome de outra pessoa é recusada');

select tests.entrar('fr1');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('uid', tests.id('fr1'), 'nome', 'Dono Ck'::text, 'obs_proprietario', 'Ok'::text))$$, '42501', null, '[regras] ck: execução não nasce com observação do proprietário');

select tests.entrar('eq1');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('criado_em', '2026-01-01T00:00:00Z'::text))$$, '42501', null, '[regras] ck: execução com data do aparelho é recusada');

select tests.entrar('sem');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('uid', tests.id('sem'), 'nome', 'Sem Ck'::text))$$, '42501', null, '[regras] ck: sem o módulo não envia checklist');

select tests.entrar('rede');
select throws_ok($$select tests.execucao('ex-x', jsonb_build_object('uid', tests.id('rede'), 'nome', 'Rede Ck'::text))$$, '42501', null, '[regras] ck: franqueadora não preenche pela unidade');

select tests.entrar('eq1');
select is((select count(*)::int from checklist_execucoes where unidade_id = 'un-ck'), 2, '[regras] ck: unidade lista o próprio histórico');

select tests.entrar('fr1');
select is((select count(*)::int from checklist_execucoes where unidade_id = 'un-ck2'), 0, '[regras] ck: unidade não lista histórico de outra');
select is((select count(*)::int from checklist_execucoes where id = 'ex-outra'), 0, '[regras] ck: unidade não lê execução de outra');
-- No Firestore esta consulta é recusada; o RLS filtra por linha no Postgres.
select results_eq($$select id from checklist_execucoes order by id$$,
  $$values ('ex-1'::text), ('ex-na'::text)$$, '[regras] ck: unidade não lista sem filtrar a unidade');

select tests.entrar('rede');
select is((select count(*)::int from checklist_execucoes), 3, '[regras] ck: franqueadora lista todas as execuções');

select tests.entrar('redeSem');
select is((select count(*)::int from checklist_execucoes), 0, '[regras] ck: franqueadora sem módulo não lista execuções');

select tests.entrar('fr1');
select is(tests.linhas($$update checklist_execucoes set obs_proprietario = 'Conferi o caixa com a equipe.', obs_proprietario_por = tests.id('fr1'), obs_proprietario_nome = 'Dono Ck' where id = 'ex-1'$$), 1, '[regras] ck: franqueado registra observação do proprietário');

select tests.entrar('eq1');
select is(tests.linhas($$update checklist_execucoes set obs_proprietario = 'Tudo certo', obs_proprietario_por = tests.id('eq1'), obs_proprietario_nome = 'Equipe Ck' where id = 'ex-1'$$), 0, '[regras] ck: equipe não escreve observação do proprietário');

select tests.entrar('fr2');
select is(tests.linhas($$update checklist_execucoes set obs_proprietario = 'Oi', obs_proprietario_por = tests.id('fr2'), obs_proprietario_nome = 'Dono Outra Ck' where id = 'ex-1'$$), 0, '[regras] ck: franqueado de outra unidade não comenta');

select tests.entrar('fr1');
select throws_ok($$update checklist_execucoes set score = 100, obs_proprietario = 'Corrigido', obs_proprietario_por = tests.id('fr1'), obs_proprietario_nome = 'Dono Ck' where id = 'ex-1'$$, '42501', null, '[regras] ck: observação não altera o score');
select throws_ok($$update checklist_execucoes set obs_proprietario = 'Conferido', obs_proprietario_por = tests.id('fr1'), obs_proprietario_nome = 'Outro' where id = 'ex-1'$$, '42501', null, '[regras] ck: observação com nome forjado é recusada');

select tests.entrar('rede');
select is(tests.linhas($$update checklist_execucoes set score = 100 where id = 'ex-1'$$), 0, '[regras] ck: franqueadora não edita execução');

select tests.entrar('admin');
select throws_ok($$delete from checklist_execucoes where id = 'ex-1'$$, '42501', null, '[regras] ck: ninguém apaga execução');

select tests.entrar('auditor');
select is((select count(*)::int from checklist_execucoes where unidade_id = 'un-ck'), 2,
  '[regras] au: auditor lê execuções de checklist para referenciar');
select is(tests.linhas($$update checklist_execucoes set score = 100 where id = 'ex-1'$$), 0,
  '[regras] au: auditor não escreve execução de checklist');
select is((select count(*)::int from checklist_modelos), 0, 'Auditoria não dá acesso aos modelos');

select tests.entrar('consultor');
select is((select count(*)::int from checklist_execucoes), 3, '[regras] ac: consultor lê execuções de checklist');
select is((select count(*)::int from checklist_modelos), 6, '[regras] ac: consultor lê modelos de checklist');
select is(tests.linhas($$update checklist_modelos set ativo = false where id = 'ck-rede'$$), 0,
  'Consultor não altera modelos');
select is(tests.linhas($$update checklist_execucoes set obs_proprietario = 'Teste' where id = 'ex-1'$$), 0,
  'Consultor não altera execuções');

select tests.entrar('admin');
select is((select count(*)::int from checklist_modelos), 6, 'Admin lê todos os modelos');
select is((select count(*)::int from checklist_execucoes), 3, 'Admin lê todas as execuções');

-- Inclui registros na própria unidade inativa para que o teste detecte vazamentos.
select tests.sair();
select tests.execucao('ex-off', jsonb_build_object(
  'unidade_id', 'un-off', 'unidade_nome', 'Unidade Inativa', 'uid', tests.id('unOff'),
  'nome', 'Unidade Inativa', 'criado_em', '2026-01-01T00:00:00Z'));
insert into checklist_modelos
select (jsonb_populate_record(m, '{"id":"ck-un-off","publico":false,"unidades":["un-off"]}')).*
from checklist_modelos m where id = 'ck-rede';

select tests.entrar('inativo');
select is((select count(*)::int from checklist_modelos), 0, 'Conta inativa não lê modelos');
select is((select count(*)::int from checklist_execucoes), 0, 'Conta inativa não lê execuções');

select tests.entrar('unOff');
select is((select count(*)::int from checklist_modelos), 0, 'Unidade inativa não lê modelos');
select is((select count(*)::int from checklist_execucoes), 0, 'Unidade inativa não lê o próprio histórico');

select tests.entrar('sem');
select is((select count(*)::int from checklist_execucoes), 0, 'Unidade sem módulo não lê execuções');

select tests.entrar('fr2');
select is((select count(*)::int from checklist_modelos where id = 'ck-un'), 0,
  'Modelo restrito fica invisível para unidade fora da lista');
select is((select count(*)::int from checklist_execucoes where id = 'ex-1'), 0,
  'Execução fica invisível para outra unidade');

select tests.entrar('rede');
select throws_ok($$select tests.modelo('ck-x', '{"itens":{}}')$$, '23514', null, 'Itens do modelo exigem um array');
select throws_ok($$update checklist_modelos set id = 'outro-id' where id = 'ck-rede'$$,
  '42501', null, 'Identificador do modelo é imutável');

select tests.entrar('eq1');
select throws_ok($$select tests.execucao('ex-x', '{"respostas":{}}')$$, '42501', null, 'Respostas exigem um array');
select throws_ok($$select tests.execucao('ex-x', '{"modelo_titulo":"Título de outro modelo"}')$$,
  '42501', null, 'Título da execução deve corresponder ao modelo');

-- O cliente Supabase omite os carimbos; o banco os preenche com a sessão.
select tests.entrar('rede');
select lives_ok($$select tests.modelo('ck-api', '{"atualizado_por":null,"atualizado_por_nome":null}')$$,
  'Modelo aceita carimbo omitido');
select is((select atualizado_por from checklist_modelos where id = 'ck-api'), tests.id('rede'),
  'Banco grava o autor do modelo');

select tests.entrar('eq1');
select lives_ok($$select tests.execucao('ex-api', '{"uid":null,"nome":null,"modelo_id":"ck-un"}')$$,
  'Unidade executa modelo direcionado a ela com carimbo omitido');
select is((select nome from checklist_execucoes where id = 'ex-api'), 'Equipe Ck',
  'Banco grava o nome do autor da execução');

select tests.anonimo();
select throws_ok($$select * from checklist_modelos$$, '42501', null, 'Anônimo não lê modelos');
select throws_ok($$select * from checklist_execucoes$$, '42501', null, 'Anônimo não lê execuções');

select tests.sair();
select * from finish();
rollback;
