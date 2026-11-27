begin;
select plan(15);

insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
insert into public.unidades (id, nome, responsavel, email) values
  ('u', 'Unidade A', 'Equipe A', 'a@teste.local'), ('v', 'Unidade B', 'Equipe B', 'b@teste.local');
insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, modulos_liberados) values
  ('00000000-0000-0000-0000-000000000001', 'a@teste.local', 'Equipe A', 'equipe_franqueado', true, 'u', '{acesso}'),
  ('00000000-0000-0000-0000-000000000002', 'b@teste.local', 'Admin', 'admin', true, null, '{}');
insert into public.clientes (id, unidade_id, nome, telefone, email, box, contrato_inicio, valor_mensal_centavos,
  dia_vencimento, status, painel_token, obs, atualizado_por, atualizado_por_nome)
values ('c', 'u', 'Nome Cliente', '', '', '12', now(), 1000, 10, 'ativo', repeat('a',32), '',
  '00000000-0000-0000-0000-000000000001','Equipe A');
insert into public.unidade_acesso_config (unidade_id, webhook_token_hash, webhook_token_prefix)
values ('u', repeat('a',64), 'abcdef'), ('v', null, null);
insert into public.asaas_cobrancas_cache (unidade_id, cliente_id, payment_id, status, vencimento, valor)
values ('u','c','pay_u','vencido',current_date - 5,10), ('v',null,'pay_v','em_aberto',current_date,10);

select is((select tolerancia_dias from public.unidade_acesso_config where unidade_id = 'u'),5,'tolerância padrão');
select is((select webhook_token_hash from public.unidade_acesso_config where unidade_id = 'u'),repeat('a',64),'guarda hash');
select hasnt_column('public','unidade_acesso_config','webhook_token','sem coluna para token bruto');
select ok(not has_function_privilege('authenticated','public.ubox_acesso_ler_segredo(text,text)','execute'),'Vault inacessível');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.asaas_cobrancas_cache),1::bigint,'cache somente da unidade');
select is((select count(unidade_id) from public.unidade_acesso_config),1::bigint,'config somente da unidade');
select throws_ok('select webhook_token_hash from public.unidade_acesso_config','42501',null,'hash inacessível');
select throws_ok($$update public.unidade_acesso_config set webhook_token_hash = null$$,'42501',null,'hash sem escrita direta');
select is((select status from public.ubox_acesso_listar('u') where id = 'c'),'Sem facial','tabela facial ausente');
reset role;
create table if not exists public.cliente_faciais (cliente_id text, foto_path text, consentimento_em timestamptz, status text);
insert into public.cliente_faciais (cliente_id, foto_path, consentimento_em, status)
  select 'c','fixture.jpg',now(),'ativo'
  where not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='cliente_faciais' and column_name='unidade_id');
insert into public.cliente_faciais (cliente_id, unidade_id, foto_path, consentimento_em, consentimento_texto_versao, cadastrado_por, status)
  select 'c','u','u/c/00000000-0000-0000-0000-000000000099.jpg',now(),'2026-11-27-v1','unidade','enviado'
  where exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='cliente_faciais' and column_name='unidade_id')
    and not exists (select 1 from public.cliente_faciais where cliente_id='c');
set local role authenticated;
select is((select status from public.ubox_acesso_listar('u') where id = 'c'),'Liberado','último dia da tolerância');
reset role;
update public.asaas_cobrancas_cache set vencimento = current_date - 6 where payment_id = 'pay_u';
set local role authenticated;
select is((select status from public.ubox_acesso_listar('u') where id = 'c'),'Bloqueado por inadimplência','vencimento após tolerância');
select lives_ok($$select public.ubox_acesso_liberacao('c',true,'Acordo aprovado',null)$$,'equipe libera');
select is((select status from public.ubox_acesso_listar('u') where id = 'c'),'Liberado manualmente','liberação tem precedência');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.ubox_acesso_liberacao('c',true,'Novo acordo',current_date)$$,'admin libera');
select lives_ok($$select public.ubox_acesso_liberacao('c',false,null,null)$$,'admin encerra');
select * from finish();
rollback;
