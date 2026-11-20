-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
begin;

create schema tests;
create function tests.entrar(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-' || lpad(n::text, 12, '0'),
    'role', 'authenticated'
  )::text, true);
  execute 'set local role authenticated';
end $$;

create function tests.linhas(cmd text) returns integer language plpgsql as $$
declare n integer;
begin
  execute cmd;
  get diagnostics n = row_count;
  return n;
end $$;
grant usage on schema tests to authenticated;

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, n || '@ubox.test'
from generate_series(1, 6) as n;

insert into public.usuarios (id, email, nome, papel, ativo, modulos_liberados)
select id, email, 'Pessoa Teste', v.papel::public.papel, v.ativo, v.modulos
from (values
  (1, 'equipe_franqueadora', true, '{manuais}'::text[]),
  (2, 'equipe_franqueadora', true, '{}'),
  (3, 'equipe_franqueadora', false, '{manuais}'),
  (4, 'franqueado', true, '{manuais}'),
  (5, 'equipe_franqueado', true, '{manuais}'),
  (6, 'admin', true, '{}')
) as v(n, papel, ativo, modulos)
join auth.users on email = n || '@ubox.test';

insert into public.documentos (id, titulo, categoria_id, status)
values ('publicado', 'Manual publicado', 'operacao', 'publicado');

select plan(73);

select tests.entrar(1);
select lives_ok($$insert into public.categorias (id, nome, publico) values ('gestao-cat', 'Categoria de teste', false)$$, 'Gestor cria gestao-cat');
select is(tests.linhas($$update public.categorias set nome = 'Categoria revisada' where id = 'gestao-cat'$$), 1, 'Gestor edita gestao-cat');
select is((select count(*)::int from public.categorias where id = 'gestao-cat'), 1, 'Gestor lê gestao-cat');
select throws_ok($$update public.categorias set nome = '' where id = 'gestao-cat'$$, '23514', null, 'Dados inválidos são recusados em gestao-cat');
select is(tests.linhas($$delete from public.categorias where id = 'gestao-cat'$$), 0, 'Gestor não exclui gestao-cat');
select lives_ok($$insert into public.documentos (id, titulo, categoria_id, atualizado_por) values ('gestao-richtext', 'POP de teste', 'gestao-cat', auth.uid())$$, 'Gestor cria gestao-richtext');
select is(tests.linhas($$update public.documentos set titulo = 'POP revisado', atualizado_por = auth.uid() where id = 'gestao-richtext'$$), 1, 'Gestor edita gestao-richtext');
select is((select count(*)::int from public.documentos where id = 'gestao-richtext'), 1, 'Gestor lê gestao-richtext');
select throws_ok($$update public.documentos set atualizado_por = null where id = 'gestao-richtext'$$, '42501', null, 'Dados inválidos são recusados em gestao-richtext');
select is(tests.linhas($$delete from public.documentos where id = 'gestao-richtext'$$), 0, 'Gestor não exclui gestao-richtext');
select lives_ok($$insert into public.documentos (id, titulo, categoria_id, tipo, formato, html_conteudo, atualizado_por) values ('gestao-html', 'Interativo de teste', 'gestao-cat', 'html', 'html', '<main>Teste</main>', auth.uid())$$, 'Gestor cria gestao-html');
select is(tests.linhas($$update public.documentos set html_conteudo = '<main>Revisado</main>', atualizado_por = auth.uid() where id = 'gestao-html'$$), 1, 'Gestor edita gestao-html');
select is((select count(*)::int from public.documentos where id = 'gestao-html'), 1, 'Gestor lê gestao-html');
select throws_ok($$update public.documentos set html_url = 'javascript:teste', atualizado_por = auth.uid() where id = 'gestao-html'$$, '23514', null, 'Dados inválidos são recusados em gestao-html');
select is(tests.linhas($$delete from public.documentos where id = 'gestao-html'$$), 0, 'Gestor não exclui gestao-html');
select lives_ok($$insert into public.documento_versoes (documento_id, versao_id, titulo, autor_id) values ('publicado', '1', 'Versão de teste', auth.uid())$$, 'Gestor cria documento_versoes');
select throws_ok($$update public.documento_versoes set titulo = 'Versão revisada', autor_id = auth.uid() where documento_id = 'publicado' and versao_id = '1'$$, '42501', null, 'Gestor não edita documento_versoes');
select is((select count(*)::int from public.documento_versoes where documento_id = 'publicado' and versao_id = '1'), 1, 'Gestor lê documento_versoes');
select throws_ok($$update public.documento_versoes set autor_id = null where documento_id = 'publicado' and versao_id = '1'$$, '42501', null, 'Gestor não altera o autor da versão');
select throws_ok($$delete from public.documento_versoes where documento_id = 'publicado' and versao_id = '1'$$, '42501', null, 'Gestor não exclui versão');
select lives_ok($$insert into public.avisos (id, titulo, tipo, documento_id) values ('gestao-aviso', 'Aviso de teste', 'novo', 'publicado')$$, 'Gestor cria gestao-aviso');
select throws_ok($$update public.avisos set mensagem = 'Aviso revisado' where id = 'gestao-aviso'$$, '42501', null, 'Gestor não edita gestao-aviso');
select is((select count(*)::int from public.avisos where id = 'gestao-aviso'), 1, 'Gestor lê gestao-aviso');
select throws_ok($$update public.avisos set titulo = '' where id = 'gestao-aviso'$$, '42501', null, 'Gestor não altera o título do aviso');
select is(tests.linhas($$delete from public.avisos where id = 'gestao-aviso'$$), 0, 'Gestor não exclui gestao-aviso');
select throws_ok($$insert into public.avisos (titulo, tipo) values ('Aviso da rede', 'geral')$$, '42501', null, 'Gestor não cria aviso geral');

