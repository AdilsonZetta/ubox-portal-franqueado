-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
begin;

create schema tests;
select plan(112);
create table tests.pessoas (apelido text primary key, id uuid not null, email text not null);
insert into tests.pessoas (apelido, id, email)
select apelido, ('00000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, apelido || '@ubox.test'
from unnest(array['admin', 'fr', 'eq', 'outra', 'redeSem', 'consultor', 'rede', 'sem', 'inativo', 'unOff']) with ordinality as t(apelido, n);

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
  ('u', 'Unidade Es', 'Dono Es', 'u@ubox.test', true),
  ('v', 'Outra Es', 'Dono Outra Es', 'v@ubox.test', true),
  ('w', 'Inativa Es', 'Dono Inativo', 'w@ubox.test', false);

insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, unidade, modulos_liberados)
select tests.id(a), a || '@ubox.test', n, p::public.papel, at, u,
  coalesce((select nome from public.unidades where id = u), ''), m
from (values
  ('admin','Admin Rede','admin',true,null,'{}'::text[]),
  ('fr','Dono Es','franqueado',true,'u','{cliente}'),
  ('eq','Equipe Es','equipe_franqueado',true,'u','{cliente}'),
  ('outra','Dono Outra Es','franqueado',true,'v','{cliente}'),
  ('rede','Suprimentos Rede','equipe_franqueadora',true,null,'{cliente}'),
  ('redeSem','Rede Sem Es','equipe_franqueadora',true,null,'{}'),
  ('consultor','Consultor Rede','equipe_franqueadora',true,null,'{acompanhamento}'),
  ('sem','Equipe Sem','equipe_franqueado',true,'u','{}'),
  ('inativo','Conta Inativa','franqueado',false,'u','{cliente}'),
  ('unOff','Dono Inativo','franqueado',true,'w','{cliente}')
) as v(a,n,p,at,u,m);


create function tests.token(n text) returns text language sql immutable as $$ select repeat(n, 32) $$;

create function tests.c(extra jsonb default '{}') returns jsonb language sql as $$
  select '{"unidade_id":"u","nome":"Maria Silva","telefone":"(34) 99999-0000","email":"maria@cliente.test",
    "box":"Box 12","contrato_inicio":"2026-11-01T12:00:00Z","contrato_fim":null,"valor_mensal_centavos":28990,
    "dia_vencimento":10,"status":"ativo","obs":""}'::jsonb || extra
$$;
create function tests.p(extra jsonb default '{}') returns jsonb language sql as $$
  select '{"unidade_nome":"Unidade Es","contato_unidade":"(34) 3333-0000","primeiro_nome":"Maria",
    "box":"Box 12","contrato_inicio":"2026-11-01T12:00:00Z","contrato_fim":null,"valor_mensal_centavos":28990,
    "dia_vencimento":10,"ativo":true}'::jsonb || extra
$$;

-- Cada comando simula o limite de uma transação da API, dentro do rollback da suíte.
create function tests.lote(cmd text) returns void language plpgsql as $$
begin
  execute cmd;
  set constraints all immediate;
  set constraints all deferred;
end $$;

create function tests.criar(chave text, t text, c jsonb default '{}', p jsonb default '{}') returns void language plpgsql as $$
begin
  perform public.criar_cliente(chave, tests.token(t), tests.c(c), tests.p(p));
  set constraints all immediate;
  set constraints all deferred;
end $$;

create function tests.publico(t text) returns jsonb language sql as $$ select public.painel_publico(tests.token(t)) $$;

grant execute on all functions in schema tests to anon, authenticated;

select tests.entrar('fr');
select tests.criar('cl-1', '0', '{}', '{"ativo":false}');
select tests.lote($$select public.trocar_link_cliente('cl-1', tests.token('0'), tests.token('1'))$$);
update public.cliente_paineis set ativo = true where token = tests.token('1');
select tests.sair();
select tests.entrar('outra');
select tests.criar('cl-outra', '3', '{"unidade_id":"v"}', '{"unidade_nome":"Outra Es"}');
select tests.sair();
insert into public.cliente_painel_cobrancas (painel_token, id, competencia, valor_centavos, vencimento, status, pago_em)
values (tests.token('1'), '2026-11', '2026-11', 28990, '2026-11-10', 'pendente', ''),
       (tests.token('0'), '2026-10', '2026-10', 28990, '2026-10-10', 'pago', '2026-10-09');

