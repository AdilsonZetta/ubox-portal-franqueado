-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
begin;

create schema tests;
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['admin', 'fr1', 'eq1', 'oculto', 'fr2', 'rede', 'sem', 'consultor', 'inativo', 'unOff']) with ordinality as t(apelido, n);

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
  ('un-1', 'Unidade Senhas', 'Dono Senhas', 'un1@ubox.test', true),
  ('un-2', 'Unidade Dois Senhas', 'Dono Dois Senhas', 'un2@ubox.test', true),
  ('un-off', 'Unidade Inativa', 'Dono Unidade Inativa', 'off@ubox.test', true);

insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados)
select tests.id(a), a || '@ubox.test', n, p::public.papel, at, u, m
from (values
  ('admin', 'Administrador', 'admin', true, null, '{}'::text[]),
  ('fr1', 'Dono Senhas', 'franqueado', true, 'un-1', '{senhas}'),
  ('eq1', 'Equipe Visivel', 'equipe_franqueado', true, 'un-1', '{senhas}'),
  ('oculto', 'Equipe Oculto', 'equipe_franqueado', true, 'un-1', '{senhas}'),
  ('fr2', 'Dono Dois Senhas', 'franqueado', true, 'un-2', '{senhas}'),
  ('rede', 'Rede Senhas', 'equipe_franqueadora', true, null, '{senhas}'),
  ('sem', 'Sem Módulo', 'franqueado', true, 'un-1', '{}'),
  ('consultor', 'Consultor Rede', 'equipe_franqueadora', true, null, '{acompanhamento}'),
  ('inativo', 'Conta Inativa', 'franqueado', false, 'un-1', '{senhas}'),
  ('unOff', 'Dono Unidade Inativa', 'franqueado', true, 'un-off', '{senhas}')
) as v(a, n, p, at, u, m);

create function tests.metadados(chave text, unidade text, nome_unidade text, extras jsonb default '{}')
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', chave, 'nome', 'Sistema de Gestão', 'categoria', 'gestao',
    'url', 'https://gestao.example.test', 'escopo', case when unidade = '' then 'rede' else 'unidade' end,
    'unidade_id', unidade, 'unidade_nome', nome_unidade,
    'responsavel_nome', 'Responsável do Sistema', 'visivel_para', '[]'::jsonb,
    'visivel_para_equipe', false, 'pendente_troca', false
  ) || extras
$$;

create function tests.evento(chave text, tipo text, texto text, autor text, nome text)
returns void language sql as $$
  insert into public.acesso_eventos (id, acesso_id, tipo, texto, autor_id, autor_nome)
  values (chave, 'ac-s1', tipo, texto, tests.id(autor), nome)
$$;

create function tests.solicitar(chave text, acesso text, nome_unidade text default 'Unidade Senhas')
returns void language sql as $$
  insert into public.solicitacoes_acesso (id, tipo, status, acesso_id, acesso_nome, unidade_id, unidade_nome,
    solicitado_por, solicitado_por_nome, motivo, alvo_uid, alvo_nome)
  values (chave, 'pedir_acesso', 'aberta', acesso, 'Sistema de Gestão', 'un-1', nome_unidade,
    tests.id('oculto'), 'Equipe Oculto', 'Emitir relatórios.', tests.id('oculto'), 'Equipe Oculto')
$$;

-- Força a checagem do lote dentro da subtransação que o pgTAP pode reverter.
create function tests.checar_lote(cmd text, verificar_como text default null)
returns void language plpgsql as $$
begin
  execute cmd;
  if verificar_como is not null then
    perform tests.entrar(verificar_como);
  end if;
  set constraints acesso_rotacao_com_segredo immediate;
  set constraints acesso_rotacao_com_segredo deferred;
end $$;

select plan(80);

select tests.entrar('unOff');
select criar_acesso(tests.metadados('ac-off', 'un-off', 'Unidade Inativa'), '', 'valor-sintetico', '');
select tests.sair();
update unidades set ativo = false where id = 'un-off';

