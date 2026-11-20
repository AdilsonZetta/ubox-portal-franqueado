-- Testes de RLS da Fase 1 (pgTAP). Tudo roda dentro de uma transação que termina em ROLLBACK:
-- nada fica no banco. Local: npm run test:supabase (PGlite). No projeto: o mesmo arquivo via SQL.
-- Feito por Grok Bot no Cursor (Antigravity sem cota).
begin;

create schema tests;
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['admin', 'fr1', 'eq1', 'fr2', 'eq2', 'redeAc', 'redeSem', 'pend', 'pend2', 'inativoUn',
                  'frOff', 'eqOff', 'dono3', 'nova', 'novaEq', 'novoFr', 'eqApagar']) with ordinality as t(apelido, n);

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

select plan(71);

-- ===== usuarios: leitura =============================================
select tests.entrar('pend');
select is((select count(*)::int from public.usuarios), 1, 'pessoa pendente só vê o próprio perfil');
select tests.entrar('admin');
select is((select count(*)::int from public.usuarios), 14, 'admin vê todos os perfis');
select tests.entrar('fr1');
select is((select array_agg(nome order by nome) from public.usuarios), array['Equipe Apagar', 'Equipe Um', 'Franqueado Um'], 'franqueado vê a si e à equipe da unidade');
select is((select count(*)::int from public.usuarios where unidade_id = 'un-2'), 0, 'franqueado não vê pessoas de outra unidade');
select tests.entrar('eq1');
select is((select count(*)::int from public.usuarios), 1, 'equipe só vê o próprio perfil');
select tests.entrar('redeAc');
select is((select count(*)::int from public.usuarios), 1, 'equipe da franqueadora só vê o próprio perfil');
select tests.entrar('frOff');
select is((select count(*)::int from public.usuarios), 1, 'franqueado de unidade desativada não vê a equipe');
select tests.anonimo();
select throws_ok('select * from public.usuarios', '42501', null, 'anônimo não lê perfis');

-- ===== usuarios: cadastro próprio ====================================
select tests.entrar('nova');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo) values (tests.id('nova'), 'nova@ubox.test', 'Nova', 'admin', false)$$, '42501', null, 'cadastro próprio como admin é negado');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo) values (tests.id('nova'), 'nova@ubox.test', 'Nova', 'franqueado', true)$$, '42501', null, 'cadastro próprio já ativo é negado');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, modulos_liberados) values (tests.id('nova'), 'nova@ubox.test', 'Nova', 'franqueado', '{crm}')$$, '42501', null, 'cadastro próprio com módulos é negado');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, unidade_id) values (tests.id('nova'), 'nova@ubox.test', 'Nova', 'franqueado', 'un-1')$$, '42501', null, 'cadastro próprio escolhendo unidade é negado');
select throws_ok($$insert into public.usuarios (id, email, nome, papel) values (tests.id('nova'), 'outro@ubox.test', 'Nova', 'franqueado')$$, '42501', null, 'cadastro próprio com e-mail diferente do login é negado');
select throws_ok($$insert into public.usuarios (id, email, nome, papel) values (tests.id('novaEq'), 'nova@ubox.test', 'Nova', 'franqueado')$$, '42501', null, 'cadastro em nome de outra conta é negado');
select lives_ok($$insert into public.usuarios (id, email, nome, papel, unidade, cidade) values (tests.id('nova'), 'nova@ubox.test', 'Nova Pessoa', 'franqueado', 'Uberaba Sul', 'Uberaba')$$, 'cadastro próprio: franqueado inativo, sem módulos');
select tests.sair();
select ok((select criado_em > now() - interval '1 minute' and not ativo from public.usuarios where id = tests.id('nova')), 'cadastro recebe o horário do servidor e fica inativo');

-- ===== usuarios: admin cria =========================================
select tests.entrar('admin');
select lives_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('novoFr'), 'novoFr@ubox.test', 'Novo Franqueado', 'franqueado', true, 'un-1', '{manuais,cliente}', tests.id('admin'))$$, 'admin cria franqueado com módulos da unidade');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('novaEq'), 'novaEq@ubox.test', 'Nova Equipe', 'equipe_franqueado', true, 'un-2', '{crm}', tests.id('admin'))$$, '42501', null, 'admin não dá módulo que a unidade não tem');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, criado_por) values (tests.id('novaEq'), 'novaEq@ubox.test', 'Nova Equipe', 'admin', true, tests.id('admin'))$$, '42501', null, 'admin não cria outro admin pelo app');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, criado_por) values (tests.id('novaEq'), 'novaEq@ubox.test', 'Nova Equipe', 'equipe_franqueado', true, 'un-1', tests.id('fr1'))$$, '42501', null, 'admin não grava outro autor');

