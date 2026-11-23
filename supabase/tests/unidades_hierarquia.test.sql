begin;

create schema tests;
create function tests.id(a text) returns uuid language sql immutable as $$ select md5(a)::uuid $$;
create function tests.entrar(a text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.id(a), 'role', 'authenticated', 'email', a || '@ubox.test')::text, true);
  execute 'set local role authenticated';
end $$;
grant usage on schema tests to anon, authenticated;

insert into auth.users (id, email)
select tests.id(a), a || '@ubox.test' from unnest(array['admin', 'rede', 'gestor', 'gestor2', 'colaborador', 'outra']) a;

insert into public.unidades (id, nome, responsavel, email, modulos_liberados)
values ('un-b', 'Unidade B', 'Outra Pessoa', 'outra@ubox.test', '{manuais}');

insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados) values
  (tests.id('admin'), 'admin@ubox.test', 'Admin Rede', 'admin', true, null, '{}'),
  (tests.id('rede'), 'rede@ubox.test', 'Equipe Rede', 'equipe_franqueadora', true, null, '{manuais}'),
  (tests.id('outra'), 'outra@ubox.test', 'Outra Pessoa', 'equipe_franqueado', true, 'un-b', '{manuais}');

insert into public.documentos (id, titulo, categoria_id, status, publico, uids) values
  ('interno-rede', 'Manual interno', 'operacao', 'publicado', false, array[tests.id('rede')]),
  ('publico-rede', 'Manual da rede', 'operacao', 'publicado', true, '{}');

create function tests.unidade_a() returns text language sql stable as $$
  select current_setting('tests.unidade_a')
$$;

select plan(32);
select tests.entrar('admin');
select lives_ok($$select set_config('tests.unidade_a',
  public.salvar_unidade(null, 'UBOX Varginha', 'Varginha', 'MG', '04252011000110', '{manuais,crm}', true), true)$$,
  'admin cria unidade sem responsável');
select is((select row(uid, responsavel, email, uf, cnpj, criado_por)::text from public.unidades where id = tests.unidade_a()),
  row(null::uuid, '', '', 'MG', '04252011000110', tests.id('admin'))::text, 'unidade registra os dados e o admin');
select throws_ok($$select public.salvar_unidade('', 'Inválida', 'Cidade', 'XX', '', '{}', true)$$,
  '23514', null, 'UF inválida é recusada');
select throws_ok($$select public.salvar_unidade('', 'Inválida', 'Cidade', 'MG', '04.252.011/0001-10', '{}', true)$$,
  '23514', null, 'CNPJ com pontuação é recusado no banco');
select throws_ok($$select public.salvar_unidade('', 'Inválida', 'Cidade', 'MG', '123', '{}', true)$$,
  '23514', null, 'CNPJ curto é recusado');

select lives_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por)
  values (tests.id('gestor'), 'gestor@ubox.test', 'Gestor A', 'franqueado', true, tests.unidade_a(), '{manuais,crm}', auth.uid()),
         (tests.id('gestor2'), 'gestor2@ubox.test', 'Gestor Dois A', 'franqueado', true, tests.unidade_a(), '{crm}', auth.uid())$$,
  'admin cria gestores na unidade A');
select lives_ok($$insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados, criado_por)
  values (tests.id('colaborador'), 'colaborador@ubox.test', 'Colaborador A', 'equipe_franqueado', true, tests.unidade_a(),
          '{manuais,crm}', auth.uid())$$, 'admin cria colaborador na unidade A');

select tests.entrar('gestor');
select is((select array_agg(id) from public.unidades), array[tests.unidade_a()], 'gestor só vê a unidade A');
select is((select array_agg(email order by email) from public.usuarios), array['colaborador@ubox.test', 'gestor@ubox.test'],
  'gestor só vê a si e os colaboradores da própria unidade');
select is((select array_agg(id) from public.documentos where id in ('interno-rede', 'publico-rede')),
  array['publico-rede'], 'gestor lê manual público e não lê o interno da rede');

