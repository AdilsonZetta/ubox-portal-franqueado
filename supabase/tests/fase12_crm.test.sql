-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
begin;

create schema tests;
select plan(119);
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
  ('u', 'Unidade Crm', 'Dono Crm', 'u@ubox.test', true),
  ('v', 'Outra Crm', 'Dono Outra Crm', 'v@ubox.test', true),
  ('w', 'Inativa Es', 'Dono Inativo', 'w@ubox.test', false);

insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, unidade, modulos_liberados)
select tests.id(a), a || '@ubox.test', n, p::public.papel, at, u,
  coalesce((select nome from public.unidades where id = u), ''), m
from (values
  ('admin','Admin Rede','admin',true,'u','{crm}'::text[]),
  ('fr','Dono Crm','franqueado',true,'u','{crm}'),
  ('eq','Vendedora Crm','equipe_franqueado',true,'u','{crm}'),
  ('outra','Dono Outra Crm','franqueado',true,'v','{crm}'),
  ('rede','Comercial Rede','equipe_franqueadora',true,'u','{crm}'),
  ('redeSem','Rede Sem Crm','equipe_franqueadora',true,null,'{}'),
  ('consultor','Consultor Rede','equipe_franqueadora',true,'u','{acompanhamento}'),
  ('sem','Equipe Sem','equipe_franqueado',true,'u','{}'),
  ('inativo','Conta Inativa','franqueado',false,'u','{crm}'),
  ('unOff','Dono Inativo','franqueado',true,'w','{crm}')
) as v(a,n,p,at,u,m);


