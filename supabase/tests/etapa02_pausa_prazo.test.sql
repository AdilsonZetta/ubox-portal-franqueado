begin;

select plan(8);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000001', 'fila@ubox.test');

insert into public.usuarios (id, email, nome, papel, ativo, modulos_liberados)
values ('00000000-0000-0000-0000-000000000001', 'fila@ubox.test', 'Fila Rede',
  'equipe_franqueadora', true, '{chamados}');

insert into public.unidades (id, nome, responsavel, email, ativo)
values ('un-prazo', 'Unidade Centro', 'Pessoa Responsável', 'centro@ubox.test', true);

insert into public.chamados (id, titulo, categoria, prioridade, descricao, unidade_id, unidade_nome,
  aberto_por, aberto_por_nome, sla_horas, status, pausado_em, pausa_acumulada_seg)
values ('ch-prazo', 'Porta emperrada', 'operacao', 'alta', 'A porta não fecha.', 'un-prazo', 'Unidade Centro',
  '00000000-0000-0000-0000-000000000001', 'Fila Rede', 24, 'aguardando_franqueado',
  now() - interval '1 day', 600);

select ok((select pausado_em = now() and pausa_acumulada_seg = 0 from public.chamados where id = 'ch-prazo'),
  'inserção em espera inicia a pausa com valores do servidor');

-- now() é fixo nesta transação. Retrocede o início da pausa na fixture para testar o acúmulo.
alter table public.chamados disable trigger chamado_pausa_prazo;
update public.chamados set pausado_em = now() - interval '2 hours' where id = 'ch-prazo';
alter table public.chamados enable trigger chamado_pausa_prazo;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","email":"fila@ubox.test"}', true);
set local role authenticated;

select throws_ok($$update public.chamados set pausa_acumulada_seg = 600 where id = 'ch-prazo'$$,
  '42501', 'Os dados de abertura do chamado são imutáveis.', 'cliente não altera o tempo acumulado');
select throws_ok($$update public.chamados set pausado_em = null where id = 'ch-prazo'$$,
  '42501', 'Os dados de abertura do chamado são imutáveis.', 'cliente não altera o início da pausa');

update public.chamados set status = 'em_andamento' where id = 'ch-prazo';
select ok((select pausado_em is null and pausa_acumulada_seg = 7200 from public.chamados where id = 'ch-prazo'),
  'saída da espera acumula os segundos da pausa');

update public.chamados set status = 'aguardando_franqueado' where id = 'ch-prazo';
select ok((select pausado_em = now() and pausa_acumulada_seg = 7200 from public.chamados where id = 'ch-prazo'),
  'nova espera inicia outra pausa e mantém o acumulado');

update public.chamados set status = 'aguardando_franqueado' where id = 'ch-prazo';
select ok((select pausado_em = now() and pausa_acumulada_seg = 7200 from public.chamados where id = 'ch-prazo'),
  'manter o status preserva a pausa');

update public.chamados set status = 'resolvido', resolvido_em = now() where id = 'ch-prazo';
reset role;
update public.chamados set status = 'fechado', fechado_em = now(), avaliacao = 5 where id = 'ch-prazo';

set local role authenticated;
update public.chamados set status = 'aguardando_franqueado', avaliacao = null, fechado_em = null, resolvido_em = null
where id = 'ch-prazo';
select ok((select reaberto_em = now() and pausado_em = now() and pausa_acumulada_seg = 0
  from public.chamados where id = 'ch-prazo'), 'reabertura em espera zera o acumulado e inicia a pausa');

reset role;
update public.chamados set status = 'aberto', reaberto_em = now() + interval '1 second' where id = 'ch-prazo';
select ok((select pausado_em is null and pausa_acumulada_seg = 0 from public.chamados where id = 'ch-prazo'),
  'reabertura fora da espera limpa a pausa também em operação administrativa');

select * from finish();
rollback;