select tests.entrar('eq1');
select throws_ok($$insert into acessos (id, nome, categoria, escopo, unidade_id, unidade_nome, responsavel_nome)
  values ('ac-equipe', 'Sistema de Gestão', 'gestao', 'unidade', 'un-1', 'Unidade Senhas', 'Responsável do Sistema')$$,
  '42501', null, '[regras] equipe da unidade não cadastra sistema no cofre');

select tests.entrar('fr1');
select throws_ok($$insert into acesso_segredos (acesso_id, login, senha, notas)
  values ('ac-s-solto', '', 'valor-sintetico', '')$$,
  '42501', null, '[regras] segredo de acesso inexistente é recusado');
select is(criar_acesso(tests.metadados('ac-s1', 'un-1', 'Unidade Senhas',
  jsonb_build_object('visivel_para', jsonb_build_array(tests.id('eq1')))), '', 'valor-sintetico', ''),
  'ac-s1', '[regras] franqueado cria acesso e segredo no mesmo lote');
select is((select count(*)::int from acesso_segredos where acesso_id = 'ac-s1'), 1, 'dono lê o segredo recém-criado');

select tests.entrar('oculto');
select is((select count(*)::int from acessos where id = 'ac-s1'), 1, '[regras] equipe fora de visivelPara lê metadados');
select is((select count(*)::int from acesso_segredos where acesso_id = 'ac-s1'), 0, '[regras] equipe fora de visivelPara NÃO lê segredo');

select tests.entrar('eq1');
select is((select count(*)::int from acesso_segredos where acesso_id = 'ac-s1'), 1, '[regras] equipe em visivelPara lê segredo');

select tests.entrar('fr2');
select is((select count(*)::int from acessos where id = 'ac-s1'), 0, '[regras] outra unidade não lê metadados');
select is((select count(*)::int from acesso_segredos where acesso_id = 'ac-s1'), 0, '[regras] outra unidade não lê segredo');

select tests.entrar('sem');
select is((select count(*)::int from acessos where id = 'ac-s1'), 0, '[regras] franqueado sem módulo senhas não lê metadados');
select is((select count(*)::int from acesso_segredos where acesso_id = 'ac-s1'), 0, '[regras] franqueado sem módulo senhas não lê segredo');

select tests.entrar('inativo');
select is((select count(*)::int from acessos where id = 'ac-s1'), 0, '[regras] usuário inativo não lê acesso');
select is((select count(*)::int from acesso_segredos where acesso_id = 'ac-s1'), 0, 'usuário inativo não lê o segredo da própria unidade');

select tests.entrar('unOff');
select is((select count(*)::int from acessos where id = 'ac-off'), 0, '[regras] unidade desativada não lê acesso');
select is((select count(*)::int from acesso_segredos where acesso_id = 'ac-off'), 0, 'unidade desativada não lê o próprio segredo');

select tests.entrar('rede');
select is((select count(*)::int from acessos where id = 'ac-s1'), 1, '[regras] equipe da franqueadora lê metadados da unidade');
select is((select count(*)::int from acesso_segredos where acesso_id = 'ac-s1'), 0, '[regras] equipe da franqueadora NÃO lê segredo da unidade');
select throws_ok($$select trocar_senha_acesso('ac-s1', '', 'outro-valor-sintetico', '')$$,
  '42501', null, 'equipe da franqueadora não rotaciona segredo da unidade');
select is(criar_acesso(tests.metadados('ac-rede1', '', ''), '', 'valor-sintetico', ''), 'ac-rede1',
  '[regras] equipe da franqueadora cria acesso e segredo da rede no mesmo lote');

select tests.entrar('fr1');
select is((select count(*)::int from acesso_segredos where acesso_id = 'ac-rede1'), 1, '[regras] franqueado com módulo lê segredo da rede');
select throws_ok($$select trocar_senha_acesso('ac-rede1', '', 'outro-valor-sintetico', '')$$,
  '42501', null, 'franqueado não rotaciona segredo da rede');
select throws_ok($$select criar_acesso(tests.metadados('ac-invalido-1', 'un-1', 'Unidade Senhas',
  '{"visivel_para":[123]}'), '', 'valor-sintetico', '')$$,
  '42501', null, '[regras] acesso recusa visivelPara com tipo não string');
