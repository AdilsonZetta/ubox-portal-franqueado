-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
begin;

create schema tests;
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['admin', 'fr1', 'eq1', 'fr2', 'fila', 'sem', 'redeSem', 'redeAc', 'eqSem', 'frAc', 'inativo', 'unOff', 'eqAutor']) with ordinality as t(apelido, n);

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
  ('un-1', 'Uberaba Centro', 'Dono Chamado', 'un1@ubox.test', true),
  ('un-2', 'Araxá', 'Outra Unidade', 'un2@ubox.test', true),
  ('un-off', 'Unidade Inativa', 'Pessoa Inativa', 'off@ubox.test', false);

insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados)
select tests.id(a), a || '@ubox.test', n, p::public.papel, at, u, m
from (values
  ('admin', 'Admin Rede', 'admin', true, null, '{}'::text[]),
  ('fr1', 'Dono Chamado', 'franqueado', true, 'un-1', '{chamados}'),
  ('eq1', 'Equipe Chamado', 'equipe_franqueado', true, 'un-1', '{chamados}'),
  ('fr2', 'Outra Unidade', 'franqueado', true, 'un-2', '{chamados}'),
  ('fila', 'Fila Rede', 'equipe_franqueadora', true, null, '{chamados}'),
  ('sem', 'Sem Módulo', 'franqueado', true, 'un-1', '{}'),
  ('redeSem', 'Rede Sem', 'equipe_franqueadora', true, null, '{}'),
  ('redeAc', 'Consultor Rede', 'equipe_franqueadora', true, null, '{acompanhamento}'),
  ('eqSem', 'Pessoa Teste', 'equipe_franqueado', true, 'un-1', '{}'),
  ('frAc', 'Franqueado Consultor', 'franqueado', true, 'un-1', '{acompanhamento}'),
  ('inativo', 'Conta Inativa', 'franqueado', false, 'un-1', '{chamados}'),
  ('unOff', 'Unidade Inativa', 'franqueado', true, 'un-off', '{chamados}'),
  ('eqAutor', 'Equipe Autora', 'equipe_franqueado', true, 'un-1', '{chamados}')
) as v(a, n, p, at, u, m);

create function tests.abrir(chave text, autor text, nome text, unidade text, unidade_nome text, sla integer default 4)
returns void language sql as $$
  insert into public.chamados (id, titulo, categoria, prioridade, descricao, anexos,
    unidade_id, unidade_nome, aberto_por, aberto_por_nome, sla_horas)
  values (chave, 'Porta emperrada', 'operacao', 'urgente', 'A porta não fecha.',
    '[{"nome":"Foto","url":"https://exemplo.test/porta"}]', unidade, unidade_nome, tests.id(autor), nome, sla)
$$;
create function tests.evento(chave text, tipo text, autor text, nome text, destino text default '')
returns void language sql as $$
  insert into public.chamado_eventos (id, chamado_id, tipo, texto, autor_id, autor_nome, para)
  values (chave, 'ch-1', tipo, 'Segue o detalhe.', tests.id(autor), nome, destino)
$$;

select plan(61);
select tests.abrir('ch-ac', 'fr2', 'Outra Unidade', 'un-2', 'Araxá');
insert into chamado_eventos (id, chamado_id, tipo, texto, autor_id, autor_nome)
values ('ev-ac', 'ch-ac', 'comentario', 'Interno', tests.id('fr2'), 'Outra Unidade');
select tests.entrar('fr1');
select lives_ok($$select tests.abrir('ch-1', 'fr1', 'Dono Chamado', 'un-1', 'Uberaba Centro')$$,
  '[regras] franqueado com o módulo abre chamado da própria unidade');

