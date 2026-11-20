-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
begin;

create schema tests;
select plan(74);

create table tests.pessoas (apelido text primary key, id uuid not null default gen_random_uuid());
insert into tests.pessoas (apelido) values
  ('admin'), ('fr'), ('eq'), ('outra'), ('rede'), ('redeSem'), ('sem'), ('inativo'), ('unOff');

create function tests.id(a text) returns uuid language sql stable as $$
  select id from tests.pessoas where apelido = a
$$;

create function tests.entrar(a text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.id(a), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function tests.anonimo() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create function tests.linhas(cmd text) returns integer language plpgsql as $$
declare n integer;
begin
  execute cmd;
  get diagnostics n = row_count;
  return n;
end $$;

grant usage on schema tests to anon, authenticated;
grant select on tests.pessoas to authenticated;
grant execute on all functions in schema tests to authenticated;

insert into auth.users (id, email)
select id, apelido || '@ubox.test' from tests.pessoas;

insert into public.unidades (id, nome, responsavel, email, ativo) values
  ('u', 'Unidade Azul', 'Dono', 'u@ubox.test', true),
  ('v', 'Unidade Verde', 'Dono', 'v@ubox.test', true),
  ('w', 'Unidade Fechada', 'Dono', 'w@ubox.test', false);

insert into public.usuarios (id, email, nome, papel, ativo, unidade_id, unidade, modulos_liberados)
select tests.id(a), a || '@ubox.test', n, p::public.papel, at, u,
  coalesce((select nome from public.unidades where id = u), ''), m
from (values
  ('admin','Admin Rede','admin',true,null,'{}'::text[]),
  ('fr','Dono Nuvem','franqueado',true,'u','{nuvem}'),
  ('eq','Equipe Nuvem','equipe_franqueado',true,'u','{nuvem}'),
  ('outra','Dono Outra','franqueado',true,'v','{nuvem}'),
  ('rede','Rede Nuvem','equipe_franqueadora',true,null,'{nuvem-rede}'),
  ('redeSem','Rede Sem Nuvem','equipe_franqueadora',true,null,'{nuvem}'),
  ('sem','Equipe Sem Nuvem','equipe_franqueado',true,'u','{manuais}'),
  ('inativo','Conta Inativa','franqueado',false,'u','{nuvem}'),
  ('unOff','Dono Inativo','franqueado',true,'w','{nuvem}')
) as v(a,n,p,at,u,m);

insert into public.nuvem_links (id, titulo, url, pasta, dono, visibilidade, unidades,
  criado_por, criado_por_nome, criado_em, atualizado_por, atualizado_por_nome, atualizado_em)
select id, 'Contrato padrão', 'https://drive.google.com/x', 'Contratos', dono, vis, un,
  tests.id(autor), nome, now(), tests.id(autor), nome, now()
from (values
  ('nv-rede','','rede','{}'::text[],'rede','Rede Nuvem'),
  ('nv-uns','','unidades','{u}','rede','Rede Nuvem'),
  ('nv-uns2','','unidades','{v}','rede','Rede Nuvem'),
  ('nv-fq','','franqueadora','{}','rede','Rede Nuvem'),
  ('nv-priv','u','privada','{}','fr','Dono Nuvem'),
  ('nv-priv2','v','privada','{}','outra','Dono Outra'),
  ('nv-off','w','privada','{}','unOff','Dono Inativo')
) as v(id,dono,vis,un,autor,nome);

create function tests.link(chave text, extra jsonb default '{}') returns void language sql as $$
  insert into public.nuvem_links
  select (jsonb_populate_record(null::public.nuvem_links,
    '{"titulo":"Contrato padrão","descricao":"Modelo atualizado","url":"https://docs.google.com/document/d/xyz/edit",
      "pasta":"Contratos","tags":"contrato,modelo","visibilidade":"privada","unidades":[],"dono":"u",
      "gerado_por_ia":false,"ia_modelo":""}' || jsonb_build_object('id', chave) || extra)).*
$$;
grant execute on function tests.link(text, jsonb) to authenticated;

select tests.entrar('eq');
select is((select array(select id from public.nuvem_links where id = 'nv-rede' order by id)), array['nv-rede']::text[],
  '[regras] nv: unidade lê link da rede toda');
reset role;
select tests.entrar('fr');
select is((select array(select id from public.nuvem_links where id = 'nv-uns' order by id)), array['nv-uns']::text[],
  '[regras] nv: unidade escolhida lê link compartilhado com ela');
reset role;
select tests.entrar('outra');
select is((select array(select id from public.nuvem_links where id = 'nv-uns' order by id)), '{}'::text[],
  '[regras] nv: unidade não escolhida não lê');
reset role;
select tests.entrar('fr');
select is((select array(select id from public.nuvem_links where id = 'nv-fq' order by id)), '{}'::text[],
  '[regras] nv: unidade não lê a pasta só da franqueadora');
reset role;
select tests.entrar('eq');
select is((select array(select id from public.nuvem_links where id = 'nv-priv' order by id)), array['nv-priv']::text[],
  '[regras] nv: unidade lê a própria área privada');
reset role;
select tests.entrar('outra');
select is((select array(select id from public.nuvem_links where id = 'nv-priv' order by id)), '{}'::text[],
  '[regras] nv: outra unidade não lê a área privada');
reset role;
select tests.entrar('rede');
select is((select array(select id from public.nuvem_links where id = 'nv-priv' order by id)), '{}'::text[],
  '[regras] nv: franqueadora não lê a área privada da unidade');
reset role;
select tests.entrar('admin');
select is((select array(select id from public.nuvem_links where id = 'nv-priv' order by id)), '{}'::text[],
  '[regras] nv: admin não lê a área privada da unidade');
reset role;
select tests.entrar('sem');
select is((select array(select id from public.nuvem_links where id = 'nv-rede' order by id)), '{}'::text[],
  '[regras] nv: equipe sem o módulo não lê');
reset role;
select tests.entrar('redeSem');
select is((select array(select id from public.nuvem_links where id = 'nv-fq' order by id)), '{}'::text[],
  '[regras] nv: franqueadora sem nuvem-rede não lê');
reset role;
select tests.anonimo();
select throws_ok($$ select * from public.nuvem_links $$, '42501', null,
  '[regras] nv: anônimo não lê');
-- As consultas devolvem apenas as linhas permitidas pelo RLS.
reset role;
select tests.entrar('rede');
select is((select array(select id from public.nuvem_links where dono = '' order by id)), array['nv-fq','nv-rede','nv-uns','nv-uns2']::text[],
  '[regras] nv: franqueadora lista os links da rede');
reset role;
select tests.entrar('fr');
select is((select array(select id from public.nuvem_links where dono = '' and visibilidade = 'rede' order by id)), array['nv-rede']::text[],
  '[regras] nv: unidade lista links da rede toda');
select is((select array(select id from public.nuvem_links where dono = '' and 'u' = any(unidades) order by id)), array['nv-uns']::text[],
  '[regras] nv: unidade lista links compartilhados com ela');
select is((select array(select id from public.nuvem_links where dono = '' and 'v' = any(unidades) order by id)), '{}'::text[],
  '[regras] nv: unidade não lista links de outra unidade escolhida');
reset role;
select tests.entrar('eq');
select is((select array(select id from public.nuvem_links where dono = 'u' order by id)), array['nv-priv']::text[],
  '[regras] nv: unidade lista a própria área');
reset role;
select tests.entrar('fr');
select is((select array(select id from public.nuvem_links where dono = 'v' order by id)), '{}'::text[],
  '[regras] nv: unidade não lista a área de outra');
select is((select array(select id from public.nuvem_links where dono = '' order by id)), array['nv-rede','nv-uns']::text[],
  '[regras] nv: unidade não lista tudo da franqueadora');
reset role;
select tests.entrar('rede');
select is((select array(select id from public.nuvem_links where dono = 'u' order by id)), '{}'::text[],
  '[regras] nv: franqueadora não lista área de unidade');
reset role;
select tests.entrar('eq');
select lives_ok($$ select tests.link('n1') $$,
  '[regras] nv: unidade guarda link do Drive na área privada');
reset role;
select tests.entrar('rede');
select lives_ok($$ select tests.link('n2', '{"dono":"","visibilidade":"rede"}') $$,
  '[regras] nv: franqueadora publica para a rede');
select lives_ok($$ select tests.link('n3', '{"dono":"","visibilidade":"unidades","unidades":["u","v"]}') $$,
  '[regras] nv: franqueadora compartilha com unidades escolhidas');
select lives_ok($$ select tests.link('n4', '{"dono":"","visibilidade":"franqueadora"}') $$,
  '[regras] nv: franqueadora guarda na pasta só dela');
reset role;
select tests.entrar('admin');
select lives_ok($$ select tests.link('n5', '{"dono":"","visibilidade":"rede"}') $$,
  '[regras] nv: admin publica para a rede');
reset role;
select tests.entrar('fr');
select lives_ok($$ select tests.link('n6', '{"gerado_por_ia":true,"ia_modelo":"Grok Bot"}') $$,
  '[regras] nv: descrição com IA e modelo registrado');
select throws_ok($$ select tests.link('n7', '{"gerado_por_ia":true}') $$, '23514', null,
  '[regras] nv: IA sem o modelo é recusada');
select throws_ok($$ select tests.link('n8', '{"url":"http://drive.google.com/x"}') $$, '23514', null,
  '[regras] nv: link http (sem https) é recusado');
select throws_ok($$ select tests.link('n9', '{"url":"https://dropbox.com/s/x"}') $$, '23514', null,
  '[regras] nv: link fora do Google Drive é recusado');
select throws_ok($$ select tests.link('n10', '{"url":"https://drive.google.com.evil.io/x"}') $$, '23514', null,
  '[regras] nv: domínio parecido com o do Drive é recusado');
select throws_ok($$ select tests.link('n11', '{"url":"https://drive.google.com/a b"}') $$, '23514', null,
  '[regras] nv: link com espaço é recusado');
select throws_ok($$ select tests.link('n12', '{"tags":"a,b,c,d,e,f,g,h,i,j,k"}') $$, '23514', null,
  '[regras] nv: mais de 10 tags é recusado');
select throws_ok($$ select tests.link('n13', jsonb_build_object('tags', repeat('x',31))) $$, '23514', null,
  '[regras] nv: tag acima de 30 caracteres é recusada');
select throws_ok($$ select tests.link('n14', jsonb_build_object('descricao', repeat('x',1001))) $$, '23514', null,
  '[regras] nv: descrição acima de 1000 caracteres é recusada');
select throws_ok($$ insert into public.nuvem_links (telefone) values ('Contrato') $$, '42703', null,
  '[regras] nv: campo extra (telefone) é recusado');
select throws_ok($$ select tests.link('n16', '{"dono":"","visibilidade":"rede"}') $$, '42501', null,
  '[regras] nv: unidade não publica para a rede');
select throws_ok($$ select tests.link('n17', '{"dono":"v"}') $$, '42501', null,
  '[regras] nv: unidade não grava na área de outra');
select throws_ok($$ select tests.link('n18', '{"visibilidade":"unidades","unidades":["v"]}') $$, '23514', null,
  '[regras] nv: unidade não compartilha com outras unidades');
reset role;
select tests.entrar('rede');
select throws_ok($$ select tests.link('n19') $$, '42501', null,
  '[regras] nv: franqueadora não grava na área privada da unidade');
select throws_ok($$ select tests.link('n20', '{"dono":"","visibilidade":"unidades"}') $$, '23514', null,
  '[regras] nv: "unidades escolhidas" sem unidade é recusado');
select throws_ok($$ select tests.link('n21', '{"dono":"","visibilidade":"rede","unidades":["u"]}') $$, '23514', null,
  '[regras] nv: rede toda com lista de unidades é recusado');
reset role;
select tests.entrar('fr');
select throws_ok($$ select tests.link('n22', jsonb_build_object('criado_por', tests.id('eq'))) $$, '42501', null,
  '[regras] nv: autor forjado é recusado');
select throws_ok($$ select tests.link('n23', '{"criado_por_nome":"Outra Pessoa"}') $$, '42501', null,
  '[regras] nv: nome do autor forjado é recusado');
select throws_ok($$ select tests.link('n24', '{"criado_em":"2000-01-01T00:00:00Z"}') $$, '42501', null,
  '[regras] nv: data de criação forjada é recusada');
reset role;
select tests.entrar('sem');
select throws_ok($$ select tests.link('n25') $$, '42501', null,
  '[regras] nv: equipe sem o módulo não grava');
reset role;
select tests.entrar('redeSem');
select throws_ok($$ select tests.link('n26', '{"dono":"","visibilidade":"rede"}') $$, '42501', null,
  '[regras] nv: franqueadora sem nuvem-rede não grava');
reset role;
select tests.anonimo();
select throws_ok($$ insert into public.nuvem_links (titulo) values ('Contrato') $$, '42501', null,
  '[regras] nv: anônimo não grava');
reset role;
select tests.entrar('fr');
select is(tests.linhas($$ update public.nuvem_links set titulo = 'Contrato 2027', tags = 'contrato' where id = 'n1' $$), 1,
  '[regras] nv: colega da unidade edita link da área');
select throws_ok($$ update public.nuvem_links set criado_por = tests.id('fr') where id = 'n1' $$, '42501', null,
  '[regras] nv: autor original não muda');
select throws_ok($$ update public.nuvem_links set dono = 'v' where id = 'n1' $$, '42501', null,
  '[regras] nv: link não muda de dono');
select throws_ok($$ update public.nuvem_links set visibilidade = 'rede' where id = 'n1' $$, '23514', null,
  '[regras] nv: link privado não vira da rede');
reset role;
select tests.entrar('outra');
select is(tests.linhas($$ update public.nuvem_links set titulo = 'Invadido' where id = 'n1' $$), 0,
  '[regras] nv: outra unidade não edita');
reset role;
select tests.entrar('rede');
select is(tests.linhas($$ update public.nuvem_links set visibilidade = 'unidades', unidades = array['u'] where id = 'n2' $$), 1,
  '[regras] nv: franqueadora restringe link a unidades');
reset role;
select tests.entrar('fr');
select is(tests.linhas($$ update public.nuvem_links set titulo = 'Mudado' where id = 'nv-rede' $$), 0,
  '[regras] nv: unidade não edita link da franqueadora');
select throws_ok($$ update public.nuvem_links set atualizado_em = '2000-01-01' where id = 'n1' $$, '42501', null,
  '[regras] nv: edição sem carimbo do servidor é recusada');
reset role;
select tests.entrar('outra');
select is(tests.linhas($$ delete from public.nuvem_links where id = 'n1' $$), 0,
  '[regras] nv: outra unidade não apaga');
reset role;
select tests.entrar('rede');
select is(tests.linhas($$ delete from public.nuvem_links where id = 'n1' $$), 0,
  '[regras] nv: franqueadora não apaga link da unidade');
reset role;
select tests.entrar('fr');
select is(tests.linhas($$ delete from public.nuvem_links where id = 'nv-rede' $$), 0,
  '[regras] nv: unidade não apaga link da franqueadora');
reset role;
select tests.entrar('eq');
select is(tests.linhas($$ delete from public.nuvem_links where id = 'n1' $$), 1,
  '[regras] nv: unidade remove link da própria área');
reset role;
select tests.entrar('rede');
select is(tests.linhas($$ delete from public.nuvem_links where id = 'n4' $$), 1,
  '[regras] nv: franqueadora remove link dela');
reset role;
select tests.entrar('admin');
select is(tests.linhas($$ update public.nuvem_links set titulo = 'Invadido' where id = 'nv-priv' $$), 0,
  'Admin não edita link privado da unidade');
select is(tests.linhas($$ delete from public.nuvem_links where id = 'nv-priv' $$), 0,
  'Admin não apaga link privado da unidade');
reset role;
select tests.entrar('rede');
select is(tests.linhas($$ update public.nuvem_links set titulo = 'Invadido' where id = 'nv-priv' $$), 0,
  'Franqueadora não edita link privado da unidade');
select is(tests.linhas($$ delete from public.nuvem_links where id = 'nv-priv' $$), 0,
  'Franqueadora não apaga link privado da unidade');
reset role;
select tests.entrar('inativo');
select is((select array(select id from public.nuvem_links where id = 'nv-priv' order by id)), '{}'::text[],
  'Conta inativa não lê link privado');
select is(tests.linhas($$ update public.nuvem_links set titulo = 'Invadido' where id = 'nv-priv' $$), 0,
  'Conta inativa não edita link privado');
select is(tests.linhas($$ delete from public.nuvem_links where id = 'nv-priv' $$), 0,
  'Conta inativa não apaga link privado');
reset role;
select tests.entrar('unOff');
select is((select array(select id from public.nuvem_links where id = 'nv-off' order by id)), '{}'::text[],
  'Unidade inativa não lê link privado');
select is(tests.linhas($$ update public.nuvem_links set titulo = 'Invadido' where id = 'nv-off' $$), 0,
  'Unidade inativa não edita link privado');
select is(tests.linhas($$ delete from public.nuvem_links where id = 'nv-off' $$), 0,
  'Unidade inativa não apaga link privado');
reset role;
select tests.entrar('sem');
select is((select array(select id from public.nuvem_links where id = 'nv-priv' order by id)), '{}'::text[],
  'Equipe sem módulo não lê link privado');
select is(tests.linhas($$ update public.nuvem_links set titulo = 'Invadido' where id = 'nv-priv' $$), 0,
  'Equipe sem módulo não edita link privado');
select is(tests.linhas($$ delete from public.nuvem_links where id = 'nv-priv' $$), 0,
  'Equipe sem módulo não apaga link privado');
reset role;
select tests.entrar('fr');
select is((select criado_por_nome from public.nuvem_links where id = 'n6'), 'Dono Nuvem',
  'O servidor registra o nome do perfil');
select ok((select criado_por = auth.uid() and atualizado_por = auth.uid() and criado_em = now() and atualizado_em = now() from public.nuvem_links where id = 'n6'),
  'O servidor registra o autor e as duas datas');
reset role;
select * from finish();
rollback;