-- ===== usuarios: franqueado cria equipe ==============================
select tests.entrar('fr1');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('novaEq'), 'novaEq@ubox.test', 'Nova Equipe', 'equipe_franqueado', true, 'un-1', '{cliente}', tests.id('fr1'))$$, '42501', null, 'franqueado não dá módulo que ele não tem');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('novaEq'), 'novaEq@ubox.test', 'Nova Equipe', 'equipe_franqueado', true, 'un-2', '{manuais}', tests.id('fr1'))$$, '42501', null, 'franqueado não cria equipe em outra unidade');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('novaEq'), 'novaEq@ubox.test', 'Nova Equipe', 'franqueado', true, 'un-1', '{manuais}', tests.id('fr1'))$$, '42501', null, 'franqueado não cria outro franqueado');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('novaEq'), 'novaEq@ubox.test', 'Nova Equipe', 'equipe_franqueado', false, 'un-1', '{manuais}', tests.id('fr1'))$$, '42501', null, 'equipe nasce ativa (como no Firestore)');
select lives_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('novaEq'), 'novaEq@ubox.test', 'Nova Equipe', 'equipe_franqueado', true, 'un-1', '{manuais,crm}', tests.id('fr1'))$$, 'franqueado cria equipe da própria unidade');
select tests.entrar('frOff');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('pend2'), 'x@ubox.test', 'Equipe Off Dois', 'equipe_franqueado', true, 'un-off', '{manuais}', tests.id('frOff'))$$, '42501', null, 'franqueado de unidade desativada não cria equipe');
select tests.entrar('eq1');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('pend2'), 'x@ubox.test', 'Equipe Dois', 'equipe_franqueado', true, 'un-1', '{}', tests.id('eq1'))$$, '42501', null, 'equipe não cria pessoas');
select tests.entrar('redeAc');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, criado_por) values (tests.id('pend2'), 'x@ubox.test', 'Rede Dois', 'equipe_franqueadora', true, tests.id('redeAc'))$$, '42501', null, 'equipe da franqueadora não cria pessoas');

-- ===== usuarios: atualização =========================================
select tests.entrar('eq1');
select is(tests.linhas($$update public.usuarios set nome = 'Equipe Um Renomeada' where id = tests.id('eq1')$$), 1, 'pessoa muda o próprio nome');
select throws_ok($$update public.usuarios set papel = 'franqueado' where id = tests.id('eq1')$$, '42501', null, 'pessoa não muda o próprio papel');
select throws_ok($$update public.usuarios set modulos_liberados = '{manuais,crm}' where id = tests.id('eq1')$$, '42501', null, 'pessoa não muda os próprios módulos');
select throws_ok($$update public.usuarios set unidade_id = 'un-2' where id = tests.id('eq1')$$, '42501', null, 'pessoa não muda de unidade');
select is(tests.linhas($$update public.usuarios set nome = 'Invasão' where id = tests.id('fr1')$$), 0, 'equipe não edita o franqueado');
select tests.entrar('pend');
select throws_ok($$update public.usuarios set ativo = true where id = tests.id('pend')$$, '42501', null, 'pendente não se ativa');
select tests.sair();
select ok((select atualizado_em > now() - interval '1 minute' from public.usuarios where id = tests.id('eq1')), 'atualização recebe o horário do servidor');

select tests.entrar('fr1');
select is(tests.linhas($$update public.usuarios set nome = 'Equipe Um B', ativo = false, modulos_liberados = '{crm}' where id = tests.id('eq1')$$), 1, 'franqueado edita nome, status e módulos da equipe');
select throws_ok($$update public.usuarios set modulos_liberados = '{cliente}' where id = tests.id('eq1')$$, '42501', null, 'franqueado não dá à equipe módulo que ele não tem');
select throws_ok($$update public.usuarios set unidade_id = 'un-2' where id = tests.id('eq1')$$, '42501', null, 'franqueado não muda a equipe de unidade');
select throws_ok($$update public.usuarios set papel = 'franqueado' where id = tests.id('eq1')$$, '42501', null, 'franqueado não promove a equipe');
select is(tests.linhas($$update public.usuarios set nome = 'Invasão' where id = tests.id('eq2')$$), 0, 'franqueado não edita equipe de outra unidade');
select tests.entrar('redeAc');
select is(tests.linhas($$update public.usuarios set nome = 'Invasão' where id = tests.id('fr1')$$), 0, 'equipe da franqueadora não edita perfis');