select tests.entrar('eq1');
select is((select count(*)::int from chamados where id = 'ch-1'), 1, '[regras] equipe da unidade com o módulo lê o chamado');
select tests.entrar('admin');
select is((select count(*)::int from chamados where id = 'ch-1'), 1, '[regras] admin lê o chamado');
select tests.entrar('fila');
select is((select count(*)::int from chamados where id = 'ch-1'), 1, '[regras] equipe da franqueadora com o módulo lê o chamado');
select tests.entrar('sem');
select is((select count(*)::int from chamados where id = 'ch-1'), 0, '[regras] franqueado sem o módulo não lê o chamado');
select tests.entrar('redeSem');
select is((select count(*)::int from chamados where id = 'ch-1'), 0, '[regras] equipe da franqueadora sem o módulo não lê o chamado');
select tests.entrar('fr2');
select is((select count(*)::int from chamados where id = 'ch-1'), 0, '[regras] outra unidade não lê o chamado');

-- O RLS filtra a consulta ampla e devolve zero linhas para outra unidade.
select tests.entrar('fr1');
select results_eq($$select id from chamados$$, $$values ('ch-1'::text)$$, '[regras] franqueado não lista a fila inteira');
select results_eq($$select id from chamados where unidade_id = 'un-1'$$, $$values ('ch-1'::text)$$,
  '[regras] franqueado lista só a própria unidade');
select is((select count(*)::int from chamados where unidade_id = 'un-2'), 0, '[regras] franqueado não lista outra unidade');
select throws_ok($$update chamados set responsavel_id = tests.id('fr1'), responsavel_nome = 'Dono Chamado' where id = 'ch-1'$$,
  '42501', null, '[regras] franqueado não altera o responsável');
select throws_ok($$update chamados set sla_horas = 72 where id = 'ch-1'$$,
  '42501', null, '[regras] franqueado não altera o SLA');
select throws_ok($$update chamados set status = 'fechado', avaliacao = 5, fechado_em = now() where id = 'ch-1'$$,
  '42501', null, '[regras] franqueado não fecha direto de aberto');
select throws_ok($$select tests.abrir('ch-nome', 'fr1', 'Dono Chamado', 'un-1', 'Outra')$$,
  '42501', null, '[regras] chamado não aceita nome de unidade diferente');
select throws_ok($$select tests.abrir('ch-sla', 'fr1', 'Dono Chamado', 'un-1', 'Uberaba Centro', 1)$$,
  '23514', null, '[regras] chamado não nasce com SLA fora da prioridade');
select lives_ok($$select tests.evento('ev-1', 'comentario', 'fr1', 'Dono Chamado')$$,
  '[regras] franqueado comenta o próprio chamado');
select tests.entrar('fr2');
select throws_ok($$select tests.evento('ev-2', 'comentario', 'fr2', 'Outra Unidade')$$,
  '42501', null, '[regras] outra unidade não comenta');

select tests.entrar('fila');
select lives_ok($$update chamados set responsavel_id = tests.id('fila'), responsavel_nome = 'Fila Rede',
  status = 'em_andamento' where id = 'ch-1'$$, '[regras] franqueadora assume o chamado');
select lives_ok($$select mudar_status_chamado('ch-1', 'resolvido',
  '{"id":"ev-resolvido","tipo":"status","texto":"Status: resolvido","de":"em_andamento","para":"resolvido","autor_nome":"Fila Rede"}')$$,
  '[regras] franqueadora marca como resolvido');
select ok((select c.status = 'resolvido' and c.resolvido_em = now() and e.criado_em = c.atualizado_em
  from chamados c join chamado_eventos e on e.chamado_id = c.id where e.id = 'ev-resolvido'),
  'resolução e evento são gravados juntos com carimbo do servidor');
select tests.entrar('eq1');
select throws_ok($$update chamados set status = 'fechado', avaliacao = 4 where id = 'ch-1'$$,
  '42501', null, '[regras] colega não fecha o chamado de outro');
select tests.entrar('fr1');
select lives_ok($$update chamados set status = 'fechado', avaliacao = 5 where id = 'ch-1'$$, '[regras] franqueado fecha e avalia');
with alterado as (
  update chamados set status = 'aberto', avaliacao = null, fechado_em = null, resolvido_em = null
  where id = 'ch-1' returning *
)
select ok((select status = 'aberto' and avaliacao is null and fechado_em is null and resolvido_em is null and reaberto_em is not null
  from alterado), '[regras] franqueado reabre e zera a avaliação');

