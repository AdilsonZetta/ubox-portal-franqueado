begin;

create schema tests;
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['admin', 'fr1', 'eq1', 'fr2', 'rede']) with ordinality as t(apelido, n);

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
  ('un-ck2', 'Outra Ck', 'Pessoa Teste', 'dois@ubox.test', true);

insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, unidade, modulos_liberados)
select tests.id(a), a || '@ubox.test', n, p::public.papel, at, u,
  coalesce((select nome from public.unidades where id = u), ''), m
from (values
  ('admin', 'Admin Rede', 'admin', true, null, '{}'::text[]),
  ('fr1', 'Dono Ck', 'franqueado', true, 'un-ck', '{checklist}'),
  ('eq1', 'Equipe Ck', 'equipe_franqueado', true, 'un-ck', '{checklist}'),
  ('fr2', 'Dono Outra Ck', 'franqueado', true, 'un-ck2', '{checklist}'),
  ('rede', 'Rede Ck', 'equipe_franqueadora', true, null, '{checklist}')
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
  ('ck-outra', '{un-ck2}', true),
  ('ck-off', '{}', false)
) as modelos(id, unidades, ativo);

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
select plan(21);
select tests.entrar('eq1');
select lives_ok($$
  insert into checklist_rascunhos (uid, unidade_id, modelo_id, modelo_versao, periodo, respostas, atualizado_em)
  values (tests.id('fr2'), 'un-ck2', 'ck-rede', 2, '2026-11-26', '[]', '2000-01-01')
$$, 'Equipe cria rascunho com titularidade da sessão');
select is((select uid from checklist_rascunhos), tests.id('eq1'), 'UID vem da sessão');
select is((select unidade_id from checklist_rascunhos), 'un-ck', 'Unidade vem do perfil');
select cmp_ok((select atualizado_em from checklist_rascunhos), '>=', transaction_timestamp(), 'Criação usa horário do servidor');
select lives_ok($$
  insert into checklist_rascunhos (uid, unidade_id, modelo_id, modelo_versao, periodo, respostas, obs_geral)
  values (tests.id('eq1'), 'un-ck', 'ck-rede', 2, '2026-11-26', '[]', 'Em andamento')
  on conflict (uid, unidade_id, modelo_id, modelo_versao, periodo) do update set
    uid = excluded.uid, unidade_id = excluded.unidade_id, modelo_id = excluded.modelo_id,
    modelo_versao = excluded.modelo_versao, periodo = excluded.periodo, obs_geral = excluded.obs_geral,
    atualizado_em = '2000-01-01'
$$, 'Equipe atualiza via upsert');
select is((select obs_geral from checklist_rascunhos), 'Em andamento', 'Atualização persiste');
select cmp_ok((select atualizado_em from checklist_rascunhos), '>=', transaction_timestamp(), 'Atualização usa horário do servidor');
select throws_ok($$update checklist_rascunhos set periodo = 'avulsa'$$, '42501', null, 'Chave é imutável');
select throws_ok($$
  insert into checklist_rascunhos (modelo_id, modelo_versao, periodo, respostas) values ('ck-rede', 1, 'avulsa', '[]')
$$, '42501', null, 'Versão antiga é recusada');
select throws_ok($$
  insert into checklist_rascunhos (modelo_id, modelo_versao, periodo, respostas) values ('ck-outra', 2, 'avulsa', '[]')
$$, '42501', null, 'Modelo invisível é recusado');
select is((select count(*)::int from checklist_execucoes), 0, 'Rascunhos não criam execuções');

select tests.entrar('fr1');
select is(tests.linhas($$update checklist_rascunhos set obs_geral = 'Outro'$$), 0, 'Colega não atualiza');
select is(tests.linhas($$delete from checklist_rascunhos$$), 0, 'Colega não remove');
select is((select count(*)::int from checklist_rascunhos), 0, 'Colega não lê');
select tests.entrar('fr2');
select is((select count(*)::int from checklist_rascunhos), 0, 'Outra unidade não lê');
select tests.entrar('admin');
select is((select count(*)::int from checklist_rascunhos), 0, 'Admin não lê');
select tests.entrar('rede');
select is((select count(*)::int from checklist_rascunhos), 0, 'Franqueadora não lê');

select tests.entrar('eq1');
select throws_ok($$
  insert into checklist_rascunhos (modelo_id, modelo_versao, periodo, respostas) values ('ck-off', 2, 'avulsa', '[]')
$$, '42501', null, 'Modelo inativo é recusado');
insert into checklist_rascunhos (modelo_id, modelo_versao, periodo, respostas)
values ('ck-rede', 2, '2026-11-24', '[]'), ('ck-rede', 2, '2026-11-25', '[]');
select is(tests.linhas($$delete from checklist_rascunhos where periodo = '2026-11-24'$$), 1, 'Titular pode descartar o próprio rascunho');
select tests.entrar('fr1');
insert into checklist_rascunhos (modelo_id, modelo_versao, periodo, respostas) values ('ck-rede', 2, '2026-11-26', '[]');
select tests.entrar('eq1');
select tests.execucao('ex-final');
select is((select count(*)::int from checklist_rascunhos), 0, 'Envio final remove os rascunhos do titular para o modelo');
select tests.entrar('fr1');
select is((select count(*)::int from checklist_rascunhos), 1, 'Envio preserva o rascunho do colega');

select tests.sair();
select * from finish();
rollback;
