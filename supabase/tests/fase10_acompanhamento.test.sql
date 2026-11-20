-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
begin;

create schema tests;
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['admin', 'fr1', 'eq1', 'fr2', 'redeSem', 'consultor', 'inativo', 'unInativa', 'redeInativa']) with ordinality as t(apelido, n);

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
  ('un-ac', 'Unidade Ac', 'Dono Ac', 'um@ubox.test', true),
  ('un-ac2', 'Outra Ac', 'Dono Outra Ac', 'dois@ubox.test', true);

insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados)
select tests.id(a), a || '@ubox.test', n, p::public.papel, at, u, m
from (values
  ('admin', 'Admin Rede', 'admin', true, null, '{}'::text[]),
  ('fr1', 'Dono Ac', 'franqueado', true, 'un-ac', '{}'),
  ('eq1', 'Equipe Ac', 'equipe_franqueado', true, 'un-ac', '{}'),
  ('fr2', 'Outro Dono', 'franqueado', true, 'un-ac2', '{}'),
  ('redeSem', 'Rede Sem Ac', 'equipe_franqueadora', true, null, '{checklist}'),
  ('consultor', 'Consultora Rede', 'equipe_franqueadora', true, null, '{acompanhamento}'),
  ('inativo', 'Conta Inativa', 'franqueado', false, 'un-ac', '{}'),
  ('unInativa', 'Dono Inativo', 'franqueado', true, 'un-ac', '{}'),
  ('redeInativa', 'Rede Inativa', 'equipe_franqueadora', false, null, '{acompanhamento}')
) as v(a, n, p, at, u, m);

create function tests.reg(chave text, extra jsonb default '{}') returns jsonb language sql as $$
  select '{"unidade_id":"un-ac","unidade_nome":"Unidade Ac","data":"2026-11-20T12:00:00Z",
    "tipo":"reuniao","notas":"Reunião mensal.","compartilhado":true,"gerado_por_ia":false,"ia_modelo":""}'
    ::jsonb || jsonb_build_object('id', chave) || extra
$$;
create function tests.registro(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into public.acompanhamento_registros
  select (jsonb_populate_record(null::public.acompanhamento_registros, tests.reg(chave, extra))).*
$$;
create function tests.passo(chave text, pai text, extra jsonb default '{}') returns void language sql as $$
  insert into public.acompanhamento_passos
  select (jsonb_populate_record(null::public.acompanhamento_passos,
    '{"unidade_id":"un-ac","descricao":"Revisar a escala","responsavel":"Dono Ac","prazo":"2026-12-10T12:00:00Z",
      "status":"aberto","compartilhado":true,"comentario_unidade":"","comentario_franqueadora":""}'::jsonb
    || jsonb_build_object('id', chave, 'registro_id', pai) || extra)).*
$$;

-- Dados legados incluem um passo com a unidade divergente do registro.
create function tests.carimbo() returns jsonb language sql as $$
  select jsonb_build_object('criado_em', now(), 'atualizado_em', now(),
    'atualizado_por', tests.id('consultor'), 'atualizado_por_nome', 'Consultora Rede')
$$;
select tests.registro(id, tests.carimbo() || jsonb_build_object('autor_uid', tests.id('consultor'),
  'autor_nome', 'Consultora Rede', 'unidade_id', unidade, 'compartilhado', compartilhado))
from (values ('reg-pub', 'un-ac', true), ('reg-priv', 'un-ac', false),
  ('reg-outra', 'un-ac2', true), ('reg-solo', 'un-ac', true)) as t(id, unidade, compartilhado);
select tests.passo(id, registro, tests.carimbo() || jsonb_build_object('status', status, 'compartilhado', compartilhado))
from (values ('p-pub', 'reg-pub', 'aberto', true), ('p-pub2', 'reg-pub', 'aberto', true),
  ('p-priv', 'reg-priv', 'aberto', false), ('p-val', 'reg-pub', 'validado', true),
  ('p-solo', 'reg-solo', 'aberto', true), ('p-cruz', 'reg-outra', 'aberto', true),
  ('p-legado', 'reg-priv', 'aberto', true)) as t(id, registro, status, compartilhado);

select plan(72);

