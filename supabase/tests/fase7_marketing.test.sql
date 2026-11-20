-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
begin;

create schema tests;
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['admin', 'fr1', 'eq1', 'eq2', 'fr2', 'rede', 'sem', 'redeSem', 'consultor', 'inativo', 'unOff']) with ordinality as t(apelido, n);

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
  ('un-1', 'Unidade Um', 'Pessoa Teste', 'um@ubox.test', true),
  ('un-2', 'Unidade Dois', 'Pessoa Teste', 'dois@ubox.test', true),
  ('un-off', 'Unidade Inativa', 'Pessoa Teste', 'off@ubox.test', false);

insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, unidade, modulos_liberados)
select tests.id(a), a || '@ubox.test', n, p::public.papel, at, u,
  coalesce((select nome from public.unidades where id = u), ''), m
from (values
  ('admin', 'Admin Rede', 'admin', true, null, '{}'::text[]),
  ('fr1', 'Dono Mkt', 'franqueado', true, 'un-1', '{marketing}'),
  ('eq1', 'Equipe Mkt', 'equipe_franqueado', true, 'un-1', '{marketing}'),
  ('eq2', 'Equipe Mkt B', 'equipe_franqueado', true, 'un-1', '{marketing}'),
  ('fr2', 'Outra Unidade', 'franqueado', true, 'un-2', '{marketing}'),
  ('rede', 'Rede Mkt', 'equipe_franqueadora', true, null, '{marketing}'),
  ('sem', 'Sem Módulo', 'franqueado', true, 'un-1', '{}'),
  ('redeSem', 'Rede Sem', 'equipe_franqueadora', true, null, '{}'),
  ('consultor', 'Consultor Rede', 'equipe_franqueadora', true, null, '{acompanhamento}'),
  ('inativo', 'Conta Inativa', 'franqueado', false, 'un-1', '{marketing}'),
  ('unOff', 'Unidade Inativa', 'franqueado', true, 'un-off', '{marketing}')
) as v(a, n, p, at, u, m);

create function tests.material(chave text, link text default 'https://exemplo.test/arte',
  visivel boolean default true, destinos text[] default '{}', ia boolean default false,
  modelo text default '', tipo text default 'arte', nome text default null, ativo boolean default true)
returns void language sql as $$
  insert into marketing_materiais (id, titulo, url, publico, unidades, gerado_por_ia, ia_modelo, tipo,
    atualizado_por, atualizado_por_nome, ativo)
  values (chave, 'Arte da Rede', link, visivel, destinos, ia, modelo, tipo, auth.uid(), nome, ativo)
$$;

create function tests.campanha(chave text, ultimo date, ativo boolean default true,
  ia boolean default false, modelo text default '')
returns void language sql as $$
  insert into marketing_campanhas (id, titulo, inicio, fim, atualizado_por, atualizado_por_nome, ativo, gerado_por_ia, ia_modelo)
  values (chave, 'Natal', '2026-12-01', ultimo, tests.id('rede'), 'Rede Mkt', ativo, ia, modelo)
$$;

create function tests.pedido(chave text, estado text default 'aberta', retorno text default '',
  unidade text default null, autor uuid default null, referencia text default '')
returns void language sql as $$
  insert into marketing_solicitacoes (id, titulo, tipo_peca, descricao, status, resposta, unidade_id, uid, referencia_url)
  values (chave, 'Panfleto da loja', 'panfleto', 'Panfleto com endereço da unidade', estado, retorno, unidade, autor, referencia)
$$;

select tests.entrar('rede');
select tests.material('mat-rede');
select tests.material('mat-un', visivel => false, destinos => '{un-1}');
select tests.material('mat-outra', visivel => false, destinos => '{un-2}');
select tests.material('mat-off', ativo => false);
select tests.campanha('camp-on', '2026-12-25');
select tests.campanha('camp-off', '2026-12-25', false);

select plan(90);

select tests.entrar('eq1');
select is((select count(*)::int from marketing_materiais where ativo and publico), 1, '[regras] mkt: unidade lista materiais da rede');

