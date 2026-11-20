-- Testes da Fase 2 (gestão de acessos), portados de tests/regras.mjs (emulador do Firestore) + funções novas.
-- Mesma base de pessoas e unidades da fase 1. Tudo roda dentro de uma transação que termina em ROLLBACK:
-- nada fica no banco. Local: npm run test:supabase (PGlite). No projeto: o mesmo arquivo via SQL.
-- Feito por Grok Bot no Cursor (Antigravity sem cota).
begin;

create schema tests;
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['admin', 'fr1', 'eq1', 'fr2', 'eq2', 'redeAc', 'redeSem', 'pend', 'pend2', 'inativoUn',
                  'frOff', 'eqOff', 'dono3', 'nova', 'novaEq', 'novoFr', 'eqApagar',
                  'legado', 'visit', 'visitMod', 'novaRede', 'eqOk', 'eqCrm', 'resp', 'respFalha', 'eqProibida']) with ordinality as t(apelido, n);

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

select plan(46);

-- ===== portados de tests/regras.mjs (usuarios / unidades) =================
select tests.entrar('pend');
select is((select count(*)::int from public.usuarios where id = tests.id('fr1')), 0, '[regras] inativo não lê outro usuário');

select tests.entrar('fr1');
select throws_ok($$update public.usuarios set papel = 'admin' where id = tests.id('fr1')$$, '42501', null, '[regras] franqueado não vira admin');
select throws_ok($$update public.usuarios set modulos_liberados = '{manuais,crm,cliente}' where id = tests.id('fr1')$$, '42501', null, '[regras] franqueado não amplia os próprios módulos');
select is(tests.linhas($$update public.usuarios set nome = 'Dono Um Editado' where id = tests.id('fr1')$$), 1, '[regras] franqueado atualiza o próprio nome');

select tests.entrar('eq1');
select throws_ok($$update public.usuarios set modulos_liberados = '{manuais,crm}' where id = tests.id('eq1')$$, '42501', null, '[regras] equipe não amplia os próprios módulos');
select throws_ok($$update public.usuarios set papel = 'franqueado' where id = tests.id('eq1')$$, '42501', null, '[regras] equipe não muda o próprio papel');

select tests.entrar('admin');
select lives_ok($$insert into public.unidades (id, nome, responsavel, email, modulos_liberados) values ('un-nova', 'Unidade Nova', 'Dono Novo', 'nova@ubox.test', '{manuais}')$$, '[regras] admin cria unidade');
select tests.entrar('fr1');
select throws_ok($$insert into public.unidades (id, nome, responsavel, email, criado_por) values ('un-proibida', 'Proibida', 'Dono', 'p@ubox.test', tests.id('fr1'))$$, '42501', null, '[regras] franqueado não cria unidade');
select tests.entrar('redeSem');
select throws_ok($$insert into public.unidades (id, nome, responsavel, email, criado_por) values ('un-equipe', 'Da Equipe', 'Dono', 'e@ubox.test', tests.id('redeSem'))$$, '42501', null, '[regras] equipe da franqueadora não cria unidade');

select tests.entrar('admin');
select lives_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('novoFr'), 'novoFr@ubox.test', 'Franqueado Novo', 'franqueado', true, 'un-nova', '{manuais}', tests.id('admin'))$$, '[regras] admin cria franqueado');
select lives_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade, unidade_id, modulos_liberados, criado_por) values (tests.id('novaRede'), 'novaRede@ubox.test', 'Equipe Rede Nova', 'equipe_franqueadora', true, 'Franqueadora', null, '{marketing}', tests.id('admin'))$$, '[regras] admin cria equipe da franqueadora');
select throws_ok($$update public.usuarios set papel = 'admin' where id = tests.id('fr2')$$, '42501', null, '[regras] admin não promove alguém a admin');

