begin;
select plan(33);

create schema portal_test;
grant usage on schema portal_test to authenticated, anon;
create function portal_test.uid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function portal_test.entrar(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', portal_test.uid(n), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function portal_test.token(letra text) returns text language sql immutable as $$ select repeat(letra, 32) $$;

insert into auth.users (id,email) select portal_test.uid(n), n || '@exemplo.test' from generate_series(1, 6) n;
insert into public.unidades (id,nome,responsavel,email) values
  ('u','Unidade Um','Equipe Ubox','u@exemplo.test'), ('v','Unidade Dois','Equipe Ubox','v@exemplo.test');

insert into public.usuarios (id,email,nome,papel,ativo,unidade_id,unidade,modulos_liberados)
values (portal_test.uid(1),'1@exemplo.test','Equipe Ubox','equipe_franqueado',true,'u','Unidade Um','{cliente}'),
       (portal_test.uid(2),'2@exemplo.test','Equipe Ubox','franqueado',true,'v','Unidade Dois','{cliente}'),
       (portal_test.uid(3),'3@exemplo.test','Admin Ubox','admin',true,null,'','{}'),
       (portal_test.uid(6),'6@exemplo.test','Equipe da rede','equipe_franqueadora',true,null,'','{cliente}');

create function portal_test.criar(id text, unidade text, nome_unidade text, cpf text, letra text) returns text language sql as $$
  select public.criar_cliente(id, portal_test.token(letra),
    '{"nome":"Maria Silva","telefone":"","email":"","box":"Box 1","contrato_inicio":"2026-11-01",
      "contrato_fim":null,"valor_mensal_centavos":28990,"dia_vencimento":10,"status":"ativo","obs":""}'::jsonb
      || jsonb_build_object('unidade_id', unidade, 'cpf', cpf, 'asaas_customer_id', 'cus_exemplo'),
    '{"contato_unidade":"","primeiro_nome":"Maria","box":"Box 1","contrato_inicio":"2026-11-01",
      "contrato_fim":null,"valor_mensal_centavos":28990,"dia_vencimento":10,"ativo":true}'::jsonb
      || jsonb_build_object('unidade_nome', nome_unidade))
$$;

select is((select public from storage.buckets where id = 'cliente-faciais'), false, 'Bucket facial é privado');
select portal_test.entrar(1);
select is(portal_test.criar('c1','u','Unidade Um','529.982.247-25','a'), 'c1', 'Equipe cria com CPF e Asaas');
select is((select cpf from public.clientes where id = 'c1'), '52998224725', 'CPF é normalizado');
select is((select asaas_customer_id from public.clientes where id = 'c1'), 'cus_exemplo', 'ID Asaas é persistido');
select throws_ok($$select portal_test.criar('duplicado','u','Unidade Um','52998224725','d')$$,
  '23505', null, 'Mesma unidade não repete CPF');
select portal_test.criar('vizinho','u','Unidade Um','11144477735','e');
select is(public.trocar_link_cliente('c1', portal_test.token('a'), portal_test.token('c')),
  portal_test.token('c'), 'Equipe pode trocar o link existente');
select lives_ok($$insert into public.cliente_faciais values ('c1','u',
  'u/c1/00000000-0000-4000-8000-000000000001.jpg',now(),'2026-11-27-v1','unidade','pendente_envio',now())$$,
  'Equipe grava facial da própria unidade');
set constraints all immediate;
set constraints all deferred;
reset role;
select portal_test.entrar(2);
select is(portal_test.criar('c2','v','Unidade Dois','52998224725','b'), 'c2', 'Outra unidade pode usar o mesmo CPF');
select throws_ok($$insert into public.cliente_faciais values ('vizinho','u',
  'u/vizinho/00000000-0000-4000-8000-000000000002.jpg',now(),'2026-11-27-v1','unidade','pendente_envio',now())$$,
  '42501', null, 'Equipe de outra unidade não grava facial');
set constraints all immediate;
reset role;
select set_config('request.jwt.claims', '', true);

select is(public.preparar_acesso_cliente(portal_test.uid(2), 'c1'), null::jsonb, 'Acesso não pode ser criado por outra unidade');
select is(public.preparar_acesso_cliente(portal_test.uid(3), 'c1'), null::jsonb, 'Admin não pode criar acesso');
select is(public.preparar_acesso_cliente(portal_test.uid(1), 'c1', portal_test.uid(4), '4@exemplo.test')->>'uid',
  portal_test.uid(4)::text, 'RPC de serviço vincula auth ao cliente da unidade');