select throws_ok($$insert into public.avisos (titulo, tipo, documento_id)
  values ('Aviso de rascunho', 'novo', 'gestao-html')$$, '42501', null, 'Gestor só anuncia publicação');
select throws_ok($$update public.documento_versoes set versao = 2 where documento_id = 'publicado'$$,
  '42501', null, 'Número da versão permanece fixo');
select throws_ok($$update public.avisos set tipo = 'geral' where id = 'gestao-aviso'$$,
  '42501', null, 'Um aviso de documento não vira aviso geral');

select tests.entrar(2);
select throws_ok($$insert into public.categorias (id, nome, publico) values ('novo-gestao-cat', 'Categoria de teste', false)$$, '42501', null, 'Equipe sem módulo não cria gestao-cat');
select is(tests.linhas($$update public.categorias set nome = 'Categoria revisada' where id = 'gestao-cat'$$), 0, 'Equipe sem módulo não edita gestao-cat');
select throws_ok($$insert into public.documentos (id, titulo, categoria_id, atualizado_por) values ('novo-gestao-richtext', 'POP de teste', 'gestao-cat', auth.uid())$$, '42501', null, 'Equipe sem módulo não cria gestao-richtext');
select is(tests.linhas($$update public.documentos set titulo = 'POP revisado', atualizado_por = auth.uid() where id = 'gestao-richtext'$$), 0, 'Equipe sem módulo não edita gestao-richtext');
select throws_ok($$insert into public.documentos (id, titulo, categoria_id, tipo, formato, html_conteudo, atualizado_por) values ('novo-gestao-html', 'Interativo de teste', 'gestao-cat', 'html', 'html', '<main>Teste</main>', auth.uid())$$, '42501', null, 'Equipe sem módulo não cria gestao-html');
select is(tests.linhas($$update public.documentos set html_conteudo = '<main>Revisado</main>', atualizado_por = auth.uid() where id = 'gestao-html'$$), 0, 'Equipe sem módulo não edita gestao-html');
select throws_ok($$insert into public.documento_versoes (documento_id, versao_id, titulo, autor_id) values ('publicado', '2', 'Versão de teste', auth.uid())$$, '42501', null, 'Equipe sem módulo não cria documento_versoes');
select throws_ok($$update public.documento_versoes set titulo = 'Versão revisada', autor_id = auth.uid() where documento_id = 'publicado' and versao_id = '1'$$, '42501', null, 'Equipe sem módulo não edita documento_versoes');
select throws_ok($$insert into public.avisos (id, titulo, tipo, documento_id) values ('novo-gestao-aviso', 'Aviso de teste', 'novo', 'publicado')$$, '42501', null, 'Equipe sem módulo não cria gestao-aviso');
select throws_ok($$update public.avisos set mensagem = 'Aviso revisado' where id = 'gestao-aviso'$$, '42501', null, 'Equipe sem módulo não edita gestao-aviso');