select throws_ok($$select criar_acesso(tests.metadados('ac-invalido-2', 'un-1', 'Unidade Senhas',
  jsonb_build_object('visivel_para', jsonb_build_array(repeat('a', 129)))), '', 'valor-sintetico', '')$$,
  '42501', null, '[regras] acesso recusa visivelPara com uid longo demais');

select tests.entrar('eq1');
select lives_ok($$select tests.evento('ev-1', 'revelou', 'Visualizou a senha.', 'eq1', 'Equipe Visivel')$$,
  '[regras] quem pode ler segredo registra evento revelou');
select throws_ok($$select tests.evento('ev-livre', 'revelou', 'Texto sem relação com o evento', 'eq1', 'Equipe Visivel')$$,
  '42501', null, '[regras] quem pode ler segredo NÃO consegue gravar texto livre no evento');
select throws_ok($$select tests.evento('ev-frase-falsa', 'revelou', 'Visualizou a senha sem ponto', 'eq1', 'Equipe Visivel')$$,
  '42501', null, '[regras] evento de acesso recusa frase diferente da oficial');
select throws_ok($$select tests.evento('ev-3', 'revelou', 'Visualizou a senha.', 'eq1', 'Nome Falso')$$,
  '42501', null, '[regras] evento de acesso recusa autorNome forjado');

select tests.entrar('oculto');
select throws_ok($$select tests.evento('ev-2', 'revelou', 'Visualizou a senha.', 'oculto', 'Equipe Oculto')$$,
  '42501', null, '[regras] quem NÃO pode ler segredo é recusado ao registrar evento revelou');

select tests.entrar('admin');
select is((select count(*)::int from acessos where id = 'ac-s1'), 1, 'admin lê metadados da unidade');
select is((select count(*)::int from acesso_segredos where acesso_id = 'ac-s1'), 0, 'admin não lê segredo da unidade');
select is(tests.linhas($$update acesso_segredos set senha = 'outro-valor-sintetico' where acesso_id = 'ac-s1'$$), 0,
  'admin não atualiza segredo da unidade diretamente');
select throws_ok($$select trocar_senha_acesso('ac-s1', '', 'outro-valor-sintetico', '')$$,
  '42501', null, 'admin não atualiza segredo da unidade pela RPC');
select throws_ok($$select tests.evento('ev-admin', 'atualizacao', 'Acesso atualizado.', 'admin', 'Administrador')$$,
  '42501', null, '[regras] admin não grava evento em acesso da unidade');
select is((select count(*)::int from acesso_segredos where acesso_id = 'ac-rede1'), 1, 'admin lê segredo da rede');

select tests.entrar('fr2');
select lives_ok($$insert into acessos (id, nome, categoria, escopo, unidade_id, unidade_nome, responsavel_nome)
  values ('ac-s2', 'Sistema de Gestão', 'gestao', 'unidade', 'un-2', 'Unidade Dois Senhas', 'Dono Dois Senhas')$$,
  '[regras] franqueado 2 cria acesso da unidade 2');

select tests.entrar('admin');
select throws_ok($$insert into acesso_segredos (acesso_id, login, senha, notas)
  values ('ac-s2', '', 'valor-sintetico', '')$$, '42501', null, 'admin não cria segredo para acesso de unidade');
select tests.entrar('rede');
select throws_ok($$insert into acesso_segredos (acesso_id, login, senha, notas)
  values ('ac-s2', '', 'valor-sintetico', '')$$, '42501', null,
  'equipe da franqueadora não cria segredo para acesso de unidade');

select tests.entrar('oculto');
select lives_ok($$select tests.solicitar('sol-s1', 'ac-s1')$$, '[regras] equipe da unidade cria solicitação de acesso');
select throws_ok($$select tests.solicitar('sol-outra-un', 'ac-s2')$$,
  '42501', null, '[regras] solicitação com acessoId de outra unidade falha');
select throws_ok($$select tests.solicitar('sol-nome-forjado', 'ac-s1', 'Nome Forjado de Unidade')$$,
  '42501', null, '[regras] solicitação com unidadeNome forjado falha');