select tests.entrar('consultor');
select lives_ok($cmd$select tests.registro('reg-1')$cmd$, '[regras] ac: consultor registra reunião');
select throws_ok($cmd$select tests.registro('reg-x', '{"autor_nome":"Outra Pessoa"}')$cmd$, '42501', null, '[regras] ac: registro em nome de outra pessoa é recusado');
select throws_ok($cmd$select tests.registro('reg-x', '{"unidade_id":"un-nao-existe"}')$cmd$, '42501', null, '[regras] ac: registro para unidade inexistente é recusado');
select throws_ok($cmd$select tests.registro('reg-x', '{"tipo":"almoco"}')$cmd$, '23514', null, '[regras] ac: tipo de registro desconhecido é recusado');
select throws_ok($cmd$select tests.registro('reg-x', '{"gerado_por_ia":true,"ia_modelo":"  "}')$cmd$, '23514', null, '[regras] ac: registro com IA só com espaços é recusado');
select lives_ok($cmd$select tests.registro('reg-ia', '{"gerado_por_ia":true,"ia_modelo":"Grok"}')$cmd$, '[regras] ac: registro com IA registrada é aceito');

select tests.entrar('redeSem');
select throws_ok($cmd$select tests.registro('reg-x')$cmd$, '42501', null, '[regras] ac: sem o módulo não registra');

select tests.entrar('fr1');
select throws_ok($cmd$select tests.registro('reg-x')$cmd$, '42501', null, '[regras] ac: franqueado não cria registro');

select tests.entrar('consultor');
select lives_ok($cmd$update acompanhamento_registros set notas = 'Metas revistas.' where id = 'reg-1'$cmd$, '[regras] ac: consultor edita as notas');
select throws_ok($cmd$update acompanhamento_registros set autor_nome = 'Outro' where id = 'reg-1'$cmd$, '42501', null, '[regras] ac: autor do registro não muda');
select throws_ok($cmd$update acompanhamento_registros set unidade_id = 'un-ac2', unidade_nome = 'Outra Ac' where id = 'reg-1'$cmd$, '42501', null, '[regras] ac: unidade do registro não muda');

select tests.entrar('admin');
select throws_ok($cmd$delete from acompanhamento_registros where id = 'reg-1'$cmd$, '42501', null, '[regras] ac: ninguém apaga registro');

select tests.entrar('fr1');
select is((select count(*)::int from acompanhamento_registros where unidade_id = 'un-ac' and compartilhado), 4, '[regras] ac: franqueado lista os registros compartilhados');

select tests.entrar('eq1');
select is((select count(*)::int from acompanhamento_registros where unidade_id = 'un-ac' and compartilhado), 4, '[regras] ac: equipe da unidade lê os compartilhados');

select tests.entrar('fr1');
-- A consulta ampla em SQL retorna apenas as linhas autorizadas pelo RLS.
select is((select count(*)::int from acompanhamento_registros where unidade_id = 'un-ac'), 4, '[regras] ac: unidade não lista sem filtrar compartilhados');
select is((select count(*)::int from acompanhamento_registros where id = 'reg-priv'), 0, '[regras] ac: unidade não lê registro interno');

select tests.entrar('fr2');
select is((select count(*)::int from acompanhamento_registros where unidade_id = 'un-ac' and compartilhado), 0, '[regras] ac: outra unidade não lê os registros');

select tests.entrar('consultor');
select lives_ok($cmd$select public.salvar_acompanhamento(tests.reg('reg-2', '{"compartilhado":false}'), false,
  '[{"id":"p-lote","descricao":"Revisar escala","responsavel":"Dono Ac","prazo":"2026-12-10Z"}]')$cmd$, '[regras] ac: registro e passos no mesmo lote');
select throws_ok($cmd$select tests.passo('p-x', 'reg-2')$cmd$, '42501', null, '[regras] ac: passo com visibilidade diferente do registro é recusado');
select throws_ok($cmd$select tests.passo('p-x', 'reg-outra')$cmd$, '42501', null, '[regras] ac: passo de outra unidade que a do registro é recusado');
select throws_ok($cmd$select tests.passo('p-x', 'reg-1', '{"status":"concluido_unidade"}')$cmd$, '42501', null, '[regras] ac: passo já nasce concluído é recusado');
select throws_ok($cmd$select tests.passo('p-x', 'reg-nao-existe')$cmd$, '42501', null, '[regras] ac: passo sem registro é recusado');

select tests.entrar('fr1');
select throws_ok($cmd$select tests.passo('p-x', 'reg-1')$cmd$, '42501', null, '[regras] ac: franqueado não cria passo');
select is((select count(*)::int from acompanhamento_passos where unidade_id = 'un-ac' and compartilhado), 4, '[regras] ac: franqueado lista passos compartilhados');
select is((select count(*)::int from acompanhamento_passos where id = 'p-priv'), 0, '[regras] ac: unidade não lê passo interno');
select is((select count(*)::int from acompanhamento_passos where id = 'p-legado'), 0,
  'Passo marcado como compartilhado fica oculto enquanto o pai for interno');