select tests.entrar('admin');
select lives_ok($$update chamados set status = 'em_andamento' where id = 'ch-1'$$, '[regras] admin conduz a fila');
select tests.entrar('fr1');
select throws_ok($$select tests.evento('ev-falso-nome', 'comentario', 'fr1', 'Outra Pessoa')$$,
  '42501', null, '[regras] comentário não aceita nome forjado');
select throws_ok($$select tests.evento('ev-status', 'status', 'fr1', 'Dono Chamado', 'fechado')$$,
  '42501', null, '[regras] unidade não grava evento de status');
select tests.entrar('fila');
select throws_ok($$select tests.evento('ev-sem-mudanca', 'status', 'fila', 'Fila Rede', 'resolvido')$$,
  '42501', null, '[regras] evento de status sem mudança é recusado');
select tests.entrar('eqSem');
select throws_ok($$select tests.abrir('ch-sem', 'eqSem', 'Pessoa Teste', 'un-1', 'Uberaba Centro')$$,
  '42501', null, '[regras] equipe sem o módulo não abre chamado');

select tests.entrar('fila');
update chamados set status = 'resolvido', resolvido_em = now() where id = 'ch-1';
select tests.entrar('fr1');
update chamados set status = 'fechado', avaliacao = 2 where id = 'ch-1';
select tests.entrar('fila');
with alterado as (
  update chamados set status = 'em_andamento', avaliacao = null, fechado_em = null, resolvido_em = null
  where id = 'ch-1' returning *
)
select ok((select status = 'em_andamento' and avaliacao is null and fechado_em is null and resolvido_em is null from alterado),
  '[regras] franqueadora tira de fechado e zera a nota');

select tests.entrar('redeAc');
select is((select count(*)::int from chamados), 2, '[regras] ac: consultor lê chamados');
select is((select count(*)::int from chamado_eventos where chamado_id = 'ch-ac'), 0, '[regras] ac: consultor não lê os eventos do chamado');
select is((select count(*)::int from chamado_eventos), 0, 'consultor sem chamados não lê nenhum evento');
select throws_ok($$update chamados set status = 'resolvido' where id = 'ch-1'$$,
  '42501', null, 'consultor sem chamados não conduz a fila');
select tests.entrar('redeSem');
select is((select count(*)::int from chamados), 0, '[regras] ac: sem o módulo não lê chamados');
select tests.entrar('frAc');
select is((select count(*)::int from chamados where id = 'ch-ac'), 0,
  '[regras] ac: franqueado não lê chamados de outra unidade pelo módulo 9');

select tests.entrar('eq1');
select is((select count(*)::int from chamado_eventos), 2, 'equipe da unidade lê só o histórico da unidade');
select tests.entrar('admin');
select is((select count(*)::int from chamado_eventos), 3, 'admin lê o histórico da rede');
select tests.entrar('fr2');
select is((select count(*)::int from chamado_eventos where chamado_id = 'ch-1'), 0, 'outra unidade não lê o histórico');
select tests.entrar('inativo');
select is((select count(*)::int from chamados), 0, 'conta inativa não lê chamados');
select tests.entrar('unOff');
select is((select count(*)::int from chamados), 0, 'unidade inativa não lê chamados');

select tests.entrar('fila');
select is((select count(*)::int from chamado_eventos), 3, 'fila autorizada lê o histórico da rede');
select throws_ok($$select tests.evento('ev-resp-isolado', 'responsavel', 'fila', 'Fila Rede', 'Fila Rede')$$,
  '42501', null, 'evento de responsável exige mudança no mesmo comando');
select throws_ok($$select mudar_status_chamado('ch-1', 'resolvido',
  '{"id":"ev-1","tipo":"status","texto":"Resolvido","de":"em_andamento","para":"resolvido","autor_nome":"Fila Rede"}')$$,
  '23505', null, 'ID de evento duplicado reverte a transição');