select tests.entrar('admin');
select is(tests.linhas($$update public.usuarios set modulos_liberados = '{manuais,crm,cliente}' where id = tests.id('fr1')$$), 1, 'admin libera módulos dentro dos da unidade');
select throws_ok($$update public.usuarios set modulos_liberados = '{nuvem}' where id = tests.id('fr1')$$, '42501', null, 'admin não libera módulo fora da unidade');
select throws_ok($$update public.usuarios set papel = 'admin' where id = tests.id('fr1')$$, '42501', null, 'admin não muda papel');
select throws_ok($$update public.usuarios set email = 'outro@ubox.test' where id = tests.id('fr1')$$, '42501', null, 'admin não muda e-mail');
select throws_ok($$update public.usuarios set criado_em = now() - interval '1 year' where id = tests.id('fr1')$$, '42501', null, 'data de criação é imutável');
select is(tests.linhas($$update public.usuarios set recusado = true where id = tests.id('pend2')$$), 1, 'admin recusa cadastro');

-- ===== usuarios: exclusão ============================================
select tests.entrar('fr1');
select is(tests.linhas($$delete from public.usuarios where id = tests.id('eqApagar')$$), 0, 'franqueado não apaga perfil');
select tests.entrar('admin');
select is(tests.linhas($$delete from public.usuarios where id = tests.id('eqApagar')$$), 1, 'admin apaga perfil');

-- ===== unidades =======================================================
select tests.entrar('admin');
select is((select count(*)::int from public.unidades), 4, 'admin vê todas as unidades');
select tests.entrar('fr1');
select is((select array_agg(id) from public.unidades), array['un-1'], 'franqueado vê só a própria unidade');
select tests.entrar('eq2');
select is((select array_agg(id) from public.unidades), array['un-2'], 'equipe vê só a própria unidade');
select tests.entrar('inativoUn');
select is((select array_agg(id) from public.unidades), array['un-1'], 'cadastro inativo ainda lê a unidade (tela de aguardando)');
select tests.entrar('dono3');
select is((select array_agg(id) from public.unidades), array['un-3'], 'dono marcado em unidades.uid lê a unidade');
select tests.entrar('redeAc');
select is((select count(*)::int from public.unidades), 4, 'consultor do acompanhamento vê o cadastro das unidades');
select tests.entrar('redeSem');
select is((select count(*)::int from public.unidades), 0, 'equipe da franqueadora sem o módulo não vê unidades');
select tests.anonimo();
select throws_ok('select * from public.unidades', '42501', null, 'anônimo não lê unidades');

select tests.entrar('fr1');
select throws_ok($$insert into public.unidades (nome, responsavel, email) values ('Nova', 'Dono', 'n@ubox.test')$$, '42501', null, 'franqueado não cria unidade');
select is(tests.linhas($$update public.unidades set modulos_liberados = '{manuais,crm,cliente,nuvem}' where id = 'un-1'$$), 0, 'franqueado não libera módulos na unidade');
select is(tests.linhas($$delete from public.unidades where id = 'un-1'$$), 0, 'franqueado não apaga unidade');
select tests.entrar('admin');
select lives_ok($$insert into public.unidades (id, nome, responsavel, email) values ('un-nova', 'Nova', 'Dono Novo', 'n@ubox.test')$$, 'admin cria unidade');
select is((select criado_por from public.unidades where id = 'un-nova'), tests.id('admin'), 'unidade registra quem criou');
select throws_ok($$insert into public.unidades (id, nome, responsavel, email, criado_por) values ('un-x', 'Outra', 'Dono', 'x@ubox.test', tests.id('fr1'))$$, '42501', null, 'admin não grava outro autor na unidade');
select throws_ok($$update public.unidades set criado_por = tests.id('fr1') where id = 'un-nova'$$, '42501', null, 'autor da unidade é imutável');
select is(tests.linhas($$update public.unidades set ativo = false where id = 'un-nova'$$), 1, 'admin desativa unidade');
select is(tests.linhas($$delete from public.unidades where id = 'un-nova'$$), 1, 'admin apaga unidade');

-- ===== primeiro admin (config/adminCriado) ===========================
select tests.entrar('fr1');
select throws_ok($$insert into public.admin_lock (uid, email) values (tests.id('fr1'), 'fr1@ubox.test')$$, '42501', null, 'quem não é admin não grava a trava');
select tests.entrar('pend');
select is(tests.linhas($$update public.usuarios set papel = 'admin', ativo = true where id = tests.id('pend')$$), 1, 'sem trava, o franqueado inativo vira o primeiro admin');
select tests.sair();
select is((select uid from public.admin_lock), tests.id('pend'), 'a promoção grava a trava no mesmo comando');
select tests.entrar('nova');
select throws_ok($$update public.usuarios set papel = 'admin', ativo = true where id = tests.id('nova')$$, '42501', null, 'com a trava, ninguém mais vira admin sozinho');
select tests.entrar('fr1');
select is((select count(*)::int from public.admin_lock), 0, 'franqueado não lê a trava');

select tests.sair();
select * from finish();
rollback;