select tests.entrar('colaborador');
select is((select array_agg(id) from public.unidades), array[tests.unidade_a()], 'colaborador só vê a unidade A');
select is((select array_agg(id) from public.usuarios), array[tests.id('colaborador')], 'colaborador só vê o próprio perfil');
select is((select array_agg(id) from public.documentos where id in ('interno-rede', 'publico-rede')),
  array['publico-rede'], 'colaborador lê manual público e não lê o interno da rede');

select tests.entrar('rede');
select is((select count(*)::int from public.documentos where id = 'interno-rede'), 1, 'usuário autorizado da franqueadora lê o documento');

select tests.entrar('gestor');
select throws_ok($$select public.salvar_unidade(null, 'Proibida', 'Cidade', 'MG', '', '{}', true)$$,
  '42501', null, 'gestor não cria unidade');
select throws_ok($$select public.salvar_unidade(tests.unidade_a(), 'Proibida', 'Cidade', 'MG', '', '{}', true)$$,
  '42501', null, 'gestor não edita unidade');
select tests.entrar('colaborador');
select throws_ok($$select public.salvar_unidade(null, 'Proibida', 'Cidade', 'MG', '', '{}', true)$$,
  '42501', null, 'colaborador não cria unidade');
select throws_ok($$select public.salvar_unidade(tests.unidade_a(), 'Proibida', 'Cidade', 'MG', '', '{}', true)$$,
  '42501', null, 'colaborador não edita unidade');
select tests.entrar('rede');
select throws_ok($$select public.salvar_unidade(null, 'Proibida', 'Cidade', 'MG', '', '{}', true)$$,
  '42501', null, 'rede não cria unidade');
select throws_ok($$select public.salvar_unidade(tests.unidade_a(), 'Proibida', 'Cidade', 'MG', '', '{}', true)$$,
  '42501', null, 'rede não edita unidade');
select tests.entrar('gestor');
select throws_ok($$select public.definir_responsavel_unidade(tests.unidade_a(), tests.id('gestor'))$$,
  '42501', null, 'gestor não define responsável');

select tests.entrar('admin');
select throws_ok($$select public.definir_responsavel_unidade(tests.unidade_a(), tests.id('colaborador'))$$,
  '22023', null, 'colaborador não pode ser responsável');
select throws_ok($$select public.definir_responsavel_unidade('un-b', tests.id('gestor'))$$,
  '22023', null, 'gestor de outra unidade não pode ser responsável');
select lives_ok($$select public.definir_responsavel_unidade(tests.unidade_a(), tests.id('gestor'))$$,
  'admin define primeiro gestor como responsável');
select lives_ok($$select public.definir_responsavel_unidade(tests.unidade_a(), tests.id('gestor2'))$$,
  'segundo gestor pode ser cadastrado sem substituir responsável');
select is((select row(uid, responsavel, email)::text from public.unidades where id = tests.unidade_a()),
  row(tests.id('gestor'), 'Gestor A', 'gestor@ubox.test')::text, 'unidade mantém os dados do primeiro gestor');

update public.usuarios set ativo = false where id = tests.id('colaborador');
select lives_ok($$select public.salvar_unidade(tests.unidade_a(), 'UBOX Sul', 'Lavras', 'MG', '', '{manuais}', false)$$,
  'admin desativa unidade e reduz módulos');
select is((select count(*)::int from public.usuarios where unidade_id = tests.unidade_a()
  and unidade = 'UBOX Sul' and cidade = 'Lavras' and modulos_liberados <@ '{manuais}'::text[]), 3,
  'nome, cidade e teto chegam aos dois gestores e ao colaborador');
select is((select modulos_liberados from public.usuarios where id = tests.id('gestor2')), '{}'::text[],
  'gestor não ganha módulo que não tinha');
select tests.entrar('gestor');
select is((select count(*)::int from public.documentos where id = 'publico-rede'), 0, 'unidade inativa bloqueia o acesso ao manual');
select tests.entrar('admin');
select lives_ok($$select public.salvar_unidade(tests.unidade_a(), 'UBOX Sul', 'Lavras', 'MG', '', '{manuais}', true)$$,
  'admin reativa unidade');
select is((select array_agg(ativo order by email) from public.usuarios where unidade_id = tests.unidade_a()),
  array[false, true, true], 'reativar unidade preserva a desativação individual');

reset role;
select * from finish();
rollback;