select tests.entrar('fr1');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('eqProibida'), 'eqProibida@ubox.test', 'Escalada', 'equipe_franqueadora', true, null, '{manuais}', tests.id('fr1'))$$, '42501', null, '[regras] franqueado não cria equipe da franqueadora');
select lives_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('eqOk'), 'eqOk@ubox.test', 'Equipe Ok', 'equipe_franqueado', true, 'un-1', '{manuais}', tests.id('fr1'))$$, '[regras] franqueado cria equipe dentro dos módulos da unidade');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('eqProibida'), 'eqProibida@ubox.test', 'Sem Modulo', 'equipe_franqueado', true, 'un-1', '{estoque}', tests.id('fr1'))$$, '42501', null, '[regras] franqueado não libera módulo que a unidade não tem');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('eqProibida'), 'eqProibida@ubox.test', 'Outra Unidade', 'equipe_franqueado', true, 'un-2', '{manuais}', tests.id('fr1'))$$, '42501', null, '[regras] franqueado não cria equipe de outra unidade');
select tests.entrar('eq1');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por) values (tests.id('eqProibida'), 'eqProibida@ubox.test', 'Filho', 'equipe_franqueado', true, 'un-1', '{manuais}', tests.id('eq1'))$$, '42501', null, '[regras] equipe da unidade não cria outro usuário');

select tests.entrar('fr1');
select is(tests.linhas($$update public.usuarios set ativo = false where id = tests.id('eq1')$$), 1, '[regras] franqueado desativa a própria equipe');
select tests.entrar('fr2');
select is(tests.linhas($$update public.usuarios set ativo = true where id = tests.id('eq1')$$), 0, '[regras] outro franqueado não edita essa equipe');

select tests.entrar('fr1');
select is((select count(*)::int from public.usuarios where unidade_id = 'un-1' and papel = 'equipe_franqueado'), 4, '[regras] franqueado lista a própria equipe');
select is((select count(*)::int from public.usuarios where unidade_id = 'un-2' and papel = 'equipe_franqueado'), 0, '[regras] franqueado não lista a equipe de outra unidade');
select is((select count(*)::int from public.usuarios where papel <> 'equipe_franqueado' and id <> tests.id('fr1')), 0, '[regras] franqueado não lista todos os usuários');

select tests.entrar('visit');
select lives_ok($$insert into public.usuarios (id, email, nome, papel, ativo, recusado, modulos_liberados) values (tests.id('visit'), 'visit@ubox.test', 'Visitante', 'franqueado', false, false, '{}')$$, '[regras] cadastro próprio nasce franqueado inativo e sem módulos');
select tests.entrar('visitMod');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, recusado, modulos_liberados) values (tests.id('visitMod'), 'visitMod@ubox.test', 'Visitante Mod', 'franqueado', false, false, '{manuais}')$$, '42501', null, '[regras] cadastro não escolhe os próprios módulos');
select throws_ok($$insert into public.usuarios (id, email, nome, papel, ativo, recusado) values (tests.id('visitMod'), 'visitMod@ubox.test', 'Visitante Mod', 'admin', true, false)$$, '42501', null, '[regras] cadastro não nasce admin');

select tests.entrar('admin');
select is(tests.linhas($$update public.usuarios set modulos_liberados = '{manuais}' where id = tests.id('legado')$$), 1, '[regras] admin grava os módulos do franqueado legado');
select is(tests.linhas($$update public.usuarios set unidade_id = 'un-1' where id = tests.id('legado')$$), 1, '[regras] admin liga o legado a uma unidade ativa');
select throws_ok($$update public.usuarios set modulos_liberados = '{manuais,crm,estoque}' where id = tests.id('fr1')$$, '42501', null, '[regras] admin não libera módulo fora da unidade');

select tests.entrar('redeAc');
select is((select count(*)::int from public.unidades), 5, '[regras] ac: consultor lê o cadastro das unidades');
select is((select count(*)::int from public.usuarios where id <> tests.id('redeAc')), 0, '[regras] ac: consultor não lista usuários');
select tests.entrar('redeSem');
select is((select count(*)::int from public.unidades), 0, '[regras] ac: sem o módulo não lê o cadastro das unidades');