select tests.entrar(3);
select throws_ok($$insert into public.categorias (id, nome, publico) values ('novo-gestao-cat', 'Categoria de teste', false)$$, '42501', null, 'Equipe inativa não cria gestao-cat');
select is(tests.linhas($$update public.categorias set nome = 'Categoria revisada' where id = 'gestao-cat'$$), 0, 'Equipe inativa não edita gestao-cat');
select throws_ok($$insert into public.documentos (id, titulo, categoria_id, atualizado_por) values ('novo-gestao-richtext', 'POP de teste', 'gestao-cat', auth.uid())$$, '42501', null, 'Equipe inativa não cria gestao-richtext');
select is(tests.linhas($$update public.documentos set titulo = 'POP revisado', atualizado_por = auth.uid() where id = 'gestao-richtext'$$), 0, 'Equipe inativa não edita gestao-richtext');
select throws_ok($$insert into public.documentos (id, titulo, categoria_id, tipo, formato, html_conteudo, atualizado_por) values ('novo-gestao-html', 'Interativo de teste', 'gestao-cat', 'html', 'html', '<main>Teste</main>', auth.uid())$$, '42501', null, 'Equipe inativa não cria gestao-html');
select is(tests.linhas($$update public.documentos set html_conteudo = '<main>Revisado</main>', atualizado_por = auth.uid() where id = 'gestao-html'$$), 0, 'Equipe inativa não edita gestao-html');
select throws_ok($$insert into public.documento_versoes (documento_id, versao_id, titulo, autor_id) values ('publicado', '2', 'Versão de teste', auth.uid())$$, '42501', null, 'Equipe inativa não cria documento_versoes');
select throws_ok($$update public.documento_versoes set titulo = 'Versão revisada', autor_id = auth.uid() where documento_id = 'publicado' and versao_id = '1'$$, '42501', null, 'Equipe inativa não edita documento_versoes');
select throws_ok($$insert into public.avisos (id, titulo, tipo, documento_id) values ('novo-gestao-aviso', 'Aviso de teste', 'novo', 'publicado')$$, '42501', null, 'Equipe inativa não cria gestao-aviso');
select throws_ok($$update public.avisos set mensagem = 'Aviso revisado' where id = 'gestao-aviso'$$, '42501', null, 'Equipe inativa não edita gestao-aviso');

select tests.entrar(4);
select throws_ok($$insert into public.categorias (id, nome, publico) values ('novo-gestao-cat', 'Categoria de teste', false)$$, '42501', null, 'Franqueado não cria gestao-cat');
select is(tests.linhas($$update public.categorias set nome = 'Categoria revisada' where id = 'gestao-cat'$$), 0, 'Franqueado não edita gestao-cat');
select throws_ok($$insert into public.documentos (id, titulo, categoria_id, atualizado_por) values ('novo-gestao-richtext', 'POP de teste', 'gestao-cat', auth.uid())$$, '42501', null, 'Franqueado não cria gestao-richtext');
select is(tests.linhas($$update public.documentos set titulo = 'POP revisado', atualizado_por = auth.uid() where id = 'gestao-richtext'$$), 0, 'Franqueado não edita gestao-richtext');
select throws_ok($$insert into public.documentos (id, titulo, categoria_id, tipo, formato, html_conteudo, atualizado_por) values ('novo-gestao-html', 'Interativo de teste', 'gestao-cat', 'html', 'html', '<main>Teste</main>', auth.uid())$$, '42501', null, 'Franqueado não cria gestao-html');
select is(tests.linhas($$update public.documentos set html_conteudo = '<main>Revisado</main>', atualizado_por = auth.uid() where id = 'gestao-html'$$), 0, 'Franqueado não edita gestao-html');
select throws_ok($$insert into public.documento_versoes (documento_id, versao_id, titulo, autor_id) values ('publicado', '2', 'Versão de teste', auth.uid())$$, '42501', null, 'Franqueado não cria documento_versoes');
select throws_ok($$update public.documento_versoes set titulo = 'Versão revisada', autor_id = auth.uid() where documento_id = 'publicado' and versao_id = '1'$$, '42501', null, 'Franqueado não edita documento_versoes');
select throws_ok($$insert into public.avisos (id, titulo, tipo, documento_id) values ('novo-gestao-aviso', 'Aviso de teste', 'novo', 'publicado')$$, '42501', null, 'Franqueado não cria gestao-aviso');
select throws_ok($$update public.avisos set mensagem = 'Aviso revisado' where id = 'gestao-aviso'$$, '42501', null, 'Franqueado não edita gestao-aviso');