select tests.entrar('fr1');
select is((select count(*)::int from marketing_materiais where ativo and 'un-1' = any(unidades)), 1, '[regras] mkt: unidade lista materiais da própria unidade');
select is((select count(*)::int from marketing_materiais where ativo and 'un-2' = any(unidades)), 0, '[regras] mkt: unidade não lista materiais de outra unidade');
select is((select count(*)::int from marketing_materiais where id = 'mat-outra'), 0, '[regras] mkt: unidade não lê material de outra unidade');

select tests.entrar('eq1');
select is((select count(*)::int from marketing_materiais where id = 'mat-un'), 1, '[regras] mkt: unidade lê material direcionado a ela');

select tests.entrar('fr1');
-- O RLS filtra cada linha mesmo quando a consulta não pede só os materiais ativos.
select is((select count(*)::int from marketing_materiais where id = 'mat-off'), 0, '[regras] mkt: unidade não lê material inativo');
select is((select count(*)::int from marketing_materiais), 2, '[regras] mkt: unidade não lista sem filtrar ativos');

select tests.entrar('sem');
select is((select count(*)::int from marketing_materiais where ativo and publico), 0, '[regras] mkt: sem o módulo não lê materiais');

select tests.entrar('rede');
select is((select count(*)::int from marketing_materiais), 4, '[regras] mkt: franqueadora com módulo lista tudo');

select tests.entrar('redeSem');
select is((select count(*)::int from marketing_materiais), 0, '[regras] mkt: franqueadora sem módulo não lista');

select tests.entrar('rede');
select lives_ok($$select tests.material('mat-novo')$$, '[regras] mkt: franqueadora cria material');
select throws_ok($$select tests.material('mat-ia', ia => true)$$, '23514', null, '[regras] mkt: material com IA exige o modelo');
select lives_ok($$select tests.material('mat-ia', ia => true, modelo => 'Grok Imagine')$$, '[regras] mkt: material com IA registrada é aceito');
select throws_ok($$select tests.material('mat-x', 'http://exemplo.test/a')$$, '23514', null, '[regras] mkt: material exige link https');
select throws_ok($$select tests.material('mat-x', 'javascript:alert(1)')$$, '23514', null, '[regras] mkt: material recusa javascript: no link');

select tests.entrar('admin');
select throws_ok($$select tests.material('mat-x', tipo => 'exe', nome => 'Admin Rede')$$, '23514', null, '[regras] mkt: material recusa tipo desconhecido');
select throws_ok($$insert into marketing_materiais (id, titulo, url, senha) values ('mat-x', 'Arte', 'https://exemplo.test/a', 'x')$$, '42703', null, '[regras] mkt: material recusa campo extra');

select tests.entrar('rede');
select throws_ok($$select tests.material('mat-x', nome => 'Outro Nome')$$, '42501', null, '[regras] mkt: autor forjado é recusado');
select throws_ok($$select tests.material('mat-x', destinos => '{un-1}')$$, '23514', null, '[regras] mkt: material da rede toda não lista unidades');
select throws_ok($$select tests.material('mat-x', visivel => false)$$, '23514', null, '[regras] mkt: material direcionado exige ao menos uma unidade');
select lives_ok($$select tests.material('mat-dir', visivel => false, destinos => '{un-1}')$$, '[regras] mkt: material direcionado com unidade é aceito');

select tests.entrar('fr1');
select throws_ok($$select tests.material('mat-x')$$, '42501', null, '[regras] mkt: franqueado não cria material');

select tests.entrar('redeSem');
select throws_ok($$select tests.material('mat-x')$$, '42501', null, '[regras] mkt: franqueadora sem módulo não cria material');

select tests.entrar('rede');
select throws_ok($$update marketing_materiais set criado_em = now() - interval '1 day' where id = 'mat-novo'$$, '42501', null, '[regras] mkt: edição mantém criadoEm');
select lives_ok($$update marketing_materiais set ativo = false where id = 'mat-novo'$$, '[regras] mkt: franqueadora edita material');

