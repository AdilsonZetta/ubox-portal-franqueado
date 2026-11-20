begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@ubox.test'),
  ('00000000-0000-0000-0000-000000000002', 'equipe@ubox.test'),
  ('00000000-0000-0000-0000-000000000003', 'franqueado@ubox.test');
insert into public.usuarios (id, email, nome, papel, ativo)
select id, email, 'Pessoa Teste',
  (case split_part(email, '@', 1) when 'equipe' then 'equipe_franqueadora' else split_part(email, '@', 1) end)::public.papel,
  true
from auth.users where email in ('admin@ubox.test', 'equipe@ubox.test', 'franqueado@ubox.test');

select plan(11);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$insert into public.pacote_chaves (chave_id, tipo, chave, alvo_id, atualizado_por)
  values ('documento_manual', 'documento', 'manual', 'antigo', auth.uid())$$, 'Admin cria vínculo');
select lives_ok($$update public.pacote_chaves set alvo_id = 'novo'$$, 'Admin atualiza vínculo');
select is((select alvo_id from public.pacote_chaves), 'novo', 'Admin lê o novo destino');
select throws_ok($$update public.pacote_chaves set atualizado_por = '00000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'Autor diferente do usuário é recusado');
select throws_ok($$update public.pacote_chaves set tipo = 'invalido'$$, '23514', null, 'Tipo inválido é recusado');
select throws_ok($$delete from public.pacote_chaves$$, '42501', null, 'Admin não exclui vínculo');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.pacote_chaves), 0, 'Equipe da franqueadora não lê vínculos');
select throws_ok($$insert into public.pacote_chaves (chave_id, tipo, chave, alvo_id, atualizado_por)
  values ('documento_outro', 'documento', 'outro', 'alvo', auth.uid())$$, '42501', null, 'Equipe da franqueadora não cria vínculo');
with alterados as (update public.pacote_chaves set alvo_id = 'indevido' returning alvo_id)
select is(count(*)::int, 0, 'Equipe da franqueadora não altera vínculos') from alterados;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.pacote_chaves), 0, 'Franqueado não lê vínculos');
select throws_ok($$insert into public.pacote_chaves (chave_id, tipo, chave, alvo_id, atualizado_por)
  values ('documento_outro', 'documento', 'outro', 'alvo', auth.uid())$$, '42501', null, 'Franqueado não cria vínculo');

select * from finish();
rollback;