create function tests.lead(chave text, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('id', chave, 'unidade_id', 'u', 'unidade_nome', 'Unidade Crm',
    'origem', 'Instagram', 'valor_estimado_centavos', null, 'etapa', 'novo', 'motivo_perda', '',
    'responsavel_uid', tests.id('eq'), 'responsavel_nome', 'Vendedora Crm',
    'proximo_contato', now() + interval '1 day', 'ultima_atividade_em', null, 'arquivado', false,
    'criado_em', now(), 'etapa_em', now(), 'fechado_em', null,
    'atualizado_por', tests.id('eq'), 'atualizado_por_nome', 'Vendedora Crm', 'atualizado_em', now()) || extra
$$;
create function tests.contato(chave text, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('id', chave, 'unidade_id', 'u', 'nome', 'João Cliente',
    'telefone', '+55 34 98888-1111', 'email', 'joao@cliente.test',
    'interesse_tamanho', '3 m²', 'interesse_periodo', '1 mês', 'interesse_uso', 'Estoque de loja',
    'atualizado_por', tests.id('eq'), 'atualizado_em', now()) || extra
$$;
create function tests.par(chave text, l jsonb default '{}', c jsonb default '{}') returns text language sql as $$
  select public.criar_lead_crm(chave, tests.lead(chave, l) - 'id', jsonb_strip_nulls(tests.contato(chave, c)) - 'id')
$$;
create function tests.lead_direto(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into public.crm_leads select (jsonb_populate_record(null::public.crm_leads, tests.lead(chave, extra))).*
$$;
create function tests.lead_sem_contato() returns void language plpgsql as $$
begin
  perform tests.lead_direto('ld-x');
  set constraints public.crm_lead_exige_contato immediate;
end $$;
create function tests.contato_direto(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into public.crm_contatos select (jsonb_populate_record(null::public.crm_contatos, tests.contato(chave, extra))).*
$$;
create function tests.atividade(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into public.crm_atividades
  select (jsonb_populate_record(null::public.crm_atividades, jsonb_build_object(
    'id', chave, 'lead_id', 'ld-2', 'unidade_id', 'u', 'tipo', 'whatsapp', 'texto', 'Mandei fotos do box',
    'uid', tests.id('eq'), 'nome', 'Vendedora Crm', 'gerado_por_ia', false, 'ia_modelo', '', 'criado_em', now()) || extra)).*
$$;
create function tests.proposta(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into public.crm_propostas
  select (jsonb_populate_record(null::public.crm_propostas, jsonb_build_object(
    'id', chave, 'lead_id', 'ld-2', 'unidade_id', 'u', 'box', 'Box 9', 'preco_mensal_centavos', 21990,
    'periodo_meses', 6, 'validade', now() + interval '5 days', 'status', 'enviada', 'obs', '',
    'gerado_por_ia', false, 'ia_modelo', '', 'criado_em', now(), 'atualizado_por', tests.id('eq'),
    'atualizado_por_nome', 'Vendedora Crm', 'atualizado_em', now()) || extra)).*
$$;
create function tests.config(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into public.crm_config
  select (jsonb_populate_record(null::public.crm_config, jsonb_build_object('id', chave,
    'origens', jsonb_build_array('Site', 'Google', 'Indicação', 'Passante', 'WhatsApp', 'Outro', 'Panfleto'),
    'motivos_perda', jsonb_build_array('Preço', 'Desistiu', 'Outro'), 'atualizado_por', tests.id('rede'),
    'atualizado_por_nome', 'Comercial Rede', 'atualizado_em', now()) || extra)).*
  on conflict (id) do update set origens = excluded.origens, motivos_perda = excluded.motivos_perda
$$;
grant execute on all functions in schema tests to authenticated;

select tests.lead_direto('ld-1', '{"etapa":"contato"}');
select tests.lead_direto('ld-2', '{"etapa":"proposta"}');
select tests.lead_direto('ld-ganho', jsonb_build_object('etapa','ganho','fechado_em',now()));
select tests.lead_direto('ld-outra', jsonb_build_object('unidade_id','v','unidade_nome','Outra Crm',
  'responsavel_uid',tests.id('outra'),'responsavel_nome','Dono Outra Crm'));
select tests.contato_direto('ld-1');
select tests.contato_direto('ld-outra', '{"unidade_id":"v"}');
select tests.atividade('at-1', '{"lead_id":"ld-1"}');
select tests.proposta('pp-1');
select tests.proposta('pp-2');
select tests.entrar('eq');
select ok(app.origem_crm_ok('Instagram') and app.motivo_perda_crm_ok('Sem retorno')
  and not app.origem_crm_ok('Panfleto'), 'Sem configuração valem as origens e motivos padrão');
select tests.sair();
select tests.config('rede', '{"origens":["Site","Instagram"],"motivos_perda":["Preço","Sem retorno"]}');

create function tests.registrar() returns boolean language plpgsql as $$
begin
  perform public.registrar_atividade_crm('at-n1','ld-2','u','whatsapp','Mandei fotos',false,'',
    true,true,now() + interval '2 days');
  return true;
end $$;

create function tests.le_config() returns boolean language plpgsql as $$
declare unidade boolean;
begin
  select exists (select 1 from public.crm_config where id = 'rede') into unidade;
  perform tests.entrar('rede');
  return unidade and exists (select 1 from public.crm_config where id = 'rede');
end $$;

select tests.sair();
select tests.entrar('rede');
select is((select count(*)::int from public.crm_leads), 4, '[regras] crm: franqueadora lê os leads (sem PII) da rede');
select is((select count(*)::int from public.crm_contatos where id = 'ld-1'), 0, '[regras] crm: franqueadora não lê contatos (PII)');
select is((select count(*)::int from public.crm_contatos), 0, '[regras] crm: franqueadora não lista contatos');
select tests.sair();
select tests.entrar('admin');
select is((select count(*)::int from public.crm_contatos where id = 'ld-1'), 0, '[regras] crm: admin também não lê contatos');
select tests.sair();
select tests.entrar('rede');
select is((select count(*)::int from public.crm_atividades), 0, '[regras] crm: franqueadora não lê atividades');
select is((select count(*)::int from public.crm_propostas), 0, '[regras] crm: franqueadora não lê propostas');
select tests.sair();
select tests.entrar('redeSem');
select is((select count(*)::int from public.crm_leads), 0, '[regras] crm: rede sem o módulo não lê leads');
select tests.sair();
select tests.entrar('eq');
select is((select count(*)::int from public.crm_leads where unidade_id = 'u'), 3, '[regras] crm: equipe lê os leads da unidade toda');
select is((select count(*)::int from public.crm_contatos where unidade_id = 'u'), 1, '[regras] crm: equipe lê os contatos da unidade');
-- O Firestore rejeita a consulta ampla e o RLS filtra as linhas da outra unidade.
select is((select count(*)::int from public.crm_leads), 3, '[regras] crm: unidade não lista sem filtrar a unidade');
select tests.sair();
select tests.entrar('fr');
select is((select count(*)::int from public.crm_leads where id = 'ld-outra'), 0, '[regras] crm: unidade não lê lead de outra');
select is((select count(*)::int from public.crm_contatos where id = 'ld-outra'), 0, '[regras] crm: unidade não lê contato de outra');
select tests.sair();
select tests.entrar('sem');
select is((select count(*)::int from public.crm_leads), 0, '[regras] crm: equipe sem o módulo não lê leads');
select is((select count(*)::int from public.crm_contatos), 0, '[regras] crm: equipe sem o módulo não lê contatos');
select tests.sair();
select tests.entrar('eq');
select is((select count(*)::int from public.crm_atividades where unidade_id = 'u' and lead_id = 'ld-1'), 1, '[regras] crm: unidade lê atividades do lead');
select ok(tests.le_config(), '[regras] crm: unidade e rede leem a configuração');
select tests.sair();
select tests.entrar('eq');
select lives_ok($sql$select tests.par('ld-n1')$sql$, '[regras] crm: equipe cria lead com contato no lote');
select throws_ok($sql$select tests.par('ld-x14', '{"responsavel_nome":"Gerente Fantasma"}')$sql$, '42501', null, '[regras] crm: responsável com nome inventado na criação é recusado');
select throws_ok($sql$select tests.par('ld-x15', '{"interesse_uso":"Guardar móveis da separação"}')$sql$, '42501', null, '[regras] crm: interesseUso no lead (sem PII) é recusado');
select throws_ok($sql$select tests.par('ld-x16', '{"interesse_tamanho":"6 m²","interesse_periodo":"3 meses"}')$sql$, '42501', null, '[regras] crm: interesse em texto livre no lead é recusado');
select throws_ok($sql$select tests.par('ld-x17', '{}', '{"interesse_uso":null,"interesse_tamanho":null,"interesse_periodo":null}')$sql$, '42501', null, '[regras] crm: contato sem os campos de interesse é recusado');
select throws_ok($sql$select tests.par('ld-x18', '{}', jsonb_build_object('interesse_uso', repeat('x',201)))$sql$, '42501', null, '[regras] crm: interesseUso acima de 200 caracteres é recusado');
select throws_ok($sql$select tests.lead_sem_contato()$sql$, '42501', null, '[regras] crm: lead sem o contato é recusado');
select throws_ok($sql$select tests.contato_direto('ld-x2')$sql$, '42501', null, '[regras] crm: contato sem o lead é recusado');
select throws_ok($sql$select tests.par('ld-x3', '{"nome":"João","telefone":"3499"}')$sql$, '42501', null, '[regras] crm: lead com nome/telefone no doc sem PII é recusado');
select throws_ok($sql$select tests.par('ld-x4', '{"origem":"TikTok"}')$sql$, '42501', null, '[regras] crm: origem fora da lista da rede é recusada');
select throws_ok($sql$select tests.par('ld-x5', jsonb_build_object('etapa','ganho','fechado_em',now()))$sql$, '42501', null, '[regras] crm: lead já ganho na criação é recusado');
select throws_ok($sql$select tests.par('ld-x6', jsonb_build_object('responsavel_uid',tests.id('outra'),'responsavel_nome','Dono Outra Crm'))$sql$, '42501', null, '[regras] crm: responsável de outra unidade é recusado');
select throws_ok($sql$select tests.par('ld-x7', jsonb_build_object('responsavel_uid',tests.id('sem'),'responsavel_nome','Equipe Sem'))$sql$, '42501', null, '[regras] crm: responsável sem o módulo é recusado');
select throws_ok($sql$select tests.par('ld-x8', '{"unidade_id":"v","unidade_nome":"Outra Crm"}', '{"unidade_id":"v"}')$sql$, '42501', null, '[regras] crm: lead para outra unidade é recusado');
select throws_ok($sql$select tests.par('ld-x9', '{}', '{"telefone":"liga pra mim"}')$sql$, '42501', null, '[regras] crm: telefone com letras é recusado');
select throws_ok($sql$select tests.par('ld-x10', '{}', '{"email":"joao@"}')$sql$, '42501', null, '[regras] crm: e-mail inválido é recusado');
select throws_ok($sql$select tests.par('ld-x11', '{"valor_estimado_centavos":10.5}')$sql$, '42501', null, '[regras] crm: valor estimado fracionado é recusado');
select tests.sair();
select tests.entrar('sem');
select throws_ok($sql$select tests.par('ld-x12', jsonb_build_object('atualizado_por',tests.id('sem'),'atualizado_por_nome','Equipe Sem'), jsonb_build_object('atualizado_por',tests.id('sem')))$sql$, '42501', null, '[regras] crm: equipe sem o módulo não cria lead');
select tests.sair();
select tests.entrar('rede');
select throws_ok($sql$select tests.par('ld-x13', jsonb_build_object('atualizado_por',tests.id('rede'),'atualizado_por_nome','Comercial Rede'), jsonb_build_object('atualizado_por',tests.id('rede')))$sql$, '42501', null, '[regras] crm: franqueadora não cria lead');
select tests.sair();
select tests.entrar('eq');
select is(tests.linhas($sql$update public.crm_leads set etapa = 'visita', etapa_em = now() where id = 'ld-1'$sql$), 1, '[regras] crm: equipe move lead para visita');
select throws_ok($sql$update public.crm_leads set etapa = 'proposta', etapa_em = now() - interval '1 minute' where id = 'ld-1'$sql$, '42501', null, '[regras] crm: mudar etapa sem horário do servidor é recusado');
select throws_ok($sql$update public.crm_leads set etapa = 'perdido', etapa_em = now(), fechado_em = now() where id = 'ld-1'$sql$, '42501', null, '[regras] crm: perdido sem motivo é recusado');
select throws_ok($sql$update public.crm_leads set etapa = 'perdido', etapa_em = now(), fechado_em = now(), motivo_perda = 'Não gostei' where id = 'ld-1'$sql$, '42501', null, '[regras] crm: perdido com motivo fora da lista é recusado');
select throws_ok($sql$update public.crm_leads set etapa = 'ganho', etapa_em = now() where id = 'ld-1'$sql$, '42501', null, '[regras] crm: ganho sem data de fechamento é recusado');
select throws_ok($sql$update public.crm_leads set responsavel_uid = tests.id('outra'), responsavel_nome = 'Dono Outra Crm' where id = 'ld-1'$sql$, '42501', null, '[regras] crm: reatribuir para pessoa de outra unidade é recusado');
select throws_ok($sql$update public.crm_leads set responsavel_nome = 'Outro Nome Qualquer' where id = 'ld-1'$sql$, '42501', null, '[regras] crm: reescrever o nome do responsável com o mesmo uid é recusado');
select throws_ok($sql$update public.crm_leads set responsavel_uid = tests.id('fr'), responsavel_nome = 'Dono Falso' where id = 'ld-1'$sql$, '42501', null, '[regras] crm: reatribuir com nome diferente do perfil é recusado');
select throws_ok($sql$update public.crm_leads set interesse_uso = 'Mudança' where id = 'ld-1'$sql$, '42703', null, '[regras] crm: interesseUso não entra no lead por atualização');
select is(tests.linhas($sql$update public.crm_contatos set interesse_uso = 'Guardar estoque', interesse_periodo = '6 meses' where id = 'ld-1'$sql$), 1, '[regras] crm: unidade edita o interesse no contato');
select tests.sair();
select tests.entrar('fr');
select is(tests.linhas($sql$update public.crm_leads set responsavel_uid = tests.id('fr'), responsavel_nome = 'Dono Crm' where id = 'ld-1'$sql$), 1, '[regras] crm: franqueado reatribui para si');
select tests.sair();
select tests.entrar('eq');
select throws_ok($sql$update public.crm_leads set unidade_id = 'v' where id = 'ld-1'$sql$, '42501', null, '[regras] crm: lead não muda de unidade');
select throws_ok($sql$update public.crm_leads set criado_em = '2020-01-01' where id = 'ld-1'$sql$, '42501', null, '[regras] crm: lead não muda a data de criação');
select is(tests.linhas($sql$update public.crm_leads set etapa = 'perdido', motivo_perda = 'Preço', etapa_em = now(), fechado_em = now() where id = 'ld-1'$sql$), 1, '[regras] crm: perdido com motivo da lista é aceito');
select throws_ok($sql$update public.crm_leads set etapa = 'contato', motivo_perda = '', etapa_em = now(), fechado_em = null where id = 'ld-1'$sql$, '42501', null, '[regras] crm: lead fechado não volta ao funil');
select is(tests.linhas($sql$update public.crm_leads set arquivado = true where id = 'ld-ganho'$sql$), 1, '[regras] crm: lead fechado só arquiva');
select throws_ok($sql$update public.crm_leads set valor_estimado_centavos = 1 where id = 'ld-ganho'$sql$, '42501', null, '[regras] crm: lead fechado não muda valor');
select tests.sair();
select tests.entrar('outra');
select is(tests.linhas($sql$update public.crm_leads set arquivado = true where id = 'ld-2'$sql$), 0, '[regras] crm: outra unidade não mexe no lead');
select tests.sair();
select tests.entrar('rede');
select is(tests.linhas($sql$update public.crm_leads set arquivado = true where id = 'ld-2'$sql$), 0, '[regras] crm: franqueadora não mexe no lead');
select tests.sair();
select tests.entrar('admin');
select throws_ok($sql$delete from public.crm_leads where id = 'ld-2'$sql$, '42501', null, '[regras] crm: ninguém apaga lead');
select tests.sair();
select tests.entrar('fr');
select throws_ok($sql$delete from public.crm_contatos where id = 'ld-1'$sql$, '42501', null, '[regras] crm: ninguém apaga contato');
select tests.sair();
select tests.entrar('eq');
select is(tests.linhas($sql$update public.crm_contatos set telefone = '34 3333-4444' where id = 'ld-1'$sql$), 1, '[regras] crm: unidade edita o contato');
select throws_ok($sql$update public.crm_contatos set unidade_id = 'v' where id = 'ld-1'$sql$, '42501', null, '[regras] crm: contato não muda de unidade');
select tests.registrar();
select ok((select ultima_atividade_em = now() and proximo_contato = now() + interval '2 days'
  from public.crm_leads where id = 'ld-2') and exists (select 1 from public.crm_atividades where id = 'at-n1'), '[regras] crm: atividade + próximo follow-up no lote');
select throws_ok($sql$select tests.atividade('at-x', '{"gerado_por_ia":true}')$sql$, '42501', null, '[regras] crm: atividade com IA sem modelo é recusada');
select lives_ok($sql$select tests.atividade('at-ia', '{"gerado_por_ia":true,"ia_modelo":"Grok Bot"}')$sql$, '[regras] crm: atividade com IA registra o modelo');
select throws_ok($sql$select tests.atividade('at-x', '{"tipo":"fax"}')$sql$, '42501', null, '[regras] crm: tipo de atividade desconhecido é recusado');
select throws_ok($sql$select tests.atividade('at-x', '{"lead_id":"ld-outra"}')$sql$, '42501', null, '[regras] crm: atividade em lead de outra unidade é recusada');
select throws_ok($sql$select tests.atividade('at-x', '{"nome":"Dono Crm"}')$sql$, '42501', null, '[regras] crm: atividade em nome de outra pessoa é recusada');
select throws_ok($sql$select tests.atividade('at-x', jsonb_build_object('criado_em', now() - interval '1 minute'))$sql$, '42501', null, '[regras] crm: atividade com horário do cliente é recusada');
select throws_ok($sql$update public.crm_atividades set texto = 'mudei' where id = 'at-1'$sql$, '42501', null, '[regras] crm: atividade é imutável');
select tests.sair();
select tests.entrar('fr');
select throws_ok($sql$delete from public.crm_atividades where id = 'at-1'$sql$, '42501', null, '[regras] crm: ninguém apaga atividade');
select tests.sair();
select tests.entrar('eq');
select lives_ok($sql$select tests.proposta('pp-n')$sql$, '[regras] crm: equipe registra proposta');
select throws_ok($sql$select tests.proposta('pp-x', jsonb_build_object('validade', now() - interval '1 day'))$sql$, '42501', null, '[regras] crm: proposta vencida na criação é recusada');
select throws_ok($sql$select tests.proposta('pp-x', '{"preco_mensal_centavos":0}')$sql$, '42501', null, '[regras] crm: proposta sem preço é recusada');
select throws_ok($sql$select tests.proposta('pp-x', '{"status":"aceita"}')$sql$, '42501', null, '[regras] crm: proposta já aceita na criação é recusada');
select throws_ok($sql$select tests.proposta('pp-x', '{"lead_id":"ld-outra"}')$sql$, '42501', null, '[regras] crm: proposta em lead de outra unidade é recusada');
select is(tests.linhas($sql$update public.crm_propostas set status = 'aceita' where id = 'pp-1'$sql$), 1, '[regras] crm: proposta aceita');
select throws_ok($sql$update public.crm_propostas set status = 'recusada' where id = 'pp-1'$sql$, '42501', null, '[regras] crm: proposta aceita não muda mais');
select throws_ok($sql$update public.crm_propostas set preco_mensal_centavos = 1 where id = 'pp-2'$sql$, '42501', null, '[regras] crm: preço da proposta não muda');
select tests.sair();
select tests.entrar('fr');
select throws_ok($sql$delete from public.crm_propostas where id = 'pp-2'$sql$, '42501', null, '[regras] crm: ninguém apaga proposta');
select tests.sair();
select tests.entrar('rede');
select throws_ok($sql$select tests.config('rede', '{"motivos_perda":[]}')$sql$, '42501', null, '[regras] crm: franqueadora não configura com lista vazia');
select throws_ok($sql$select tests.config('outra')$sql$, '42501', null, '[regras] crm: franqueadora não cria outro doc de configuração');
select tests.sair();
select tests.entrar('fr');
select throws_ok($sql$select tests.config('rede', jsonb_build_object('atualizado_por',tests.id('fr'),'atualizado_por_nome','Dono Crm'))$sql$, '42501', null, '[regras] crm: franqueado não configura a rede');
select tests.sair();
select tests.entrar('redeSem');
select throws_ok($sql$select tests.config('rede', jsonb_build_object('atualizado_por',tests.id('redeSem'),'atualizado_por_nome','Rede Sem Crm'))$sql$, '42501', null, '[regras] crm: rede sem o módulo não configura');
select tests.sair();
select tests.entrar('rede');
select lives_ok($sql$select tests.config('rede')$sql$, '[regras] crm: franqueadora configura origens e motivos');
select tests.sair();
select tests.entrar('eq');
select lives_ok($sql$select tests.par('ld-n2', '{"origem":"Panfleto"}')$sql$, '[regras] crm: origem nova da rede passa a valer');
select throws_ok($sql$update public.crm_leads set etapa = 'perdido', motivo_perda = 'Sem retorno', etapa_em = now(), fechado_em = now() where id = 'ld-n2'$sql$, '42501', null, '[regras] crm: motivo retirado da lista deixa de valer');
select is(tests.linhas($sql$update public.crm_leads set etapa = 'contato', etapa_em = now() where id = 'ld-n1'$sql$), 1, '[regras] crm: lead antigo com origem retirada ainda anda no funil');
select tests.sair();
select tests.entrar('admin');
select throws_ok($sql$delete from public.crm_config where id = 'rede'$sql$, '42501', null, '[regras] crm: ninguém apaga a configuração');
select tests.sair();
select tests.entrar('consultor');
select is((select count(*)::int from public.crm_contatos), 0, 'Consultor de acompanhamento não lê contatos');
select tests.sair();
select tests.entrar('inativo');
select is((select count(*)::int from public.crm_contatos), 0, 'Conta inativa não lê contatos');
select tests.sair();
select tests.entrar('unOff');
select is((select count(*)::int from public.crm_contatos), 0, 'Unidade inativa não lê contatos');
select tests.sair();
select tests.entrar('admin');
select is(tests.linhas($sql$update public.crm_contatos set nome = 'Nome alterado' where id = 'ld-1'$sql$), 0, 'Admin não altera contato');
select throws_ok($sql$select tests.contato_direto('ld-2')$sql$, '42501', null, 'Admin não insere contato na unidade');
select tests.sair();
select tests.entrar('rede');
select is(tests.linhas($sql$update public.crm_contatos set nome = 'Nome alterado' where id = 'ld-1'$sql$), 0, 'Franqueadora não altera contato');
select throws_ok($sql$select tests.contato_direto('ld-2')$sql$, '42501', null, 'Franqueadora não insere contato na unidade');
select tests.sair();
select tests.entrar('consultor');
select is(tests.linhas($sql$update public.crm_contatos set nome = 'Nome alterado' where id = 'ld-1'$sql$), 0, 'Consultor não altera contato');
select throws_ok($sql$select tests.contato_direto('ld-2')$sql$, '42501', null, 'Consultor não insere contato na unidade');
select tests.sair();
select tests.entrar('outra');
select is(tests.linhas($sql$update public.crm_contatos set nome = 'Nome alterado' where id = 'ld-1'$sql$), 0, 'Outra unidade não altera contato');
select throws_ok($sql$select tests.contato_direto('ld-2')$sql$, '42501', null, 'Outra unidade não insere contato na unidade');
select tests.sair();
select tests.entrar('inativo');
select is(tests.linhas($sql$update public.crm_contatos set nome = 'Nome alterado' where id = 'ld-1'$sql$), 0, 'Conta inativa não altera contato');
select throws_ok($sql$select tests.contato_direto('ld-2')$sql$, '42501', null, 'Conta inativa não insere contato na unidade');
select tests.sair();
select tests.entrar('sem');
select is(tests.linhas($sql$update public.crm_contatos set nome = 'Nome alterado' where id = 'ld-1'$sql$), 0, 'Equipe sem módulo não altera contato');
select throws_ok($sql$select tests.contato_direto('ld-2')$sql$, '42501', null, 'Equipe sem módulo não insere contato na unidade');
select tests.sair();
select tests.entrar('eq');
select is((select count(*)::int from public.crm_leads where id = 'ld-x10'), 0, 'Falha do contato desfaz a criação do lead');
select throws_ok($sql$update public.crm_contatos set email = 'pii-invalida' where id = 'ld-1'$sql$, '42501', 'Contato CRM inválido.', 'Validação do contato responde com mensagem fixa');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crm_leads' and column_name in ('nome','telefone','email','interesse_uso','interesse_tamanho','interesse_periodo')), 'Lead tem somente os campos do funil');
select lives_ok($sql$
  select public.criar_lead_crm('ld-app',
    jsonb_build_object('unidade_id','u','unidade_nome','Unidade Crm','origem','Site',
      'etapa','novo','motivo_perda','','responsavel_uid',tests.id('eq'),
      'responsavel_nome','Vendedora Crm','arquivado',false),
    tests.contato('ld-app') - array['id','atualizado_por','atualizado_em'])
$sql$, 'RPC aceita o payload do app sem carimbos de cliente');
select is((select count(*)::int from public.crm_leads l join public.crm_contatos c using (id)
  where l.id = 'ld-app' and l.criado_em = now() and l.etapa_em = now()
    and l.atualizado_por = tests.id('eq') and l.atualizado_por_nome = 'Vendedora Crm'
    and c.atualizado_por = tests.id('eq') and c.atualizado_em = now()), 1,
  'Criação grava o par com autoria e datas do servidor');
select is(tests.linhas($sql$update public.crm_leads set etapa = 'ganho', etapa_em = 'infinity',
  fechado_em = 'infinity' where id = 'ld-app'$sql$), 1, 'Marcador solicita o horário do servidor');
select is((select fechado_em from public.crm_leads where id = 'ld-app'), now(), 'Marcador não fica gravado');
select throws_ok($sql$select tests.par('ld-valor-texto', '{"origem":"Site","valor_estimado_centavos":"10"}')$sql$,
  '42501', null, 'RPC recusa valor estimado enviado como texto');
select throws_ok($sql$select public.registrar_atividade_crm(
  'at-falha','ld-app','u','nota','Atividade com dados fictícios',false,'',true,false,null)$sql$,
  '42501', null, 'Falha no follow-up de lead fechado cancela a inserção da atividade');
select is((select count(*)::int from public.crm_atividades where id = 'at-falha'), 0,
  'Nenhuma atividade parcial depois da falha no follow-up');
select lives_ok($sql$select public.registrar_atividade_crm(
  'at-fechada','ld-app','u','nota','Registro de lead fechado',false,'',false,false,null)$sql$,
  'Unidade registra atividade em lead fechado sem mexer no funil');
select tests.sair();
select tests.anonimo();
select throws_ok($sql$select * from public.crm_config$sql$, '42501', null, 'Anônimo não lê crm_config');
select throws_ok($sql$select * from public.crm_leads$sql$, '42501', null, 'Anônimo não lê crm_leads');
select throws_ok($sql$select * from public.crm_contatos$sql$, '42501', null, 'Anônimo não lê crm_contatos');
select throws_ok($sql$select * from public.crm_atividades$sql$, '42501', null, 'Anônimo não lê crm_atividades');
select throws_ok($sql$select * from public.crm_propostas$sql$, '42501', null, 'Anônimo não lê crm_propostas');
select throws_ok($sql$select public.criar_lead_crm('anon', '{}', '{}')$sql$, '42501', null, 'Anônimo não executa a criação do lead');
select tests.sair();
select ok(not has_function_privilege('service_role', 'public.criar_lead_crm(text,jsonb,jsonb)', 'execute')
  and not has_function_privilege('service_role',
    'public.registrar_atividade_crm(text,text,text,text,text,boolean,text,boolean,boolean,timestamptz)', 'execute'),
  'RPCs do CRM são exclusivas do papel authenticated na API');
select * from finish();
rollback;