select is((select count(*)::int from acompanhamento_passos where id = 'p-cruz'), 0, '[regras] ac: unidade não lê passo pendurado em registro de outra unidade');
select is((select count(*)::int from acompanhamento_passos where id = 'p-solo'), 1, '[regras] ac: franqueado lê passo de registro compartilhado');

select tests.entrar('fr2');
select is((select count(*)::int from acompanhamento_passos where unidade_id = 'un-ac' and compartilhado), 0, '[regras] ac: outra unidade não lista os passos');

select tests.entrar('fr1');
select throws_ok($cmd$update acompanhamento_passos set status = 'concluido_unidade', comentario_unidade = '' where id = 'p-pub'$cmd$, '42501', null, '[regras] ac: franqueado não conclui sem comentário');
select throws_ok($cmd$update acompanhamento_passos set status = 'concluido_unidade', comentario_unidade = 'Escala publicada.', prazo = '2027-01-01Z' where id = 'p-pub'$cmd$, '42501', null, '[regras] ac: franqueado não muda o prazo');

select tests.entrar('eq1');
select is(tests.linhas($cmd$update acompanhamento_passos set status = 'concluido_unidade', comentario_unidade = 'Escala publicada.' where id = 'p-pub'$cmd$), 0, '[regras] ac: equipe da unidade não conclui');

select tests.entrar('fr1');
select is(tests.linhas($cmd$update acompanhamento_passos set status = 'concluido_unidade', comentario_unidade = 'Escala publicada.' where id = 'p-priv'$cmd$), 0, '[regras] ac: franqueado não conclui passo interno');

select tests.entrar('fr2');
select is(tests.linhas($cmd$update acompanhamento_passos set status = 'concluido_unidade', comentario_unidade = 'Escala publicada.' where id = 'p-pub'$cmd$), 0, '[regras] ac: outra unidade não conclui');

select tests.entrar('fr1');
select is(tests.linhas($cmd$update acompanhamento_passos set status = 'concluido_unidade', comentario_unidade = 'Escala publicada.' where id = 'p-pub'$cmd$), 1, '[regras] ac: franqueado marca como feito com comentário');

select tests.entrar('consultor');
select throws_ok($cmd$update acompanhamento_passos set status = 'validado' where id = 'p-pub2'$cmd$, '42501', null, '[regras] ac: franqueadora não valida o que a unidade não concluiu');
select throws_ok($cmd$update acompanhamento_passos set comentario_unidade = 'outro' where id = 'p-pub'$cmd$, '42501', null, '[regras] ac: franqueadora não reescreve o comentário da unidade');
select throws_ok($cmd$update acompanhamento_passos set status = 'reaberto', comentario_franqueadora = ' ' where id = 'p-pub'$cmd$, '42501', null, '[regras] ac: franqueadora não reabre sem comentário');
select is(tests.linhas($cmd$update acompanhamento_passos set status = 'reaberto', comentario_franqueadora = 'Falta domingo.' where id = 'p-pub'$cmd$), 1, '[regras] ac: franqueadora reabre com comentário');

select tests.entrar('fr1');
select is(tests.linhas($cmd$update acompanhamento_passos set status = 'concluido_unidade', comentario_unidade = 'Escala publicada.' where id = 'p-pub'$cmd$), 1, '[regras] ac: franqueado conclui de novo');

select tests.entrar('consultor');
select is(tests.linhas($cmd$update acompanhamento_passos set status = 'validado' where id = 'p-pub'$cmd$), 1, '[regras] ac: franqueadora valida');
select throws_ok($cmd$update acompanhamento_passos set descricao = 'mudou' where id = 'p-val'$cmd$, '42501', null, '[regras] ac: passo validado não muda mais');
select is(tests.linhas($cmd$update acompanhamento_passos set prazo = '2027-01-10Z' where id = 'p-pub2'$cmd$), 1, '[regras] ac: franqueadora ajusta prazo do passo aberto');
select throws_ok($cmd$update acompanhamento_passos set compartilhado = false where id = 'p-pub2'$cmd$, '42501', null, '[regras] ac: passo não muda de visibilidade sozinho');
select lives_ok($cmd$select public.salvar_acompanhamento(tests.reg('reg-pub', '{"compartilhado":false}'), true, '[]')$cmd$, '[regras] ac: deixar de compartilhar leva os passos junto (inclusive validados)');