select tests.entrar('admin');
select throws_ok($$delete from marketing_materiais where id = 'mat-rede'$$, '42501', null, '[regras] mkt: ninguém apaga material');

select tests.entrar('eq1');
select is((select count(*)::int from marketing_campanhas where ativo), 1, '[regras] mkt: unidade lista campanhas ativas');
select is((select count(*)::int from marketing_campanhas where id = 'camp-off'), 0, '[regras] mkt: unidade não lê campanha inativa');

select tests.entrar('rede');
select lives_ok($$select tests.campanha('camp-nova', '2026-12-25')$$, '[regras] mkt: franqueadora cria campanha');
select throws_ok($$select tests.campanha('camp-x', '2026-11-30')$$, '23514', null, '[regras] mkt: campanha com fim antes do início é recusada');

select tests.entrar('fr1');
select throws_ok($$insert into marketing_campanhas (titulo, inicio, fim) values ('Natal', now(), now())$$, '42501', null, '[regras] mkt: franqueado não cria campanha');

select tests.entrar('eq1');
select lives_ok($$select tests.pedido('sol-1')$$, '[regras] mkt: equipe abre pedido de peça');
select throws_ok($$select tests.pedido('sol-x', 'entregue')$$, '42501', null, '[regras] mkt: pedido não nasce entregue');
select throws_ok($$select tests.pedido('sol-x', retorno => 'ok')$$, '42501', null, '[regras] mkt: pedido não nasce com resposta');
select throws_ok($$select tests.pedido('sol-x', unidade => 'un-2')$$, '42501', null, '[regras] mkt: pedido em nome de outra unidade é recusado');
select throws_ok($$select tests.pedido('sol-x', autor => tests.id('eq2'))$$, '42501', null, '[regras] mkt: pedido em nome de outra pessoa é recusado');

select tests.entrar('sem');
select throws_ok($$select tests.pedido('sol-x')$$, '42501', null, '[regras] mkt: sem o módulo não pede peça');

select tests.entrar('eq1');
select throws_ok($$select tests.pedido('sol-x', referencia => 'ftp://x')$$, '23514', null, '[regras] mkt: pedido com referência não-https é recusado');
select is((select count(*)::int from marketing_solicitacoes where id = 'sol-1'), 1, '[regras] mkt: quem pediu lê o próprio pedido');
select is((select count(*)::int from marketing_solicitacoes where uid = tests.id('eq1')), 1, '[regras] mkt: quem pediu lista os próprios pedidos');

select tests.entrar('eq2');
select is((select count(*)::int from marketing_solicitacoes where id = 'sol-1'), 0, '[regras] mkt: colega da equipe não lê o pedido');

select tests.entrar('fr1');
select is((select count(*)::int from marketing_solicitacoes where unidade_id = 'un-1'), 1, '[regras] mkt: franqueado lista pedidos da unidade');

select tests.entrar('fr2');
select is((select count(*)::int from marketing_solicitacoes where unidade_id = 'un-1'), 0, '[regras] mkt: franqueado de outra unidade não lista');

select tests.entrar('rede');
select is((select count(*)::int from marketing_solicitacoes), 1, '[regras] mkt: franqueadora lista todos os pedidos');

select tests.entrar('eq1');
select throws_ok($$update marketing_solicitacoes set status = 'em_producao' where id = 'sol-1'$$, '42501', null, '[regras] mkt: unidade não muda status para em produção');

select tests.entrar('rede');
select lives_ok($$update marketing_solicitacoes set status = 'em_producao' where id = 'sol-1'$$, '[regras] mkt: franqueadora coloca em produção');

select tests.entrar('eq1');
select throws_ok($$update marketing_solicitacoes set status = 'cancelada' where id = 'sol-1'$$, '42501', null, '[regras] mkt: unidade não cancela pedido em produção');

select tests.entrar('rede');
select lives_ok($$update marketing_solicitacoes set status = 'aguardando_unidade', resposta = 'Qual o endereço?' where id = 'sol-1'$$, '[regras] mkt: franqueadora pede informação');