select tests.sair();
select tests.anonimo();
select ok(tests.publico('1') is not null, '[regras] cli: link ativo abre sem login');
select is(tests.publico('0'), null::jsonb, '[regras] cli: link desativado não abre sem login');
select throws_ok($q$select * from public.cliente_paineis$q$, '42501', null, '[regras] cli: ninguém de fora lista os painéis');
select tests.sair();
select tests.entrar('outra');
select is((select count(*) from public.cliente_paineis where unidade_id='u'), 0::bigint, '[regras] cli: logado de outra unidade não lista painéis');
select tests.sair();
select tests.anonimo();
select throws_ok($q$select * from public.clientes$q$, '42501', null, '[regras] cli: anônimo não lê o cadastro do cliente');
select tests.sair();
select tests.entrar('admin');
select is((select count(*) from public.clientes), 0::bigint, '[regras] cli: admin não lê o cadastro do cliente');
select tests.sair();
select tests.entrar('rede');
select is((select count(*) from public.clientes), 0::bigint, '[regras] cli: franqueadora não lê o cadastro do cliente');
select is((select count(*) from public.cliente_paineis), 0::bigint, '[regras] cli: franqueadora não lista painéis');
select tests.sair();
select tests.entrar('outra');
select is((select count(*) from public.clientes where id='cl-1'), 0::bigint, '[regras] cli: outra unidade não lê o cliente');
select tests.sair();
select tests.entrar('sem');
select is((select count(*) from public.clientes), 0::bigint, '[regras] cli: equipe sem o módulo não lê clientes');
select tests.sair();
select tests.entrar('eq');
select is((select count(*) from public.clientes where unidade_id='u'), 1::bigint, '[regras] cli: equipe com o módulo lista clientes da unidade');
select is((select count(*) from public.cliente_paineis where unidade_id='u'), 2::bigint, '[regras] cli: unidade lista os próprios painéis');
select is((select count(*) from public.cliente_paineis where token=tests.token('0')), 1::bigint, '[regras] cli: unidade abre o próprio painel desativado');
select is((select count(*) from public.clientes where unidade_id<>'u'), 0::bigint, '[regras] cli: unidade não lista sem filtrar a unidade');
select lives_ok($q$select tests.criar('cl-n1','2')$q$, '[regras] cli: equipe cria cliente com painel no lote');
select throws_ok($q$select tests.lote($$insert into public.clientes (id,unidade_id,nome,telefone,email,box,contrato_inicio,valor_mensal_centavos,dia_vencimento,status,painel_token,obs) values ( 'cl-x1','u','Maria','','','Box',now(),100,10,'ativo',tests.token('a'),'')$$)$q$, '42501', null, '[regras] cli: cliente sem painel é recusado');
select throws_ok($q$insert into public.cliente_paineis (token, unidade_id, unidade_nome, contato_unidade, cliente_id, primeiro_nome, box, contrato_inicio, valor_mensal_centavos, dia_vencimento, ativo)
values (tests.token('a'), 'u','Unidade Es','','cl-x2','Maria','Box',now(),100,10,false)$q$, '42501', null, '[regras] cli: painel sem cliente é recusado');
select throws_ok($q$select public.criar_cliente('cl-x3','abc123',tests.c(),tests.p())$q$, null, null, '[regras] cli: token fora do formato é recusado');
select throws_ok($q$select tests.criar('cl-x4','a','{}','{"primeiro_nome":"João Pereira"}')$q$, null, null, '[regras] cli: painel com sobrenome é recusado');
select throws_ok($q$select tests.criar('cl-x5','a','{}','{"telefone":"34999990000"}')$q$, null, null, '[regras] cli: painel com telefone do cliente é recusado');
select throws_ok($q$select tests.criar('cl-x6','a','{}','{"email":"joao@x.com"}')$q$, null, null, '[regras] cli: painel com e-mail do cliente é recusado');
select throws_ok($q$select tests.criar('cl-x7','a','{"dia_vencimento":31}','{"dia_vencimento":31}')$q$, null, null, '[regras] cli: dia de vencimento 31 é recusado');
select throws_ok($q$select tests.criar('cl-x8','a','{"valor_mensal_centavos":10.5}','{}')$q$, null, null, '[regras] cli: mensalidade fracionada é recusada');
select throws_ok($q$select tests.criar('cl-x9','a','{"unidade_id":"v"}','{"unidade_nome":"Outra Es"}')$q$, null, null, '[regras] cli: cliente em outra unidade é recusado');
select throws_ok($q$select tests.criar('cl-x10','a','{"atualizado_por_nome":"Outra Pessoa"}','{}')$q$, '42501', null, '[regras] cli: autor com nome forjado é recusado');
select throws_ok($q$select tests.criar('cl-x11','a','{"telefone":"liga"}','{}')$q$, null, null, '[regras] cli: telefone com letras é recusado');
select lives_ok($q$insert into public.cliente_painel_cobrancas (painel_token,id,competencia,valor_centavos,vencimento,status,pago_em) values (tests.token('1'),'2026-12','2026-12',19990,'2026-12-05','pendente','')$q$, '[regras] cli: unidade lança cobrança no painel');
select lives_ok($q$insert into public.cliente_painel_visitas (painel_token,id,data,hora,motivo,status) values (tests.token('1'),'v1','2026-12-01','10:00','Retirada','agendada')$q$, '[regras] cli: unidade agenda visita no painel');
select lives_ok($q$insert into public.cliente_painel_recados (painel_token,id,texto,criado_em,autor,gerado_por_ia,ia_modelo) values (tests.token('1'),'r1','Portão fechado domingo',now(),'Ana',true,'Grok Bot')$q$, '[regras] cli: unidade publica recado com IA registrada');
select throws_ok($q$insert into public.cliente_painel_cobrancas (painel_token,id,competencia,valor_centavos,vencimento,status,pago_em) values (tests.token('1'),'qualquer','2027-01',19990,'2027-01-05','pendente','')$q$, null, null, '[regras] cli: cobrança com id diferente do mês é recusada');
select throws_ok($q$insert into public.cliente_painel_cobrancas (painel_token,id,competencia,valor_centavos,vencimento,status,pago_em,telefone) values (tests.token('1'),'2027-02','2027-02',19990,'2027-02-05','pendente','','34999990000')$q$, null, null, '[regras] cli: telefone dentro de uma cobrança é recusado');
select throws_ok($q$insert into public.cliente_painel_recados (painel_token,id,texto,criado_em,autor,gerado_por_ia,ia_modelo,email) values (tests.token('1'),'r2','Portão fechado domingo',now(),'Ana',true,'Grok Bot','maria@x.com')$q$, null, null, '[regras] cli: e-mail dentro de um recado é recusado');
select throws_ok($q$insert into public.cliente_painel_visitas (painel_token,id,data,hora,motivo,status,telefone) values (tests.token('1'),'v2','2026-12-01','10:00','Retirada','agendada','3499')$q$, null, null, '[regras] cli: telefone dentro de uma visita é recusado');
select throws_ok($q$insert into public.cliente_painel_recados (painel_token,id,texto,criado_em,autor,gerado_por_ia,ia_modelo) values (tests.token('1'),'r3','Portão fechado domingo',now(),'Ana',true,'')$q$, null, null, '[regras] cli: recado com IA sem o modelo é recusado');
select throws_ok($q$insert into public.cliente_painel_recados (painel_token,id,texto,criado_em,autor,gerado_por_ia,ia_modelo) values (tests.token('1'),'r4','Portão fechado domingo',now() + interval '1 day','Ana',true,'Grok Bot')$q$, null, null, '[regras] cli: recado com data futura é recusado');
select throws_ok($q$insert into public.cliente_painel_cobrancas (painel_token,id,competencia,valor_centavos,vencimento,status,pago_em) values (tests.token('1'),'2027-03','2027-03',10.5,'2027-03-05','pendente','')$q$, null, null, '[regras] cli: cobrança com valor fracionado é recusada');
select throws_ok($q$insert into public.cliente_painel_visitas (painel_token,id,data,hora,motivo,status) values (tests.token('1'),'v3','2026-12-01','10:00','Retirada','talvez')$q$, null, null, '[regras] cli: visita com status inventado é recusada');
select throws_ok($q$insert into public.cliente_painel_recados (painel_token,id,texto,criado_em,autor,gerado_por_ia,ia_modelo) values (tests.token('1'),'r7','Portão fechado domingo',now(),'Ana Souza',true,'Grok Bot')$q$, null, null, '[regras] cli: recado com autor de nome completo é recusado');
select throws_ok($q$insert into public.cliente_painel_recados (painel_token,id,texto,criado_em,autor,gerado_por_ia,ia_modelo) values (tests.token('1'),'r8','Portão fechado domingo',now(),'',true,'Grok Bot')$q$, null, null, '[regras] cli: recado com autor vazio é recusado');
select throws_ok($q$insert into public.cliente_painel_recados (painel_token,id,texto,criado_em,autor,gerado_por_ia,ia_modelo) values (tests.token('1'),'r9','Portão fechado domingo',now(),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',true,'Grok Bot')$q$, null, null, '[regras] cli: recado com autor acima de 40 caracteres é recusado');
select throws_ok($q$insert into public.cliente_painel_recados (painel_token,id,texto,criado_em,autor,gerado_por_ia,ia_modelo) values (tests.token('1'),'r5',repeat('x',501),now(),'Ana',true,'Grok Bot')$q$, null, null, '[regras] cli: recado acima de 500 caracteres é recusado');
select tests.sair();
select tests.entrar('outra');
select throws_ok($q$insert into public.cliente_painel_cobrancas (painel_token,id,competencia,valor_centavos,vencimento,status,pago_em) values (tests.token('1'),'2027-04','2027-04',19990,'2027-04-05','pendente','')$q$, '42501', null, '[regras] cli: outra unidade não lança no painel');
select tests.sair();
select tests.anonimo();
select throws_ok($q$insert into public.cliente_painel_recados (painel_token,id,texto,criado_em,autor,gerado_por_ia,ia_modelo) values (tests.token('1'),'r6','Portão fechado domingo',now(),'Ana',true,'Grok Bot')$q$, '42501', null, '[regras] cli: anônimo não lança no painel');
select tests.sair();
select tests.entrar('sem');
select throws_ok($q$insert into public.cliente_painel_visitas (painel_token,id,data,hora,motivo,status) values (tests.token('1'),'v4','2026-12-01','10:00','Retirada','agendada')$q$, '42501', null, '[regras] cli: equipe sem o módulo não lança no painel');
select tests.sair();
select tests.entrar('eq');
select throws_ok($q$update public.cliente_painel_recados set texto='Outro texto' where id='r1'$q$, '42501', null, '[regras] cli: recado não é editado');
select throws_ok($q$update public.cliente_painel_cobrancas set valor_centavos=1 where id='2026-12'$q$, '42501', null, '[regras] cli: cobrança não muda de valor');
select throws_ok($q$do $$ begin
  update public.cliente_painel_visitas set status='realizada' where id='v1';
  if not found then raise exception 'Visita ausente'; end if;
  update public.cliente_painel_visitas set status='agendada' where id='v1';
end $$ $q$, '42501', 'Visita só pode mudar de status enquanto agendada', '[regras] cli: visita realizada não volta a agendada');
update public.cliente_painel_visitas set status='realizada' where id='v1';
select throws_ok($q$delete from public.cliente_painel_cobrancas where id='2026-12'$q$, '42501', null, '[regras] cli: ninguém apaga item do painel');
select tests.sair();
select tests.anonimo();
select ok(jsonb_array_length(tests.publico('1')->'cobrancas') = 2 and jsonb_array_length(tests.publico('1')->'visitas') = 1 and jsonb_array_length(tests.publico('1')->'recados') = 1, '[regras] cli: anônimo lê os itens do link ativo');
select is(tests.publico('0'), null::jsonb, '[regras] cli: anônimo não lê itens do link desativado');
select tests.sair();
select tests.entrar('outra');
select is((select count(*) from public.cliente_painel_cobrancas where painel_token=tests.token('0')), 0::bigint, '[regras] cli: outra unidade logada não lê itens do link desativado');
select tests.sair();
select tests.entrar('eq');
select is((select count(*) from public.cliente_painel_cobrancas where painel_token=tests.token('0')), 1::bigint, '[regras] cli: unidade lê itens do próprio link desativado');
select tests.sair();
select tests.entrar('rede');
select is((select count(*) from public.cliente_painel_cobrancas where painel_token=tests.token('0')), 0::bigint, '[regras] cli: franqueadora não lê itens de link desativado');
select tests.sair();
select tests.entrar('sem');
select throws_ok($q$select tests.criar('cl-x13','a','{}','{}')$q$, '42501', null, '[regras] cli: equipe sem o módulo não cria cliente');
select tests.sair();
select tests.entrar('rede');
select throws_ok($q$select tests.criar('cl-x14','a','{}','{}')$q$, '42501', null, '[regras] cli: franqueadora não cria cliente');
select tests.sair();
select tests.anonimo();
select throws_ok($q$insert into public.cliente_paineis (token) values (tests.token('a'))$q$, '42501', null, '[regras] cli: anônimo não cria painel');
select tests.sair();
select tests.entrar('fr');
select throws_ok($q$insert into public.cliente_paineis (token, unidade_id, cliente_id) values (tests.token('a'), 'u', 'cl-outra')$q$, '42501', null, '[regras] cli: painel não aponta para cliente de outra unidade');
select lives_ok($q$update public.clientes set valor_mensal_centavos=30990 where id='cl-1'$q$, '[regras] cli: franqueado edita contrato');
select throws_ok($q$update public.clientes set unidade_id='v' where id='cl-1'$q$, '42501', null, '[regras] cli: cliente não muda de unidade');
select throws_ok($q$update public.clientes set criado_em='2020-01-01' where id='cl-1'$q$, '42501', null, '[regras] cli: data de cadastro não muda');
select throws_ok($q$update public.clientes set painel_token=tests.token('3') where id='cl-1'$q$, '42501', null, '[regras] cli: token apontando para painel de outro cliente é recusado');
select tests.sair();
select tests.entrar('outra');
select is((select tests.linhas($q$update public.clientes set obs='x' where id='cl-1'$q$)), 0, '[regras] cli: outra unidade não edita o cliente');
select tests.sair();
select tests.entrar('eq');
select lives_ok($q$update public.cliente_painel_cobrancas set status='pago', pago_em='2026-11-09' where id='2026-11'$q$, '[regras] cli: unidade registra cobrança paga');
select throws_ok($q$update public.cliente_paineis set contato_unidade='WhatsApp', atualizado_em=now()-interval '1 minute' where token=tests.token('1')$q$, '42501', null, '[regras] cli: painel sem horário do servidor é recusado');
select throws_ok($q$update public.cliente_paineis set cliente_id='cl-outra' where token=tests.token('1')$q$, '42501', null, '[regras] cli: painel não troca de cliente');
select tests.sair();
select tests.anonimo();
select throws_ok($q$update public.cliente_paineis set contato_unidade='WhatsApp' where token=tests.token('1')$q$, '42501', null, '[regras] cli: anônimo não altera o painel');
select tests.sair();
select tests.entrar('outra');
select is((select tests.linhas($q$update public.cliente_paineis set contato_unidade='WhatsApp' where token=tests.token('1')$q$)), 0, '[regras] cli: outra unidade não altera o painel');
select tests.sair();
select tests.entrar('fr');
select throws_ok($q$update public.cliente_paineis set ativo=true where token=tests.token('0')$q$, '42501', null, '[regras] cli: link antigo não volta a valer');
select lives_ok($q$update public.cliente_paineis set ativo=false where token=tests.token('1')$q$, '[regras] cli: unidade desativa o link atual');
select tests.sair();
select tests.anonimo();
select is(tests.publico('1'), null::jsonb, '[regras] cli: link desativado some para o anônimo');
select tests.sair();
select tests.entrar('fr');
select lives_ok($q$update public.cliente_paineis set ativo=true where token=tests.token('1')$q$, '[regras] cli: unidade reativa o link atual');
select lives_ok($q$select tests.lote($$select public.trocar_link_cliente('cl-1',tests.token('1'),tests.token('a'))$$)$q$, '[regras] cli: unidade troca o link do cliente');
select tests.sair();
select tests.anonimo();
select is(tests.publico('1'), null::jsonb, '[regras] cli: link trocado não abre mais');
select ok(tests.publico('a') is not null, '[regras] cli: link novo abre sem login');
select tests.sair();
select tests.entrar('fr');
select throws_ok($q$update public.clientes set painel_token=tests.token('9') where id='cl-1'$q$, '42501', null, '[regras] cli: troca de link com o antigo ainda ativo é recusada');
select throws_ok($q$select public.trocar_link_cliente('cl-1',tests.token('a'),tests.token('1'))$q$, '42501', null, '[regras] cli: voltar ao link antigo e reativá-lo é recusado');
select throws_ok($q$select tests.lote($$update public.cliente_paineis set ativo=false where token=tests.token('a'); update public.clientes set painel_token=tests.token('1') where id='cl-1'$$)$q$, '42501', null, '[regras] cli: apontar o cliente para um link antigo é recusado');
select throws_ok($q$select tests.lote($$update public.clientes set status='encerrado' where id='cl-1'$$)$q$, '42501', null, '[regras] cli: encerrar contrato com o link ativo é recusado');
select lives_ok($q$select tests.lote($$select public.salvar_cliente('cl-1',tests.token('a'),tests.c('{"status":"encerrado"}') - 'unidade_id','Maria')$$)$q$, '[regras] cli: encerrar contrato desativando o link no lote');
select tests.sair();
select tests.entrar('eq');
select throws_ok($q$select tests.criar('cl-x22','8','{"status":"encerrado"}','{"ativo":true}')$q$, '42501', null, '[regras] cli: contrato encerrado não cria cliente com link ativo');
select throws_ok($q$select tests.criar('cl-tipo','8','{}','{"ativo":"true"}')$q$, '42501', null,
  'RPC recusa string onde o painel exige booleano');
select throws_ok($q$select tests.criar('cl-tipo','8','{"telefone":34999990000}')$q$, '42501', null,
  'RPC recusa número onde o cliente exige string');
select tests.sair();
select tests.anonimo();
select is(tests.publico('a'), null::jsonb, '[regras] cli: link do contrato encerrado não abre');
select tests.sair();
select tests.entrar('fr');
select throws_ok($q$delete from public.clientes where id='cl-1'$q$, '42501', null, '[regras] cli: ninguém apaga cliente');
select throws_ok($q$delete from public.cliente_paineis where token=tests.token('a')$q$, '42501', null, '[regras] cli: ninguém apaga painel');
select tests.sair();
-- Simula um painel antigo que ainda tenha chegado ativo na carga histórica.
update public.cliente_paineis set ativo=true where token=tests.token('1');
select tests.anonimo();
select throws_ok('select * from public.clientes', '42501', null, 'anon não tem SELECT em public.clientes');
select throws_ok('select * from public.cliente_paineis', '42501', null, 'anon não tem SELECT em public.cliente_paineis');
select throws_ok('select * from public.cliente_painel_cobrancas', '42501', null, 'anon não tem SELECT em public.cliente_painel_cobrancas');
select throws_ok('select * from public.cliente_painel_visitas', '42501', null, 'anon não tem SELECT em public.cliente_painel_visitas');
select throws_ok('select * from public.cliente_painel_recados', '42501', null, 'anon não tem SELECT em public.cliente_painel_recados');
select throws_ok('select public.criar_cliente(null,null,null,null)', '42501', null, 'anon não executa criar_cliente');
select throws_ok('select public.salvar_cliente(null,null,null,null)', '42501', null, 'anon não executa salvar_cliente');
select throws_ok('select public.trocar_link_cliente(null,null,null)', '42501', null, 'anon não executa trocar_link_cliente');
select is(array(
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='app' and has_function_privilege('anon',p.oid,'EXECUTE')
), array['app.painel_publico(text)'], 'USAGE em app só permite executar o auxiliar público');
select is(public.painel_publico('abc'), null::jsonb, 'token fora do formato retorna null');
select is(tests.publico('f'), null::jsonb, 'token desconhecido retorna null');
select is(tests.publico('0'), null::jsonb, 'token inativo retorna null');
select is(tests.publico('1'), null::jsonb, 'token trocado retorna null mesmo se estiver marcado como ativo');
select tests.sair();
select tests.entrar('fr');
select is((select painel_token from public.clientes where id='cl-1'), tests.token('a'), 'trocas recusadas preservam o token atual');
select is((select atualizado_por from public.clientes where id='cl-1'), tests.id('fr'), 'servidor grava a identidade da sessão');
select is((select atualizado_por_nome from public.clientes where id='cl-1'), 'Dono Es', 'servidor grava o nome do perfil');
select is((select count(*) from public.cliente_painel_cobrancas where painel_token=tests.token('a')), 2::bigint, 'troca copia as cobranças para o novo token');
select ok(not (select ativo from public.cliente_paineis where token=tests.token('a')), 'encerramento desativa o painel atual');
select is((select autor from public.cliente_painel_recados where painel_token=tests.token('1') and id='r1'),
  'Equipe', 'recado novo usa o primeiro nome do perfil');
select is(
  (select jsonb_build_array(autor, criado_em) from public.cliente_painel_recados where painel_token=tests.token('a') and id='r1'),
  (select jsonb_build_array(autor, criado_em) from public.cliente_painel_recados where painel_token=tests.token('1') and id='r1'),
  'troca preserva autoria e data do recado original');
update public.clientes set status='ativo' where id='cl-1';
update public.cliente_paineis set ativo=true where token=tests.token('a');
select tests.sair();
select tests.anonimo();
select is(array(select k from jsonb_object_keys(tests.publico('a')) k order by k collate "C"), array['box','cobrancas','contato_unidade','contrato_fim','contrato_inicio','dia_vencimento','primeiro_nome','recados','unidade_nome','valor_mensal_centavos','visitas'], 'somente as chaves públicas no painel');
select is(array(select k from jsonb_object_keys(tests.publico('a')->'cobrancas'->0) k order by k collate "C"), array['competencia','pago_em','status','valor_centavos','vencimento'], 'somente as chaves públicas na cobrança');
select is(array(select k from jsonb_object_keys(tests.publico('a')->'visitas'->0) k order by k collate "C"), array['data','hora','motivo','status'], 'somente as chaves públicas na visita');
select is(array(select k from jsonb_object_keys(tests.publico('a')->'recados'->0) k order by k collate "C"), array['autor','criado_em','gerado_por_ia','ia_modelo','texto'], 'somente as chaves públicas no recado');
select tests.sair();
select tests.entrar('consultor');
select is((select count(*) from public.clientes), 0::bigint, 'acompanhamento não lê clientes');
select tests.sair();
select tests.entrar('outra');
select is((select count(*) from public.cliente_paineis where unidade_id='u'), 0::bigint, 'outra unidade não enumera os painéis da unidade');
select tests.sair();
select tests.entrar('admin');
select ok(tests.publico('a') is not null, 'usuário autenticado usa o mesmo acesso público por token');
select tests.sair();
select * from finish();
rollback;