select tests.entrar('fr1');
select is((select count(*)::int from acompanhamento_registros where id = 'reg-pub'), 0, '[regras] ac: unidade deixa de ver o registro descompartilhado');

select tests.entrar('consultor');
select is(tests.linhas($cmd$update acompanhamento_registros set compartilhado = false where id = 'reg-solo'$cmd$), 1, '[regras] ac: só o registro deixa de ser compartilhado');

select tests.entrar('fr1');
select is((select count(*)::int from acompanhamento_passos where id = 'p-solo'), 0, '[regras] ac: unidade não lê passo de registro descompartilhado');
select is((select count(*)::int from acompanhamento_passos where unidade_id = 'un-ac' and compartilhado and registro_id = 'reg-solo'), 0, '[regras] ac: unidade não lista passos de registro descompartilhado');
select is(tests.linhas($cmd$update acompanhamento_passos set status = 'concluido_unidade', comentario_unidade = 'Escala publicada.' where id = 'p-solo'$cmd$), 0, '[regras] ac: franqueado não conclui passo de registro descompartilhado');

select tests.entrar('admin');
select throws_ok($cmd$delete from acompanhamento_passos where id = 'p-pub'$cmd$, '42501', null, '[regras] ac: ninguém apaga passo');

select is((select count(*)::int from acompanhamento_passos where registro_id = 'reg-pub' and not compartilhado),
  3, 'O lote atualiza todos os passos, inclusive os validados');
select is((select count(*)::int from acompanhamento_passos where registro_id = 'reg-2' and not compartilhado),
  1, 'O passo novo acompanha o registro criado no lote');
select throws_ok($$select public.salvar_acompanhamento(tests.reg('reg-rollback'), false, '[{}]')$$,
  '23502', null, 'Falha no passo desfaz a criação do registro');
select is((select count(*)::int from acompanhamento_registros where id = 'reg-rollback'), 0, 'Registro do lote rejeitado está ausente');
select is((select autor_uid from acompanhamento_registros where id = 'reg-1'), tests.id('consultor'), 'Autor inicial vem da sessão');
select is((select atualizado_por_nome from acompanhamento_passos where id = 'p-pub'), 'Consultora Rede', 'Nome do carimbo vem do perfil');
select is((select atualizado_em = criado_em and criado_em between now() and statement_timestamp() from acompanhamento_registros where id = 'reg-ia'), true, 'Carimbo vem do servidor');

select lives_ok($$select tests.passo('p-ativo', 'reg-1')$$, 'Cria um passo compartilhado para testar a perda de acesso');
select tests.entrar('fr1');
select is((select count(*)::int from acompanhamento_passos), 1, 'A conta e a unidade ativas leem o passo');
select tests.entrar('eq1');
select is((select count(*)::int from acompanhamento_passos), 1, 'A equipe ativa sem módulo lê o passo');

select tests.entrar('redeSem');
select is((select count(*)::int from acompanhamento_registros), 0, 'redeSem não lê acompanhamento_registros');
select is((select count(*)::int from acompanhamento_passos), 0, 'redeSem não lê acompanhamento_passos');

select tests.entrar('inativo');
select is((select count(*)::int from acompanhamento_registros), 0, 'inativo não lê acompanhamento_registros');
select is((select count(*)::int from acompanhamento_passos), 0, 'inativo não lê acompanhamento_passos');

select tests.entrar('redeInativa');
select is((select count(*)::int from acompanhamento_registros), 0, 'redeInativa não lê acompanhamento_registros');
select is((select count(*)::int from acompanhamento_passos), 0, 'redeInativa não lê acompanhamento_passos');
select tests.sair();
update public.unidades set ativo = false where id = 'un-ac';

select tests.entrar('unInativa');
select is((select count(*)::int from acompanhamento_registros), 0, 'unInativa não lê acompanhamento_registros');
select is((select count(*)::int from acompanhamento_passos), 0, 'unInativa não lê acompanhamento_passos');

select tests.anonimo();
select throws_ok('select * from acompanhamento_registros', '42501', null, 'Anon não lê registros');
select throws_ok('select * from acompanhamento_passos', '42501', null, 'Anon não lê passos');
select throws_ok($$select public.salvar_acompanhamento('{}', false, '[]')$$, '42501', null, 'Anon não executa a RPC');
select tests.sair();
select * from finish();
rollback;