select tests.entrar('eq1');
select throws_ok($$update marketing_solicitacoes set status = 'aberta', resposta = '', complemento = 'Rua X' where id = 'sol-1'$$, '42501', null, '[regras] mkt: unidade não mexe na resposta da franqueadora');
select throws_ok($$update marketing_solicitacoes set status = 'aberta' where id = 'sol-1'$$, '42501', null, '[regras] mkt: unidade não responde em branco');
select throws_ok($$update marketing_solicitacoes set status = 'aberta', complemento = 'x' where id = 'sol-1'$$, '42501', null, '[regras] mkt: resposta da unidade exige 2 caracteres');
select lives_ok($$update marketing_solicitacoes set status = 'aberta', complemento = 'Rua X, 100' where id = 'sol-1'$$, '[regras] mkt: unidade responde e o pedido volta para a fila');

select tests.entrar('rede');
select lives_ok($$update marketing_solicitacoes set status = 'aguardando_unidade', resposta = 'Qual o bairro?' where id = 'sol-1'$$, '[regras] mkt: franqueadora pede informação de novo');

select tests.entrar('eq1');
select throws_ok($$update marketing_solicitacoes set status = 'aberta', complemento = 'Rua X, 100' where id = 'sol-1'$$, '42501', null, '[regras] mkt: unidade não repete a mesma resposta');
select lives_ok($$update marketing_solicitacoes set status = 'aberta', complemento = 'Rua X, 100 — Centro' where id = 'sol-1'$$, '[regras] mkt: unidade responde de novo com texto novo');

select tests.entrar('rede');
select throws_ok($$update marketing_solicitacoes set status = 'entregue' where id = 'sol-1'$$, '42501', null, '[regras] mkt: entrega exige link');
select throws_ok($$update marketing_solicitacoes set status = 'entregue', entrega_url = 'https://exemplo.test/y', gerado_por_ia = true where id = 'sol-1'$$, '23514', null, '[regras] mkt: entrega com IA exige o modelo');
select throws_ok($$update marketing_solicitacoes set status = 'em_producao', responsavel_nome = 'Outra Pessoa' where id = 'sol-1'$$, '42501', null, '[regras] mkt: responsável forjado é recusado');
select lives_ok($$update marketing_solicitacoes set status = 'entregue', entrega_url = 'https://exemplo.test/y', gerado_por_ia = true, ia_modelo = 'Grok Imagine', resposta = 'Pronto!' where id = 'sol-1'$$, '[regras] mkt: franqueadora entrega com link e IA registrada');
select throws_ok($$update marketing_solicitacoes set status = 'em_producao', entregue_em = null where id = 'sol-1'$$, '42501', null, '[regras] mkt: pedido entregue não reabre');

select tests.entrar('eq2');
select tests.pedido('sol-2');
select tests.pedido('sol-3');

select tests.entrar('fr1');
select is(tests.linhas($$update marketing_solicitacoes set status = 'cancelada' where id = 'sol-2'$$), 1, '[regras] mkt: franqueado cancela pedido aberto da equipe');

select tests.entrar('eq1');
select is(tests.linhas($$update marketing_solicitacoes set status = 'cancelada' where id = 'sol-3'$$), 0, '[regras] mkt: colega não cancela pedido de outro');

select tests.entrar('rede');
select throws_ok($$delete from marketing_solicitacoes where id = 'sol-1'$$, '42501', null, '[regras] mkt: ninguém apaga pedido');
select throws_ok($$select tests.material('mat-x', ia => true, modelo => '  ')$$, '23514', null, '[regras] mkt: modelo de IA só com espaços é recusado');
select throws_ok($$select tests.campanha('camp-x', '2026-12-25', true, true, E'\t\t')$$, '23514', null, '[regras] mkt: campanha com IA só com espaços é recusada');

select tests.entrar('fr2');
select is((select count(*)::int from marketing_solicitacoes), 0, 'outra unidade não lê solicitações');
select is((select count(*)::int from marketing_materiais where id = 'mat-un'), 0, 'unidade ausente da lista não lê o material');