select is((select status from chamados where id = 'ch-1'), 'em_andamento', 'falha no evento preserva o status anterior');
select throws_ok($$select mudar_status_chamado('ch-1', 'em_andamento',
  '{"tipo":"status","texto":"Em andamento","de":"em_andamento","para":"em_andamento","autor_nome":"Fila Rede"}')$$,
  '42501', null, 'RPC exige mudança real de status');
select throws_ok($$select mudar_status_chamado('ch-1', 'resolvido',
  '{"tipo":"status","texto":"Resolvido","de":"em_andamento","para":"resolvido","autor_nome":"Nome Forjado"}')$$,
  '42501', null, 'RPC recusa nome de autor forjado');
select lives_ok($$select mudar_status_chamado('ch-1', 'em_andamento',
  '{"id":"ev-resp","tipo":"responsavel","texto":"Admin assumiu","de":"Fila Rede","para":"Admin Rede","autor_nome":"Fila Rede"}',
  null, tests.id('admin'), 'Admin Rede')$$, 'fila registra atribuição com evento');
select ok((select c.responsavel_id = tests.id('admin') and e.para = c.responsavel_nome
  from chamados c join chamado_eventos e on e.chamado_id = c.id where e.id = 'ev-resp'),
  'atribuição e evento de responsável são gravados juntos');
select throws_ok($$delete from chamados where id = 'ch-1'$$, '42501', null, 'fila não pode apagar chamados');
select throws_ok($$update chamado_eventos set texto = 'alterado' where id = 'ev-1'$$, '42501', null, 'histórico é imutável');
select throws_ok($$delete from chamado_eventos where id = 'ev-1'$$, '42501', null, 'histórico não pode ser apagado');
select throws_ok($$update chamados set titulo = 'Título adulterado' where id = 'ch-1'$$,
  '42501', null, 'conteúdo de abertura é imutável até para a fila');

-- A autoria mantém a permissão de encerrar/reabrir, mesmo quando a leitura foi revogada.
select tests.sair();
select tests.abrir('ch-sem-leitura', 'eqAutor', 'Equipe Autora', 'un-1', 'Uberaba Centro');
select tests.abrir('ch-inativo', 'unOff', 'Unidade Inativa', 'un-off', 'Unidade Inativa');
update chamados set status = 'resolvido', resolvido_em = now() where id = 'ch-sem-leitura';
update usuarios set modulos_liberados = '{}' where id = tests.id('eqAutor');
select tests.entrar('unOff');
select is((select count(*)::int from chamados where id = 'ch-inativo'), 0, 'unidade inativa não lê nem o próprio chamado');
select tests.entrar('frAc');
select throws_ok($$select mudar_status_chamado('ch-sem-leitura', 'fechado', null, 3)$$,
  '42501', null, 'alteração sem leitura exige autoria');
select tests.entrar('eqAutor');
select is((select count(*)::int from chamados where id = 'ch-sem-leitura'), 0, 'autoria sem módulo não libera leitura');
select lives_ok($$select mudar_status_chamado('ch-sem-leitura', 'fechado', null, 3)$$, 'autoria sem leitura ainda pode fechar');
select lives_ok($$select mudar_status_chamado('ch-sem-leitura', 'aberto', null)$$, 'autoria sem leitura ainda pode reabrir');
select tests.sair();
select ok((select status = 'aberto' and avaliacao is null and resolvido_em is null and fechado_em is null
  and reaberto_em = now() from chamados where id = 'ch-sem-leitura'), 'reabertura sem leitura limpa a avaliação e carimba a data');

select tests.anonimo();
select throws_ok($$select * from chamados$$, '42501', null, 'anônimo não lê chamados');
select throws_ok($$select * from chamado_eventos$$, '42501', null, 'anônimo não lê eventos');
select throws_ok($$select mudar_status_chamado('ch-1', 'aberto', null)$$, '42501', null, 'anônimo não executa a RPC');

select * from finish();
rollback;
