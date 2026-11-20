-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
begin;

select plan(129);
create schema tests;
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
  ('fr','Dono Es','franqueado',true,'u','{estoque}'),
  ('eq','Equipe Es','equipe_franqueado',true,'u','{estoque}'),
  ('outra','Dono Outra Es','franqueado',true,'v','{estoque}'),
  ('rede','Suprimentos Rede','equipe_franqueadora',true,null,'{estoque}'),
  ('redeSem','Rede Sem Es','equipe_franqueadora',true,null,'{}'),
  ('consultor','Consultor Rede','equipe_franqueadora',true,null,'{acompanhamento}'),
  ('sem','Equipe Sem','equipe_franqueado',true,'u','{}'),
  ('inativo','Conta Inativa','franqueado',false,'u','{estoque}'),
  ('unOff','Dono Inativo','franqueado',true,'w','{estoque}')
) as v(a,n,p,at,u,m);

create function tests.item(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into public.estoque_itens
  select (jsonb_populate_record(null::public.estoque_itens,
    '{"nome":"Cadeado 40mm","codigo":"","categoria":"cadeados","unidade_medida":"un","estoque_minimo":10,
      "preco_sugerido_centavos":3990,"descricao":"","ativo":true,"gerado_por_ia":false,"ia_modelo":""}'
    || jsonb_build_object('id', chave, 'criado_em', now(), 'atualizado_em', now(),
      'atualizado_por', tests.id('rede'), 'atualizado_por_nome', 'Suprimentos Rede') || extra)).*
$$;

create function tests.movimento(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into public.estoque_movimentos
  select (jsonb_populate_record(null::public.estoque_movimentos,
    '{"item_id":"it-cad","item_nome":"Cadeado 40mm","unidade_medida":"un","tipo":"saida","quantidade":2,
      "delta":-2,"motivo":"Reposição balcão","origem":"manual","origem_id":"","indice":0}'
    || jsonb_build_object('id', chave, 'criado_em', now()) || extra)).*
$$;

create function tests.linha(extra jsonb default '{}') returns jsonb language sql immutable as $$
  select '{"itemId":"it-cad","itemNome":"Cadeado 40mm","unidadeMedida":"un","sistema":20,"contado":17,"diferenca":-3}'::jsonb || extra
$$;