select public.preparar_acesso_cliente(portal_test.uid(2), 'c2', portal_test.uid(5), '5@exemplo.test');
select is((select count(*) from public.contas_login_cliente('52998224725')), 2::bigint, 'Login por CPF encontra as duas unidades');
select ok(not has_function_privilege('anon', 'public.contas_login_cliente(text,text)', 'EXECUTE'), 'Anônimo não acessa o mapeamento');
select ok(not has_function_privilege('authenticated', 'public.preparar_acesso_cliente(uuid,text,uuid,text)', 'EXECUTE'),
  'Sessão comum não acessa preparação privilegiada');

insert into storage.objects (bucket_id,name) values
  ('cliente-faciais','u/c1/00000000-0000-4000-8000-000000000001.jpg'),
  ('cliente-faciais','v/c2/00000000-0000-4000-8000-000000000002.png');

insert into public.cliente_painel_cobrancas values
  (portal_test.token('c'),'2026-11','2026-11',28990,'2026-11-10','pendente',''),
  (portal_test.token('a'),'2026-10','2026-10',28990,'2026-10-10','pago','2026-10-10'),
  (portal_test.token('b'),'2026-11','2026-11',28990,'2026-11-10','pendente','');
insert into public.cliente_painel_recados (painel_token,texto,autor,gerado_por_ia,ia_modelo) values
  (portal_test.token('c'),'Recado próprio','Equipe',false,''), (portal_test.token('b'),'Outro recado','Equipe',false,'');

insert into public.documentos (id,titulo,categoria_id,status,publico)
  values ('manual-teste','Manual da equipe','operacao','publicado',true);
select portal_test.entrar(3);
select public.criar_demanda_unidades(array['u'], 'Demanda da unidade', '', 'operacao', 'alta',
  null, '{}', '{}', '[]');
reset role;
select portal_test.entrar(4);
select results_eq('select id from public.clientes', $$values ('c1'::text)$$, 'Cliente só lê o próprio cadastro');
select results_eq('select token from public.cliente_paineis', $$values (portal_test.token('c'))$$, 'Só lê o token atual');
select results_eq('select competencia from public.cliente_painel_cobrancas', $$values ('2026-11'::text)$$, 'Só lê cobranças do token atual');
select results_eq('select texto from public.cliente_painel_recados', $$values ('Recado próprio'::text)$$, 'Só lê os próprios recados');
select results_eq('select cliente_id from public.cliente_faciais', $$values ('c1'::text)$$, 'Cliente vê a própria facial');
select is((select count(*) from public.usuarios), 1::bigint, 'Cliente só lê o próprio perfil');
select results_eq($$select name from storage.objects where bucket_id = 'cliente-faciais'$$,
  $$values ('u/c1/00000000-0000-4000-8000-000000000001.jpg'::text)$$, 'Cliente vê somente o seu prefixo');
select throws_ok($$insert into storage.objects (bucket_id,name) values
  ('cliente-faciais','u/vizinho/00000000-0000-4000-8000-000000000001.jpg')$$,
  '42501', null, 'Cliente não grava no prefixo de outro locatário');
select is((select count(*) from public.documentos), 0::bigint, 'Cliente não lê documentos');
select is((select count(*) from public.demandas), 0::bigint, 'Cliente não lê demandas');
select throws_ok($$insert into public.cliente_painel_cobrancas values
  (portal_test.token('c'),'2026-12','2026-12',28990,'2026-12-10','pendente','')$$, '42501', null, 'Cliente não lança cobranças');

reset role;
select portal_test.entrar(3);
select is((select count(foto_path) from public.cliente_faciais), 0::bigint, 'Admin não vê caminhos de fotos');
select is((select count(*) from storage.objects where bucket_id = 'cliente-faciais'), 0::bigint, 'Admin não lê objetos do bucket facial');
reset role;
select portal_test.entrar(6);
select is((select count(foto_path) from public.cliente_faciais), 0::bigint, 'Equipe da franqueadora não vê fotos');
reset role;
select portal_test.entrar(1);
select public.salvar_cliente('c1', portal_test.token('c'), '{"status":"encerrado"}', 'Maria');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*) from public.contas_login_cliente('52998224725','u')), 0::bigint, 'Encerramento desativa login');
select is((select count(*) from public.cliente_faciais where cliente_id = 'c1'), 0::bigint, 'Encerramento exclui facial');
select is(public.painel_publico(portal_test.token('c')), null::jsonb, 'Encerramento desativa link público');
select portal_test.entrar(4);
select is((select count(*) from storage.objects where bucket_id = 'cliente-faciais'), 0::bigint, 'Sessão antiga não lê fotos após encerramento');
reset role;

select * from finish();
rollback;
