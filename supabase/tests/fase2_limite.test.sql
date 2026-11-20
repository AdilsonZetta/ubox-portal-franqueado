-- Testes de permissões e do limite por usuário na criação de contas.
begin;

select plan(12);

select ok(not has_function_privilege('anon', 'public.registrar_criacao_conta(uuid, integer, interval)', 'EXECUTE'), 'anônimo não executa a função');
select ok(not has_function_privilege('authenticated', 'public.registrar_criacao_conta(uuid, integer, interval)', 'EXECUTE'), 'usuário autenticado não executa a função');
select ok(not has_table_privilege('anon', 'public.criar_conta_tentativas', 'SELECT'), 'anônimo não lê tentativas');
select ok(not has_table_privilege('anon', 'public.criar_conta_tentativas', 'INSERT'), 'anônimo não insere tentativas');
select ok(not has_table_privilege('authenticated', 'public.criar_conta_tentativas', 'SELECT'), 'usuário autenticado não lê tentativas');
select ok(not has_table_privilege('authenticated', 'public.criar_conta_tentativas', 'INSERT'), 'usuário autenticado não insere tentativas');

insert into public.criar_conta_tentativas (uid, criado_em)
values ('00000000-0000-0000-0000-000000000003', now() - interval '11 minutes');

set local role service_role;
select is(public.registrar_criacao_conta('00000000-0000-0000-0000-000000000001', p_limite => 3), true, 'primeira tentativa permitida');
select is(public.registrar_criacao_conta('00000000-0000-0000-0000-000000000001', p_limite => 3), true, 'segunda tentativa permitida');
select is(public.registrar_criacao_conta('00000000-0000-0000-0000-000000000001', p_limite => 3), true, 'terceira tentativa permitida');
select is(public.registrar_criacao_conta('00000000-0000-0000-0000-000000000001', p_limite => 3), false, 'quarta tentativa bloqueada');
select is(public.registrar_criacao_conta('00000000-0000-0000-0000-000000000002', p_limite => 3), true, 'outro usuário tem limite próprio');
select is(public.registrar_criacao_conta('00000000-0000-0000-0000-000000000003', p_limite => 1), true, 'tentativa fora da janela não conta');
reset role;

select * from finish();
rollback;
