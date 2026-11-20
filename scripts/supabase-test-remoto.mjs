// Gera uma versão de um *.test.sql para rodar no projeto Supabase real via SQL (MCP execute_sql / psql).
// Cada asserção vai para tests.saida e, no fim, um RAISE devolve o TAP e desfaz tudo (nada fica no banco).
// Uso: node scripts/supabase-test-remoto.mjs supabase/tests/fase1_fundacao.test.sql > /tmp/remoto.sql
// Feito por Grok Bot no Cursor (Antigravity sem cota).
import { readFileSync } from 'node:fs'
const arquivo = process.argv[2]
let sql = readFileSync(arquivo, 'utf8')
sql = sql.replace(/^begin;\n/m, `begin;
create extension if not exists pgtap with schema extensions;
`)
// Arquivos sem o schema tests (que não trocam de pessoa) ganham um só para a saída.
if (!/^create schema tests;$/m.test(sql)) {
  sql = sql.replace(/^begin;\n/m, `begin;
create schema tests;
grant usage on schema tests to anon, authenticated;
`)
}
// O plan() pode vir antes do create schema tests; ele passa para depois da tabela de saída.
const plano = sql.match(/^select plan\(\d+\);\n/m)
if (plano) sql = sql.replace(plano[0], '')
sql = sql.replace(/^create schema tests;\n/m, `create schema tests;
create table tests.saida (n serial primary key, linha text);
${plano ? plano[0] : ''}`)
sql = sql.replace(/^grant usage on schema tests to anon, authenticated;\n/m, `grant usage on schema tests to anon, authenticated;
grant usage on schema tests to service_role;
grant insert on tests.saida to anon, authenticated, service_role;
grant usage on sequence tests.saida_n_seq to anon, authenticated, service_role;
`)
const ASSERT = /^select (plan|ok|is|isnt|throws_ok|lives_ok|results_eq|\* from finish)\(/
sql = sql.split('\n').map((l) => (ASSERT.test(l) ? `insert into tests.saida (linha) ${l}` : l)).join('\n')
sql = sql.replace(/^rollback;\s*$/m, () => `reset role;
do $$ begin raise exception 'TAP%', E'\\n' || (select string_agg(linha, E'\\n' order by n) from tests.saida); end $$;`)
process.stdout.write(sql)