create function tests.contagem(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into public.estoque_contagens (id, unidade_id, unidade_nome, itens, total_itens, total_divergencias, status,
    criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
  select r.id, r.unidade_id, r.unidade_nome, r.itens, jsonb_array_length(r.itens), jsonb_array_length(r.itens), r.status,
    tests.id('fr'), 'Dono Es', tests.id('fr'), 'Dono Es'
  from jsonb_populate_record(null::public.estoque_contagens, jsonb_build_object('id', chave, 'unidade_id', 'u',
    'unidade_nome', 'Unidade Es', 'status', 'aberta', 'itens', jsonb_build_array(tests.linha())) || extra) r
$$;

create function tests.linha_pedido(enviada integer default 25) returns jsonb language sql immutable as $$
  select jsonb_build_object('itemId','it-cx','itemNome','Caixa de mudança M','unidadeMedida','un',
    'quantidade',25,'quantidadeEnviada',enviada)
$$;

create function tests.pedido(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into public.estoque_pedidos (id, unidade_id, unidade_nome, itens, total_itens, status, obs_franqueadora,
    solicitante_uid, solicitante_nome, atualizado_por, atualizado_por_nome)
  select r.id, r.unidade_id, r.unidade_nome, r.itens, jsonb_array_length(r.itens), r.status, r.obs_franqueadora,
    tests.id('fr'), 'Dono Es', tests.id('fr'), 'Dono Es'
  from jsonb_populate_record(null::public.estoque_pedidos, jsonb_build_object('id', chave, 'unidade_id', 'u',
    'unidade_nome', 'Unidade Es', 'status', 'aberto', 'obs_franqueadora', '',
    'itens', jsonb_build_array(tests.linha_pedido())) || extra) r
$$;

-- Simula um lote adulterado do Firestore. A tentativa de inserir o movimento
-- manualmente deve desfazer também a transição anterior.
create function tests.lote(cmd text, chave text, extra jsonb) returns void language plpgsql as $$
begin
  execute cmd;
  perform tests.movimento(chave, extra);
end $$;

select tests.item('it-cad');
select tests.item('it-cx', '{"nome":"Caixa de mudança M"}');
select tests.item('it-off', '{"nome":"Fita antiga","ativo":false}');
select tests.entrar('fr');
select public.registrar_movimento_estoque('it-cad','Cadeado 40mm','un','entrada',20,'');
select tests.sair();
insert into public.estoque_movimentos (id, unidade_id, unidade_nome, item_id, item_nome, unidade_medida,
  tipo, quantidade, delta, uid, nome) values
  ('mv-off-base','u','Unidade Es','it-off','Fita antiga','un','entrada',5,5,tests.id('fr'),'Dono Es'),
  ('mv-outra','v','Outra Es','it-cad','Cadeado 40mm','un','entrada',7,7,tests.id('outra'),'Dono Outra Es');
insert into public.estoque_saldos values ('u','it-off',5), ('v','it-cad',7);
select tests.contagem('ct-1', jsonb_build_object('itens', jsonb_build_array(tests.linha(),
  tests.linha('{"itemId":"it-cx","itemNome":"Caixa de mudança M","sistema":0,"contado":4,"diferenca":4}'))));
select tests.contagem('ct-2');
select tests.contagem('ct-outra', '{"unidade_id":"v","unidade_nome":"Outra Es"}');
select tests.pedido('pd-aberto');
select tests.pedido('pd-aberto2');
select tests.pedido('pd-aprovado', '{"status":"aprovado"}');
select tests.pedido('pd-enviado', '{"status":"enviado"}');
select tests.pedido('pd-enviado2', '{"status":"enviado"}');

select tests.entrar('rede');
select lives_ok($$select tests.item('it-luva')$$, '[regras] es: suprimentos cria item');
select throws_ok($$select tests.item('it-x', '{"gerado_por_ia":true,"ia_modelo":" "}')$$, '23514', null, '[regras] es: item com IA sem o modelo é recusado');
select lives_ok($$select tests.item('it-ia', '{"gerado_por_ia":true,"ia_modelo":"Grok Bot"}')$$, '[regras] es: item com IA registra o modelo');
select throws_ok($$select tests.item('it-x', '{"categoria":"bebidas"}')$$, '23514', null, '[regras] es: categoria desconhecida é recusada');
select throws_ok($$select tests.item('it-x', '{"estoque_minimo":-1}')$$, '23514', null, '[regras] es: mínimo negativo é recusado');
select throws_ok($$select tests.item('it-x', '{"preco_sugerido_centavos":12.5}')$$, '23514', null, '[regras] es: preço quebrado é recusado');
select tests.entrar('redeSem');
select throws_ok($$select tests.item('it-x')$$, '42501', null, '[regras] es: equipe da rede sem o módulo não cria item');
select tests.entrar('fr');
select throws_ok($$select tests.item('it-x')$$, '42501', null, '[regras] es: franqueado não cria item');
select tests.entrar('rede');
select is(tests.linhas($$update public.estoque_itens set ativo = false where id = 'it-luva'$$), 1, '[regras] es: suprimentos desativa item');
select throws_ok($$update public.estoque_itens set criado_em = '2020-01-01' where id = 'it-luva'$$, '42501', null, '[regras] es: não muda a data de criação');
select tests.entrar('admin');
select throws_ok($$delete from public.estoque_itens where id = 'it-luva'$$, '42501', null, '[regras] es: ninguém apaga item');
select tests.entrar('eq');
select is((select count(*)::int from public.estoque_itens where true), 5, '[regras] es: unidade lê o catálogo');
select tests.entrar('sem');
select is((select count(*)::int from public.estoque_itens where true), 0, '[regras] es: equipe sem o módulo não lê o catálogo');
select tests.entrar('redeSem');
select is((select count(*)::int from public.estoque_itens where true), 0, '[regras] es: rede sem o módulo não lê o catálogo');
select tests.entrar('eq');
select lives_ok($$select tests.movimento('mv-s1')$$, '[regras] es: equipe registra saída');
select lives_ok($$select tests.movimento('mv-v1', '{"tipo":"venda","motivo":""}')$$, '[regras] es: equipe registra venda sem motivo');
select tests.entrar('fr');
select lives_ok($$select tests.movimento('mv-e1', '{"tipo":"entrada","delta":2,"motivo":""}')$$, '[regras] es: franqueado registra entrada');
select tests.entrar('eq');
select throws_ok($$select tests.movimento('mv-x', '{"motivo":""}')$$, '23514', null, '[regras] es: saída sem motivo é recusada');
select throws_ok($$select tests.movimento('mv-x', '{"delta":2}')$$, '23514', null, '[regras] es: saída com delta positivo é recusada');
select throws_ok($$select tests.movimento('mv-x', '{"tipo":"entrada","delta":20}')$$, '23514', null, '[regras] es: entrada com delta diferente é recusada');
select throws_ok($$select tests.movimento('mv-x', '{"quantidade":0,"delta":0}')$$, '23514', null, '[regras] es: quantidade zero é recusada');
select throws_ok($$select tests.movimento('mv-x', '{"quantidade":1.5,"delta":-1.5}')$$, '23514', null, '[regras] es: quantidade fracionada é recusada');
select throws_ok($$select tests.movimento('mv-x', '{"tipo":"ajuste"}')$$, '23514', null, '[regras] es: ajuste manual é recusado (só via contagem)');
select throws_ok($$select tests.movimento('mv-x', '{"unidade_id":"v","unidade_nome":"Outra Es"}')$$, '42501', null, '[regras] es: movimento em outra unidade é recusado');
select throws_ok($$select tests.movimento('mv-x', '{"nome":"Dono Es"}')$$, '42501', null, '[regras] es: movimento em nome de outra pessoa é recusado');
select throws_ok($$select tests.movimento('mv-x', '{"criado_em":"2020-01-01T00:00:00Z"}')$$, '42501', null, '[regras] es: movimento com horário do cliente é recusado');
select throws_ok($$select tests.movimento('mv-x', '{"item_id":"it-nao"}')$$, '42501', null, '[regras] es: item inexistente é recusado');
select throws_ok($$select tests.movimento('mv-x', '{"item_nome":"Cadeado de ouro"}')$$, '42501', null, '[regras] es: nome do item diferente do catálogo é recusado');
select throws_ok($$select tests.movimento('mv-x', '{"item_id":"it-off","item_nome":"Fita antiga","tipo":"entrada","delta":2,"motivo":""}')$$, '42501', null, '[regras] es: entrada de item inativo é recusada');
select lives_ok($$select tests.movimento('mv-off', '{"item_id":"it-off","item_nome":"Fita antiga"}')$$, '[regras] es: saída de item inativo é aceita (gasta o que sobrou)');
select tests.entrar('sem');
select throws_ok($$select tests.movimento('mv-x')$$, '42501', null, '[regras] es: equipe sem o módulo não movimenta');
select tests.entrar('rede');
select throws_ok($$select tests.movimento('mv-x')$$, '42501', null, '[regras] es: franqueadora não movimenta estoque da unidade');
select tests.entrar('fr');
select throws_ok($$update public.estoque_movimentos set motivo = 'corrigido' where id = 'mv-s1'$$, '42501', null, '[regras] es: movimento é imutável');
select tests.entrar('admin');
select throws_ok($$delete from public.estoque_movimentos where id = 'mv-s1'$$, '42501', null, '[regras] es: ninguém apaga movimento');
select tests.entrar('eq');
select is((select count(*)::int from public.estoque_movimentos where unidade_id = 'u'), 6, '[regras] es: unidade lista os próprios movimentos');
-- A consulta sem filtro no Postgres recebe somente as linhas autorizadas pelo RLS.
select is((select count(*)::int from public.estoque_movimentos where true), 6, '[regras] es: unidade não lista sem filtrar a unidade');
select tests.entrar('fr');
select is((select count(*)::int from public.estoque_movimentos where id = 'mv-outra'), 0, '[regras] es: unidade não lê movimento de outra');
select tests.entrar('rede');
select is((select count(*)::int from public.estoque_movimentos where true), 7, '[regras] es: suprimentos lê a rede toda');
select tests.entrar('redeSem');
select is((select count(*)::int from public.estoque_movimentos where true), 0, '[regras] es: rede sem o módulo não lê movimentos');
select tests.entrar('eq');
select lives_ok($$select tests.contagem('ct-n')$$, '[regras] es: equipe abre contagem');
select throws_ok($$select tests.contagem('ct-x', '{"status":"confirmada"}')$$, '42501', null, '[regras] es: contagem já confirmada na criação é recusada');
select throws_ok($$select tests.contagem('ct-x', '{"unidade_id":"v","unidade_nome":"Outra Es"}')$$, '42501', null, '[regras] es: contagem de outra unidade é recusada');
select is(tests.linhas($$update public.estoque_contagens set obs = 'Corredor B contado' where id = 'ct-1'$$), 1, '[regras] es: equipe atualiza contagem aberta');
select throws_ok($$update public.estoque_contagens set status = 'confirmada' where id = 'ct-1'$$, '42501', null, '[regras] es: equipe não confirma contagem');
select tests.entrar('fr');
select is((select public.confirmar_contagem_estoque(id,itens,obs) from public.estoque_contagens where id = 'ct-1'), 2, '[regras] es: franqueado confirma contagem com os ajustes no lote');
select throws_ok($$update public.estoque_contagens set obs = 'mudei' where id = 'ct-1'$$, '42501', null, '[regras] es: contagem confirmada não muda mais');
select throws_ok($$select tests.movimento('ct-1_0x', '{"origem":"contagem","origem_id":"ct-1","indice":0,"tipo":"ajuste"}')$$, '42501', null, '[regras] es: ajuste extra depois da confirmação é recusado');
select throws_ok($$select tests.movimento('ct-1_0', '{"origem":"contagem","origem_id":"ct-1","indice":0,"tipo":"ajuste"}')$$, '42501', null, '[regras] es: ajuste repetido (mesmo id) é recusado');
select throws_ok($$select tests.movimento('ct-2_0', '{"origem":"contagem","origem_id":"ct-2","indice":0,"tipo":"ajuste"}')$$, '42501', null, '[regras] es: ajuste sem confirmar a contagem é recusado');
select throws_ok($$select tests.lote($q$update public.estoque_contagens set status = 'confirmada' where id = 'ct-2'$q$, 'ct-2_0', '{"origem":"contagem","origem_id":"ct-2","indice":0,"tipo":"ajuste","quantidade":30,"delta":-30}')$$, '42501', null, '[regras] es: ajuste diferente da contagem é recusado');
select throws_ok($$select tests.lote($q$update public.estoque_contagens set status = 'confirmada' where id = 'ct-2'$q$, 'ct-2_0', '{"origem":"contagem","origem_id":"ct-2","indice":0,"tipo":"ajuste","item_id":"it-cx","item_nome":"Caixa de mudança M"}')$$, '42501', null, '[regras] es: ajuste em item trocado é recusado');
select throws_ok($$select tests.lote($q$update public.estoque_contagens set status = 'confirmada' where id = 'ct-2'$q$, 'qualquer', '{"origem":"contagem","origem_id":"ct-2","indice":0,"tipo":"ajuste"}')$$, '42501', null, '[regras] es: ajuste com id fora do padrão é recusado');
select tests.entrar('eq');
select throws_ok($$select tests.lote($q$update public.estoque_contagens set status = 'confirmada' where id = 'ct-2'$q$, 'ct-2_0', '{"origem":"contagem","origem_id":"ct-2","indice":0,"tipo":"ajuste"}')$$, '42501', null, '[regras] es: equipe não gera ajuste de contagem');
select tests.entrar('fr');
select tests.contagem('ct-ruim-0', jsonb_build_object('itens', jsonb_build_array(tests.linha('{"contado":10}'))));
select throws_ok($$select public.confirmar_contagem_estoque(id,itens,obs) from public.estoque_contagens where id = 'ct-ruim-0'$$, '42501', null, '[regras] es: ajuste recusado com linha de diferença que não fecha com contado − sistema');
select tests.contagem('ct-ruim-1', jsonb_build_object('itens', jsonb_build_array(tests.linha('{"contado":-5,"sistema":0,"diferenca":-5}'))));
select throws_ok($$select public.confirmar_contagem_estoque(id,itens,obs) from public.estoque_contagens where id = 'ct-ruim-1'$$, '42501', null, '[regras] es: ajuste recusado com linha de contado negativo');
select tests.contagem('ct-ruim-2', jsonb_build_object('itens', jsonb_build_array(tests.linha('{"sistema":100003,"contado":100000}'))));
select throws_ok($$select public.confirmar_contagem_estoque(id,itens,obs) from public.estoque_contagens where id = 'ct-ruim-2'$$, '42501', null, '[regras] es: ajuste recusado com linha de sistema acima de 100.000');
select tests.contagem('ct-ruim-3', jsonb_build_object('itens', jsonb_build_array(tests.linha('{"contado":16.5,"diferenca":-3.5}'))));
select throws_ok($$select public.confirmar_contagem_estoque(id,itens,obs) from public.estoque_contagens where id = 'ct-ruim-3'$$, '42501', null, '[regras] es: ajuste recusado com linha de contado fracionado');
select tests.contagem('ct-ruim-4', jsonb_build_object('itens', jsonb_build_array(tests.linha('{"sistema":null}'))));
select throws_ok($$select public.confirmar_contagem_estoque(id,itens,obs) from public.estoque_contagens where id = 'ct-ruim-4'$$, '42501', null, '[regras] es: ajuste recusado com linha de sistema ausente');
select tests.contagem('ct-boa');
select is((select public.confirmar_contagem_estoque(id,itens,obs) from public.estoque_contagens where id = 'ct-boa'), 1, '[regras] es: ajuste aceito com linha coerente (controle)');
select throws_ok($$select public.confirmar_contagem_estoque('ct-outra', jsonb_build_array(tests.linha()), '')$$, '42501', null, '[regras] es: franqueado não confirma contagem de outra unidade');
select tests.entrar('eq');
select throws_ok($$update public.estoque_contagens set status = 'cancelada' where id = 'ct-2'$$, '42501', null, '[regras] es: equipe não cancela contagem');
select tests.entrar('fr');
select is(tests.linhas($$update public.estoque_contagens set status = 'cancelada' where id = 'ct-2'$$), 1, '[regras] es: franqueado cancela contagem');
select throws_ok($$select tests.movimento('ct-2_0', '{"origem":"contagem","origem_id":"ct-2","indice":0,"tipo":"ajuste"}')$$, '42501', null, '[regras] es: ajuste em contagem cancelada é recusado');
select tests.contagem('ct-grande', jsonb_build_object('itens',
  (select jsonb_agg(tests.linha(jsonb_build_object('sistema',0,'contado',n,'diferenca',n)) order by n)
   from generate_series(1,60) n)));
select is((select public.confirmar_contagem_estoque(id,itens,obs) from public.estoque_contagens where id = 'ct-grande'), 60, '[regras] es: contagem com 60 ajustes cabe num lote');
select tests.entrar('admin');
select throws_ok($$delete from public.estoque_contagens where id = 'ct-1'$$, '42501', null, '[regras] es: ninguém apaga contagem');
select tests.entrar('eq');
select is((select count(*)::int from public.estoque_contagens where unidade_id = 'u'), 10, '[regras] es: unidade lista as próprias contagens');
select tests.entrar('outra');
select is((select count(*)::int from public.estoque_contagens where id = 'ct-1'), 0, '[regras] es: outra unidade não lê a contagem');
select tests.entrar('rede');
select is((select count(*)::int from public.estoque_contagens where true), 11, '[regras] es: suprimentos lê contagens');
select tests.entrar('fr');
select lives_ok($$select tests.pedido('pd-n')$$, '[regras] es: franqueado envia pedido');
select tests.entrar('eq');
select throws_ok($$select tests.pedido('pd-x')$$, '42501', null, '[regras] es: equipe não envia pedido');
select tests.entrar('fr');
select throws_ok($$select tests.pedido('pd-x', '{"status":"aprovado"}')$$, '42501', null, '[regras] es: pedido já aprovado na criação é recusado');
select throws_ok($$select tests.pedido('pd-x', '{"unidade_id":"v","unidade_nome":"Outra Es"}')$$, '42501', null, '[regras] es: pedido para outra unidade é recusado');
select throws_ok($$select tests.pedido('pd-x', '{"itens":[]}')$$, '23514', null, '[regras] es: pedido vazio é recusado');
select throws_ok($$select tests.pedido('pd-x', '{"obs_franqueadora":"ok"}')$$, '42501', null, '[regras] es: pedido com resposta da franqueadora é recusado');
select throws_ok($$update public.estoque_pedidos set status = 'aprovado' where id = 'pd-aberto'$$, '42501', null, '[regras] es: franqueado não aprova o próprio pedido');
select throws_ok($$select public.receber_pedido_estoque('pd-aprovado','')$$, '42501', null, '[regras] es: franqueado não recebe pedido que não foi enviado');
select is(tests.linhas($$update public.estoque_pedidos set status = 'cancelado' where id = 'pd-aberto2'$$), 1, '[regras] es: franqueado cancela pedido aberto');
select throws_ok($$update public.estoque_pedidos set status = 'cancelado' where id = 'pd-aprovado'$$, '42501', null, '[regras] es: franqueado não cancela pedido aprovado');
select tests.entrar('outra');
select is(tests.linhas($$update public.estoque_pedidos set status = 'cancelado' where id = 'pd-aberto'$$), 0, '[regras] es: franqueado de outra unidade não mexe no pedido');
select tests.entrar('rede');
select is(tests.linhas($$update public.estoque_pedidos set status = 'aprovado' where id = 'pd-aberto'$$), 1, '[regras] es: suprimentos aprova pedido');
select throws_ok($$update public.estoque_pedidos set status = 'enviado' where id = 'pd-n'$$, '42501', null, '[regras] es: aprovar não pula para enviado');
select throws_ok($$update public.estoque_pedidos set status = 'aprovado', itens = '[]' where id = 'pd-n'$$, '42501', null, '[regras] es: aprovar não mexe nos itens');
select throws_ok($$update public.estoque_pedidos set status = 'cancelado' where id = 'pd-n'$$, '42501', null, '[regras] es: suprimentos não cancela sem justificativa');
select is(tests.linhas($$update public.estoque_pedidos set status = 'enviado', itens = jsonb_build_array(tests.linha_pedido(20)) where id = 'pd-aprovado'$$), 1, '[regras] es: suprimentos marca enviado com a quantidade');
select throws_ok($$update public.estoque_pedidos set status = 'recebido' where id = 'pd-enviado2'$$, '42501', null, '[regras] es: suprimentos não marca recebido');
select tests.entrar('redeSem');
select is(tests.linhas($$update public.estoque_pedidos set status = 'aprovado' where id = 'pd-n'$$), 0, '[regras] es: rede sem o módulo não aprova');
select tests.entrar('rede');
select is(tests.linhas($$update public.estoque_pedidos set status = 'cancelado', obs_franqueadora = 'Item fora de linha' where id = 'pd-n'$$), 1, '[regras] es: suprimentos cancela com justificativa');
select tests.entrar('fr');
select is(public.receber_pedido_estoque('pd-enviado',''), 1, '[regras] es: recebimento gera a entrada no mesmo lote');
select throws_ok($$select tests.movimento('pd-enviado_0', '{"origem":"pedido","origem_id":"pd-enviado","indice":0,"tipo":"entrada"}')$$, '42501', null, '[regras] es: entrada repetida do pedido é recusada');
select throws_ok($$select tests.movimento('pd-enviado2_0', '{"origem":"pedido","origem_id":"pd-enviado2","indice":0,"tipo":"entrada"}')$$, '42501', null, '[regras] es: entrada de pedido sem receber é recusada');
select throws_ok($$select tests.lote($q$update public.estoque_pedidos set status = 'recebido' where id = 'pd-enviado2'$q$, 'pd-enviado2_0', '{"origem":"pedido","origem_id":"pd-enviado2","indice":0,"tipo":"entrada","quantidade":250,"delta":250}')$$, '42501', null, '[regras] es: entrada maior que o enviado é recusada');
select throws_ok($$update public.estoque_pedidos set status = 'recebido', itens = '[]' where id = 'pd-enviado2'$$, '42501', null, '[regras] es: recebimento não mexe nos itens');
select tests.entrar('eq');
select throws_ok($$select public.receber_pedido_estoque('pd-enviado2','')$$, '42501', null, '[regras] es: equipe não confirma recebimento');
select tests.entrar('rede');
select throws_ok($$update public.estoque_pedidos set status = 'cancelado', obs_franqueadora = 'Desfazer' where id = 'pd-enviado'$$, '42501', null, '[regras] es: pedido recebido não muda mais');
select tests.entrar('admin');
select throws_ok($$delete from public.estoque_pedidos where id = 'pd-n'$$, '42501', null, '[regras] es: ninguém apaga pedido');
select tests.entrar('eq');
select is((select count(*)::int from public.estoque_pedidos where unidade_id = 'u'), 6, '[regras] es: equipe da unidade lista os pedidos');
select tests.entrar('outra');
select is((select count(*)::int from public.estoque_pedidos where unidade_id = 'u'), 0, '[regras] es: unidade não lê pedido de outra');
select tests.entrar('rede');
select is((select count(*)::int from public.estoque_pedidos where true), 6, '[regras] es: suprimentos lê pedidos da rede');
select tests.entrar('redeSem');
select is((select count(*)::int from public.estoque_pedidos where true), 0, '[regras] es: rede sem o módulo não lê pedidos');

-- Paridade de leitura e garantias próprias do Postgres.
select tests.entrar('consultor');
select is((select count(*)::int from public.estoque_itens), 0, 'Acompanhamento sozinho não lê o catálogo');
select is((select count(*)::int from public.estoque_movimentos), 0, 'Acompanhamento sozinho não lê movimentos');
select is((select count(*)::int from public.estoque_contagens), 0, 'Acompanhamento sozinho não lê contagens');
select is((select count(*)::int from public.estoque_pedidos), 0, 'Acompanhamento sozinho não lê pedidos');

select tests.entrar('inativo');
select is((select count(*)::int from public.estoque_itens), 0, 'Conta inativa não lê o catálogo');
select is((select count(*)::int from public.estoque_movimentos), 0, 'Conta inativa não lê movimentos da unidade');
select tests.entrar('sem');
select is((select count(*)::int from public.estoque_contagens), 0, 'Equipe sem módulo não lê contagens da unidade');
select is((select count(*)::int from public.estoque_pedidos), 0, 'Equipe sem módulo não lê pedidos da unidade');

select tests.sair();
update public.unidades set ativo = false where id = 'u';
select tests.entrar('fr');
select is((select count(*)::int from public.estoque_itens), 0, 'Unidade inativa não lê o catálogo');
select is((select count(*)::int from public.estoque_saldos), 0, 'Unidade inativa não lê seus saldos');
select tests.entrar('rede');
select is((select count(*)::int from public.estoque_pedidos), 6, 'Suprimentos lê pedidos de unidade inativa');
select tests.sair();
update public.unidades set ativo = true where id = 'u';

select tests.entrar('outra');
select is((select count(*)::int from public.estoque_saldos where unidade_id = 'u'), 0, 'Outra unidade não lê o saldo');
select tests.entrar('fr');
select throws_ok($$select public.registrar_movimento_estoque('it-off','Fita antiga','un','saida',4,'balcão')$$,
  '23514', null, 'RPC recusa saída que deixaria saldo negativo');
select is((select saldo from public.estoque_saldos where unidade_id = 'u' and item_id = 'it-off'), 3::numeric,
  'RPC malsucedida preserva o saldo');
select is((select count(*)::int from public.estoque_movimentos where item_id = 'it-off'), 2,
  'RPC malsucedida preserva o histórico');
select throws_ok($$insert into public.estoque_saldos values ('u','novo',10)$$,
  '42501', null, 'Inserção direta de saldo é recusada');
select is(tests.linhas($$update public.estoque_saldos set saldo = 900 where item_id = 'it-off'$$), 0,
  'Alteração direta de saldo é recusada pelo RLS');
select is((select saldo from public.estoque_saldos where unidade_id = 'u' and item_id = 'it-cx'), 29::numeric,
  'Saldo reflete os deltas da contagem e do recebimento');
select is((select status from public.estoque_pedidos where id = 'pd-enviado2'), 'enviado',
  'Lote de recebimento inválido preserva o status');
select ok((select confirmado_por = tests.id('fr') and confirmado_nome = 'Dono Es' and confirmado_em = atualizado_em
  from public.estoque_contagens where id = 'ct-1'), 'Servidor carimba a confirmação');

-- O primeiro ajuste aplica um delta antes de a segunda linha falhar.
select tests.contagem('ct-falha');
select throws_ok($$
  select public.confirmar_contagem_estoque('ct-falha', jsonb_build_array(
    tests.linha('{"itemId":"it-cx","itemNome":"Caixa de mudança M","sistema":29,"contado":30,"diferenca":1}'),
    tests.linha('{"itemId":"it-off","itemNome":"Fita antiga","sistema":10,"contado":0,"diferenca":-10}')
  ), '')
$$, '23514', null, 'Saldo negativo na segunda linha desfaz a confirmação inteira');
select is((select status from public.estoque_contagens where id = 'ct-falha'), 'aberta',
  'Falha preserva a contagem aberta');
select is((select count(*)::int from public.estoque_movimentos where origem_id = 'ct-falha'), 0,
  'Falha remove inclusive o ajuste que já havia sido inserido');
select is((select saldo from public.estoque_saldos where item_id = 'it-cx'), 29::numeric,
  'Falha reverte o delta aplicado pela primeira linha');

select tests.anonimo();
select throws_ok($$select * from public.estoque_itens$$, '42501', null, 'Anônimo não lê itens');
select throws_ok($$select * from public.estoque_movimentos$$, '42501', null, 'Anônimo não lê movimentos');
select throws_ok($$select * from public.estoque_contagens$$, '42501', null, 'Anônimo não lê contagens');
select throws_ok($$select * from public.estoque_pedidos$$, '42501', null, 'Anônimo não lê pedidos');
select throws_ok($$select * from public.estoque_saldos$$, '42501', null, 'Anônimo não lê saldos');
select throws_ok($$select public.receber_pedido_estoque('pd-enviado','')$$, '42501', null, 'Anônimo não executa RPC');

select tests.sair();
select * from finish();
rollback;