-- ===== criar_unidade_com_responsavel (Edge Function criar-conta, tipo unidade) ======
select tests.entrar('fr1');
select throws_ok($$select public.criar_unidade_com_responsavel('un-x', 'Unidade X', 'Uberaba', 'Resp', 'resp@ubox.test', '{manuais}', tests.id('resp'))$$, '42501', null, 'franqueado não cria unidade com responsável');
select tests.anonimo();
select throws_ok($$select public.criar_unidade_com_responsavel('un-x', 'Unidade X', 'Uberaba', 'Resp', 'resp@ubox.test', '{manuais}', tests.id('resp'))$$, '42501', null, 'anônimo não executa a função');
select tests.entrar('admin');
select lives_ok($$select public.criar_unidade_com_responsavel('un-resp', 'Unidade Resp', 'Uberaba', 'Responsável Novo', 'resp@ubox.test', '{manuais,crm}', tests.id('resp'))$$, 'admin cria unidade e responsável numa chamada');
select is((select row(papel::text, ativo, unidade_id, modulos_liberados, criado_por)::text from public.usuarios where id = tests.id('resp')),
  row('franqueado', true, 'un-resp', '{manuais,crm}'::text[], tests.id('admin'))::text, 'responsável nasce franqueado ativo da unidade, com os módulos dela');
select is((select row(uid, criado_por)::text from public.unidades where id = 'un-resp'), row(tests.id('resp'), tests.id('admin'))::text, 'unidade aponta para o responsável e registra o admin');
select throws_ok($$select public.criar_unidade_com_responsavel('un-falha', 'Unidade Falha', 'Uberaba', 'Resp', 'fr2@ubox.test', '{manuais}', tests.id('fr2'))$$, '23505', null, 'perfil que já existe faz a chamada falhar');
select is((select count(*)::int from public.unidades where id = 'un-falha'), 0, 'falha no perfil desfaz a unidade (tudo ou nada)');

-- ===== atualizar_unidade ==================================================
select tests.entrar('fr1');
select throws_ok($$select public.atualizar_unidade('un-1', 'Tomada', 'Uberaba', 'Dono', '{manuais}', true)$$, '42501', null, 'franqueado não edita a unidade');
select throws_ok($$select public.atualizar_unidade('un-2', 'Tomada', 'Araxá', 'Dono', '{manuais}', true)$$, '42501', null, 'franqueado não edita outra unidade');
select tests.entrar('admin');
select lives_ok($$select public.atualizar_unidade('un-1', 'Uberaba Centro Novo', 'Uberaba', 'Dono Um Novo', '{manuais}', true)$$, 'admin edita a unidade');
select is((select row(nome, unidade, modulos_liberados)::text from public.usuarios where id = tests.id('fr1')), row('Dono Um Novo', 'Uberaba Centro Novo', '{manuais}'::text[])::text, 'responsável recebe nome, unidade e módulos');
select is((select modulos_liberados from public.usuarios where id = tests.id('eqCrm')), '{manuais}'::text[], 'equipe perde o módulo que a unidade deixou de ter');
select is((select modulos_liberados from public.usuarios where id = tests.id('eq2')), '{manuais}'::text[], 'equipe de outra unidade não muda');
select lives_ok($$select public.atualizar_unidade('un-1', 'Uberaba Centro Novo', 'Uberaba', 'Dono Um Novo', '{manuais}', false)$$, 'admin desativa a unidade');
select is((select count(*)::int from public.usuarios where unidade_id = 'un-1' and ativo and papel in ('franqueado', 'equipe_franqueado') and id <> tests.id('legado')), 0, 'desativar a unidade desativa o responsável e a equipe');

select tests.sair();
select * from finish();
rollback;