select tests.entrar(5);
select throws_ok($$insert into public.categorias (id, nome, publico) values ('novo-gestao-cat', 'Categoria de teste', false)$$, '42501', null, 'Equipe da unidade não cria gestao-cat');
select is(tests.linhas($$update public.categorias set nome = 'Categoria revisada' where id = 'gestao-cat'$$), 0, 'Equipe da unidade não edita gestao-cat');
select throws_ok($$insert into public.documentos (id, titulo, categoria_id, atualizado_por) values ('novo-gestao-richtext', 'POP de teste', 'gestao-cat', auth.uid())$$, '42501', null, 'Equipe da unidade não cria gestao-richtext');
select is(tests.linhas($$update public.documentos set titulo = 'POP revisado', atualizado_por = auth.uid() where id = 'gestao-richtext'$$), 0, 'Equipe da unidade não edita gestao-richtext');
select throws_ok($$insert into public.documentos (id, titulo, categoria_id, tipo, formato, html_conteudo, atualizado_por) values ('novo-gestao-html', 'Interativo de teste', 'gestao-cat', 'html', 'html', '<main>Teste</main>', auth.uid())$$, '42501', null, 'Equipe da unidade não cria gestao-html');
select is(tests.linhas($$update public.documentos set html_conteudo = '<main>Revisado</main>', atualizado_por = auth.uid() where id = 'gestao-html'$$), 0, 'Equipe da unidade não edita gestao-html');
select throws_ok($$insert into public.documento_versoes (documento_id, versao_id, titulo, autor_id) values ('publicado', '2', 'Versão de teste', auth.uid())$$, '42501', null, 'Equipe da unidade não cria documento_versoes');
select throws_ok($$update public.documento_versoes set titulo = 'Versão revisada', autor_id = auth.uid() where documento_id = 'publicado' and versao_id = '1'$$, '42501', null, 'Equipe da unidade não edita documento_versoes');
select throws_ok($$insert into public.avisos (id, titulo, tipo, documento_id) values ('novo-gestao-aviso', 'Aviso de teste', 'novo', 'publicado')$$, '42501', null, 'Equipe da unidade não cria gestao-aviso');
select throws_ok($$update public.avisos set mensagem = 'Aviso revisado' where id = 'gestao-aviso'$$, '42501', null, 'Equipe da unidade não edita gestao-aviso');

select tests.entrar(6);
select throws_ok($$update public.documento_versoes set titulo = 'Versão revisada', autor_id = auth.uid() where documento_id = 'publicado' and versao_id = '1'$$, '42501', null, 'Admin não edita versão');
select throws_ok($$update public.avisos set mensagem = 'Aviso revisado' where id = 'gestao-aviso'$$, '42501', null, 'Admin não edita aviso');
select throws_ok($$delete from public.documento_versoes where documento_id = 'publicado' and versao_id = '1'$$, '42501', null, 'Admin não exclui versão');
select is(tests.linhas($$delete from public.avisos where id = 'gestao-aviso'$$), 1, 'Admin exclui aviso');

select * from finish();
rollback;