select tests.entrar('fr2');
select is(tests.linhas($$update solicitacoes_acesso set status = 'aprovada' where id = 'sol-s1'$$),
  0, '[regras] outra unidade não aprova solicitação');

select tests.entrar('fr1');
select is(tests.linhas($$update solicitacoes_acesso set status = 'aprovada' where id = 'sol-s1'$$),
  1, '[regras] franqueado da unidade aprova solicitação');
select is((select decidido_por from solicitacoes_acesso where id = 'sol-s1'), tests.id('fr1'), 'decisão recebe a autoria da sessão');
select throws_ok($$update solicitacoes_acesso set status = 'recusada' where id = 'sol-s1'$$,
  '42501', null, 'solicitação decidida não pode ser decidida de novo');
select tests.entrar('oculto');
select tests.solicitar('sol-imutavel', 'ac-s1');
select tests.entrar('fr1');
select throws_ok($$update solicitacoes_acesso set status = 'recusada', motivo = 'Outro motivo' where id = 'sol-imutavel'$$,
  '42501', null, 'decisão não altera o conteúdo da solicitação');
select throws_ok($$update acessos set escopo = 'rede', unidade_id = '', unidade_nome = '',
  visivel_para = '[]' where id = 'ac-s1'$$,
  '42501', null, 'escopo do acesso é imutável');
select throws_ok($$update acessos set unidade_nome = 'Outro nome' where id = 'ac-s1'$$,
  '42501', null, 'nome da unidade do acesso é imutável');

select throws_ok($$delete from acessos where id = 'ac-s1'$$, '42501', null, '[regras] franqueado não apaga acesso');
select throws_ok($$delete from acesso_segredos where acesso_id = 'ac-s1'$$, '42501', null, 'franqueado não apaga segredo');
select throws_ok($$delete from acesso_eventos where id = 'ev-1'$$, '42501', null, 'franqueado não apaga evento');
select throws_ok($$delete from solicitacoes_acesso where id = 'sol-s1'$$, '42501', null, 'franqueado não apaga solicitação');
select throws_ok($$update acesso_eventos set texto = 'Acesso atualizado.' where id = 'ev-1'$$,
  '42501', null, 'franqueado não altera evento');
select throws_ok($$update acesso_segredos set senha = 'outro-valor-sintetico' where acesso_id = 'ac-s1'$$,
  '42501', null, '[regras] gravar segredo sem atualizar ultimaTrocaEm é recusado');
update acessos set pendente_troca = true where id = 'ac-s1';
select throws_ok($$select tests.checar_lote(
  'update acessos set pendente_troca = false where id = ''ac-s1''')$$,
  '42501', null, 'limpar a pendência exige rotação do segredo no mesmo lote');
select throws_ok($$select tests.checar_lote(
  'update acessos set ultima_troca_em = now() where id = ''ac-s1''')$$,
  '23503', null, 'alterar a data de troca exige rotação do segredo no mesmo lote');
select throws_ok($$select tests.checar_lote(
  'update acessos set ultima_troca_em = now() where id = ''ac-s1''', 'consultor')$$,
  '23503', null, 'checagem da rotação vale mesmo ao perder visibilidade antes do fim do lote');
select throws_ok($$select trocar_senha_acesso('ac-s1', '', '', '')$$,
  '42501', null, 'RPC de rotação recusa senha vazia');
select ok((select pendente_troca from acessos where id = 'ac-s1'),
  'tentativas malsucedidas preservam a pendência de troca');
select lives_ok($$select trocar_senha_acesso('ac-s1', '', 'outro-valor-sintetico', '')$$,
  '[regras] gravar segredo com batch correto é aceito');
select ok((select s.atualizado_em = a.ultima_troca_em and not a.pendente_troca
  from acesso_segredos s join acessos a on a.id = s.acesso_id where a.id = 'ac-s1'),
  'rotação atualiza juntos o segredo, o carimbo e a pendência');