select tests.sair();
insert into marketing_solicitacoes (id, uid, nome, unidade_id, unidade_nome, titulo, tipo_peca, descricao)
values ('sol-un-off', tests.id('unOff'), 'Unidade Inativa', 'un-off', 'Unidade Inativa',
  'Panfleto da loja', 'panfleto', 'Panfleto com endereço da unidade');

select set_config('tests.total_solicitacoes', (select count(*)::text from marketing_solicitacoes), true);
select tests.entrar('consultor');
select ok((select count(*) > 0 and count(*) = current_setting('tests.total_solicitacoes')::bigint
  from marketing_solicitacoes), '[regras] ac: consultor lê pedidos de marketing');
select is(tests.linhas($$update marketing_solicitacoes set status = 'em_producao'
  where id = 'sol-3'$$), 0, 'consultor não atualiza pedido de marketing');

select tests.entrar('admin');
select is((select count(*)::int from marketing_solicitacoes), 4, 'admin da rede lê pedidos de todas as unidades');
select throws_ok($$update marketing_solicitacoes set status = 'em_producao', unidade_id = 'un-2'
  where id = 'sol-3'$$, '42501', null, 'gestor não transfere a unidade de uma solicitação');
select throws_ok($$update marketing_solicitacoes set status = 'em_producao', titulo = 'Título alterado'
  where id = 'sol-3'$$, '42501', null, 'gestor não altera o conteúdo da abertura');
select lives_ok($$update marketing_solicitacoes set status = 'em_producao' where id = 'sol-3'$$,
  'admin assume o andamento de uma solicitação');
select is((select responsavel_nome from marketing_solicitacoes where id = 'sol-3'), 'Admin Rede',
  'andamento carimba o nome atual do gestor');

select tests.entrar('inativo');
select is((select count(*)::int from marketing_materiais), 0, 'conta inativa não lê materiais');
select is((select count(*)::int from marketing_campanhas), 0, 'conta inativa não lê campanhas');
select is((select count(*)::int from marketing_solicitacoes), 0, 'conta inativa não lê solicitacoes');

select tests.entrar('unOff');
select is((select count(*)::int from marketing_materiais), 0, 'unidade inativa não lê materiais');
select is((select count(*)::int from marketing_campanhas), 0, 'unidade inativa não lê campanhas');
select is((select count(*)::int from marketing_solicitacoes), 0, 'unidade inativa não lê solicitacoes');

select tests.entrar('sem');
select is((select count(*)::int from marketing_materiais), 0, 'sem módulo não lê materiais');
select is((select count(*)::int from marketing_campanhas), 0, 'sem módulo não lê campanhas');
select is((select count(*)::int from marketing_solicitacoes), 0, 'sem módulo não lê solicitacoes');

select tests.sair();
select is((select count(*)::int from marketing_solicitacoes where id = 'sol-1' and uid = tests.id('eq1') and nome = 'Equipe Mkt' and responsavel_nome = 'Rede Mkt' and entregue_em is not null and entregue_em = atualizado_em), 1, 'autoria e datas da entrega vêm do servidor');

select tests.sair();
update usuarios set unidade_id = 'un-2', unidade = 'Unidade Dois' where id = tests.id('eq2');
select tests.entrar('eq2');
select is((select count(*)::int from marketing_solicitacoes where id in ('sol-2', 'sol-3')), 2,
  'autor ainda lê os próprios pedidos depois de mudar de unidade');
select is((select count(*)::int from marketing_solicitacoes where id = 'sol-1'), 0,
  'autor não lê pedidos de colegas da unidade anterior');
select is(tests.linhas($$update marketing_solicitacoes set status = 'cancelada'
  where id = 'sol-3'$$), 0, 'autor não altera pedidos da unidade anterior');

select tests.anonimo();
select throws_ok($$select * from marketing_materiais$$, '42501', null, 'anônimo não lê materiais');
select throws_ok($$select * from marketing_campanhas$$, '42501', null, 'anônimo não lê campanhas');
select throws_ok($$select * from marketing_solicitacoes$$, '42501', null, 'anônimo não lê solicitacoes');

select * from finish();
rollback;
