begin;

create schema tests;
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['admin', 'fr1', 'eq1']) with ordinality as t(apelido, n);

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
insert into public.unidades (id, nome, ativo, modulos_liberados)
values ('un-1', 'Unidade Um', true, '{manuais}');

insert into public.usuarios (id, email, nome, papel, ativo, recusado, unidade_id, unidade, modulos_liberados)
select tests.id(a), a || '@ubox.test', n, p::public.papel, true, false, u, un, m
from (values
  ('admin', 'Admin Rede', 'admin', null, '', '{}'::text[]),
  ('fr1', 'Franqueado Um', 'franqueado', 'un-1', 'Unidade Um', '{manuais}'),
  ('eq1', 'Equipe Um', 'equipe_franqueado', 'un-1', 'Unidade Um', '{manuais}')
) as v(a, n, p, u, un, m);
update public.unidades set uid = tests.id('fr1') where id = 'un-1';

insert into public.documentos (id, titulo, categoria_id, status, publico)
values ('man-1', 'Manual Um', 'cat-1', 'publicado', true);
insert into public.manuais_trilha (id, documento_id, titulo, ordem, anterior_id, tempo_minimo_seg, atualizado_por, atualizado_por_nome)
values ('man-1', 'man-1', 'Manual Um', 1, '', 60, tests.id('admin'), 'Admin Rede');

select plan(23);
select is((select consulta_livre from public.manuais_trilha where id = 'man-1'), false, 'consulta livre começa desativada');

select tests.entrar('admin');
select is(tests.linhas($$update public.manuais_trilha set consulta_livre = true where id = 'man-1'$$),
  1, 'gestor altera a consulta livre');

select tests.entrar('fr1');
select is(tests.linhas($$update public.manuais_trilha set consulta_livre = false where id = 'man-1'$$),
  0, 'franqueado não altera a consulta livre');
select is((select consulta_livre from public.manuais_trilha where id = 'man-1'), true, 'consulta livre continua ativa');
insert into public.progresso_manuais (id, uid, documento_id, nome, unidade_id, unidade_nome, status,
                                    tempo_minimo_seg, segundos_ativos, pausado_em)
values (auth.uid() || '_man-1', auth.uid(), 'man-1', 'Franqueado Um', 'un-1', 'Unidade Um',
        'em_andamento', 60, 999, now());
select is((select segundos_ativos from public.progresso_manuais), 0, 'inserção zera segundos enviados pelo cliente');
select is((select pausado_em from public.progresso_manuais), null::timestamptz, 'inserção inicia sem pausa');
select throws_ok($$update public.progresso_manuais set segundos_ativos = 60$$,
  '42501', 'Alteração inválida do cronômetro.', 'cliente não grava segundos ativos');
select throws_ok($$update public.progresso_manuais set pausado_em = now()$$,
  '42501', 'Alteração inválida do cronômetro.', 'cliente não grava a pausa');

select tests.sair();
update public.progresso_manuais set iniciado_em = now() - interval '20 seconds';
select tests.entrar('fr1');
select is((public.cronometro_manual('man-1', 'pausar')).segundos_ativos, 20, 'pausa credita a sessão curta');
select throws_ok($$select public.cronometro_manual('man-1', 'registrar')$$,
  '42501', 'Retome a leitura antes de registrar.', 'registro exige cronômetro em andamento');
select throws_ok($$update public.progresso_manuais set status = 'concluido'$$,
  '42501', 'Alteração inválida do cronômetro.', 'tempo ativo insuficiente impede conclusão');
select is((public.cronometro_manual('man-1', 'retomar')).segundos_ativos, 20, 'retomada conserva o tempo');
select is((select pausado_em from public.progresso_manuais), null::timestamptz, 'retomada limpa a pausa');

select tests.sair();
update public.progresso_manuais set iniciado_em = now() - interval '10 minutes';
select tests.entrar('fr1');
select is((public.cronometro_manual('man-1', 'pausar')).segundos_ativos, 65, 'cada chamada credita até 45 segundos');
select is((public.cronometro_manual('man-1', 'pausar')).segundos_ativos, 65, 'pausa repetida conserva o tempo');

select throws_ok($$select public.cronometro_manual('man-1', 'reiniciar')$$,
  '22023', 'Ação de cronômetro inválida.', 'rejeita ação desconhecida');
select is((public.cronometro_manual('man-1', 'retomar')).segundos_ativos, 65,
  'retomar descarta o intervalo anterior que ficou sem registro');

select tests.sair();
update public.progresso_manuais set iniciado_em = now() - interval '15 seconds';
select tests.entrar('fr1');
select is((public.cronometro_manual('man-1', 'registrar')).segundos_ativos, 80, 'registro credita uma sessão ativa');
select is((select iniciado_em from public.progresso_manuais), now(), 'registro inicia o próximo intervalo');
select is((select pausado_em from public.progresso_manuais), null::timestamptz, 'registro mantém o cronômetro ativo');
select public.cronometro_manual('man-1', 'pausar');

select tests.sair();
update public.progresso_manuais set segundos_ativos = 60, iniciado_em = now();
select tests.entrar('fr1');
select lives_ok($$update public.progresso_manuais set status = 'concluido'$$,
  'tempo acumulado basta para concluir sem nova sessão');

select tests.entrar('eq1');
select throws_ok($$select public.cronometro_manual('man-1', 'retomar')$$,
  'P0002', 'Progresso não encontrado.', 'outra pessoa não acessa progresso alheio');

select tests.anonimo();
select throws_ok($$select public.cronometro_manual('man-1', 'retomar')$$,
  '42501', 'permission denied for function cronometro_manual', 'anônimo não executa o RPC');

select tests.sair();
select * from finish();
rollback;