-- A visibilidade geral complementa a autorização nominal, sem dar permissão de escrita.
select lives_ok($$select atualizar_metadados_acesso('ac-s1', '{"visivel_para_equipe":true}')$$,
  'dono libera a visualização para a equipe');
select tests.entrar('oculto');
select is((select count(*)::int from acesso_segredos where acesso_id = 'ac-s1'), 1,
  'visibilidade geral libera leitura para equipe da própria unidade');
select throws_ok($$select trocar_senha_acesso('ac-s1', '', 'valor-sintetico', '')$$,
  '42501', null, 'visibilidade geral não libera rotação para a equipe');
select tests.entrar('fr2');
select is((select count(*)::int from acesso_segredos where acesso_id = 'ac-s1'), 0,
  'visibilidade geral não libera leitura para outra unidade');
select tests.entrar('fr1');
select atualizar_metadados_acesso('ac-s1', '{"visivel_para_equipe":false}');

select tests.entrar('oculto');
select tests.solicitar('sol-pedir', 'ac-s1');
select tests.entrar('fr1');
select lives_ok($$select decidir_solicitacao_acesso('sol-pedir', 'aprovada')$$,
  'aprovação adiciona a pessoa sem desfazer as permissões existentes');
select ok((select status = 'aprovada' and a.visivel_para ? tests.id('eq1')::text
    and a.visivel_para ? tests.id('oculto')::text
  from solicitacoes_acesso s join acessos a on a.id = s.acesso_id where s.id = 'sol-pedir'),
  'aprovação e permissões são gravadas juntas');

select tests.entrar('oculto');
insert into solicitacoes_acesso (id, tipo, status, acesso_id, acesso_nome, unidade_id, unidade_nome,
  solicitado_por, solicitado_por_nome, motivo, alvo_uid, alvo_nome)
values ('sol-revogar', 'revogar', 'aberta', 'ac-s1', 'Sistema de Gestão', 'un-1', 'Unidade Senhas',
  tests.id('oculto'), 'Equipe Oculto', 'Revogar acesso.', tests.id('oculto'), 'Equipe Oculto');
select tests.entrar('fr1');
select throws_ok($$select decidir_solicitacao_acesso('sol-revogar', 'aprovada')$$,
  '42501', null, 'revogação sem nova senha falha');
select is((select status from solicitacoes_acesso where id = 'sol-revogar'), 'aberta',
  'revogação malsucedida preserva a solicitação aberta');
select lives_ok($$select decidir_solicitacao_acesso('sol-revogar', 'aprovada', '', 'valor-sintetico', '')$$,
  'revogação com rotação é aceita');
select tests.entrar('oculto');
select is((select count(*)::int from acesso_segredos where acesso_id = 'ac-s1'), 0,
  'pessoa revogada perde a leitura do segredo');

select tests.entrar('admin');
select throws_ok($$delete from acessos where id = 'ac-s1'$$, '42501', null, '[regras] admin não apaga acesso');

select tests.entrar('consultor');
select is((select count(*)::int from acessos), 0, '[regras] ac: consultor não lê o cofre de acessos');

select tests.anonimo();
select throws_ok($$select * from acessos$$, '42501', null, 'anônimo não lê metadados');
select throws_ok($$select * from acesso_segredos$$, '42501', null, 'anônimo não lê segredos');
select throws_ok($$select * from acesso_eventos$$, '42501', null, 'anônimo não lê eventos');
select throws_ok($$select * from solicitacoes_acesso$$, '42501', null, 'anônimo não lê solicitações');
select throws_ok($$select criar_acesso('{}', '', 'valor-sintetico', '')$$,
  '42501', null, 'anônimo não executa a RPC de criação');
select throws_ok($$select trocar_senha_acesso('ac-s1', '', 'valor-sintetico', '')$$,
  '42501', null, 'anônimo não executa a RPC de rotação');
select throws_ok($$select atualizar_metadados_acesso('ac-s1', '{}')$$,
  '42501', null, 'anônimo não executa a RPC de metadados');
select throws_ok($$select decidir_solicitacao_acesso('sol-s1', 'aprovada')$$,
  '42501', null, 'anônimo não executa a RPC de decisão');

select * from finish();
rollback;
