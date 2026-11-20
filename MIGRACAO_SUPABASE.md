# Migração do Portal Ubox: Firebase → Supabase

> Plano da migração (fase 0) e registro da fundação (fase 1).
> Feito por Grok Bot no Cursor (Antigravity sem cota).

**Destino:** projeto Supabase `zmreflstgxgofvuhzqau` (sa-east-1, org "Dream Park - Desenvolvimento"), **plano Free**: sem upgrade e sem add-ons pagos.
**Produção continua no Firebase** até o corte (fase 15). Cada fase tem o seu PR.

## 1. Regras gerais

- **Chaves:** no app e no repositório entram só a URL e a chave **publicável** (`sb_publishable_…`). A `service_role`/`sb_secret_…` nunca entra no frontend nem no git. `src/supabaseConfig.ts` recusa uma chave secreta.
- **Privacidade igual à de hoje.** O que a franqueadora e o admin não leem no Firestore continua bloqueado no RLS:
  - os dados pessoais das unidades (PII);
  - a folha de respostas;
  - `crmContatos`, `crmAtividades` e `clientes`;
  - a área privada da Nuvem;
  - o segredo das senhas, conforme a permissão de cada um.

  Cada uma dessas regras ganha um teste pgTAP que prova a negação para o admin.
- **Nada muda no Firebase durante a migração.** As regras, os índices e os dados ficam como estão.
- **Pastas:**
  - `supabase/migrations/`: os SQL aplicados. O nome do arquivo usa a mesma versão registrada no projeto.
  - `supabase/tests/`: os testes pgTAP.
  - `scripts/supabase-test*.mjs`: os runners.

## 2. Modelo: Firestore → Postgres

**Convenções**

- Uma coleção vira uma tabela em `public` com nome em snake_case: `crmLeads` vira `crm_leads`.
- As colunas também vão para snake_case, e cada tabela fica com RLS ligado.
- **IDs:**
  - `usuarios.id` é o `uuid` do `auth.users`, e o uid antigo fica em `usuarios.firebase_uid`.
  - Nas outras tabelas, `id text` guarda o id do documento do Firestore, para não quebrar referências, links nem tokens.
  - Registros novos ganham `gen_random_uuid()::text`.
- **Referências a usuários** (`uid`, `criadoPor`, `atualizadoPor`…) viram `uuid references usuarios(id)`. O loader traduz o uid antigo por meio de `firebase_uid`.
- **Datas:** `Timestamp` vira `timestamptz`. O `request.time` vira `now()`, gravado por trigger: o servidor carimba a data em vez de só validá-la.
- **Listas:**
  - Listas pequenas de slugs/ids (`modulosLiberados`, `unidades`, `papeis`, `tags`) viram `text[]` com `check` de tamanho.
  - Listas de pessoas usadas para filtrar (`uids`, `uidsExtra`) viram tabelas de junção com índice.
- **Subcoleções** viram tabelas filhas com FK `on delete cascade`.
- **Escrita em lote:** o `getAfter`/`existsAfter` vira uma função RPC `security definer` que grava tudo numa transação (é o caso de `crm_leads` com `crm_contatos`, `clientes` com `cliente_paineis` e `acessos` com o segredo).
- **Mudança de campos:** o `diff().affectedKeys()` vira trigger `BEFORE UPDATE` (exemplo: `app.usuarios_antes_update`).

| Firestore | Postgres | Observação |
|---|---|---|
| `usuarios` | `usuarios` | **fase 1** |
| `unidades` | `unidades` | **fase 1** |
| `config/adminCriado` | `admin_lock` | **fase 1**: trava do 1º admin |
| `categorias`, `documentos` (+`versoes`) | `categorias`, `documentos`, `documento_versoes`, `publico_uids` (junção) | `conteudo_texto` com índice `tsvector` para a busca |
| `trilhas`, `quizzes` (+`gabarito`), `gabarito` | `trilhas`, `quizzes`, `quiz_gabaritos` | o gabarito fica legível só para quem gere |
| `avisos`, `avisosLeituras` | `avisos`, `aviso_leituras` | |
| `leituras`, `aceites`, `tentativas`, `certificados` | tabelas iguais | só inserção, sem update/delete |
| `manuaisTrilha`, `progressoManuais`, `reestudos` | `manuais_trilha`, `progresso_manuais`, `reestudos` | |
| `cursos`, `provas`, `provasGabarito`, `tentativasProva` (+`folha`) | `cursos`, `provas`, `provas_gabarito`, `tentativas_prova`, `tentativas_prova_folha` | a folha **não** é legível pelo franqueado |
| `chamados` (+`eventos`) | `chamados`, `chamado_eventos` | |
| `acessos` (+`segredo`, `eventos`), `solicitacoesAcesso` | `acessos`, `acesso_segredos`, `acesso_eventos`, `solicitacoes_acesso` | segredo numa tabela separada, lido por RPC que grava o evento "revelou" |
| `marketingMateriais`, `marketingCampanhas`, `marketingSolicitacoes` | `marketing_*` | |
| `checklistModelos`, `checklistExecucoes` | `checklist_modelos`, `checklist_execucoes` | itens em `jsonb` validado |
| `auditoriaModelos`, `auditorias`, `auditoriaAcoes` | `auditoria_*` | |
| `acompanhamentoRegistros`, `acompanhamentoPassos` | `acompanhamento_*` | |
| `estoqueItens`, `estoqueMovimentos`, `estoqueContagens`, `estoquePedidos` | `estoque_*` | o saldo é atualizado na mesma transação (RPC) |
| `crmConfig`, `crmLeads`, `crmContatos`, `crmAtividades`, `crmPropostas` | `crm_*` | **contatos e atividades: só a unidade** |
| `clientes`, `clientePaineis` (+`cobrancas`, `visitas`, `recados`) | `clientes`, `cliente_paineis`, `painel_*` | **clientes: só a unidade**. O painel público usa RPC `painel_por_token(token)`, sem `select` anônimo na tabela, para não permitir listagem |
| `nuvemLinks` | `nuvem_links` | `dono = ''` vira `dono_unidade_id null`. **Privada: só a unidade** |

O AI Studio, o Storage e o App Check continuam como estão: não há Storage no Spark, e os links do Drive não mudam.

## 3. Rules → RLS

- **Funções auxiliares** ficam no schema **`app`**, que não é exposto na API. São `security definer` com `search_path = ''` e equivalem às funções das rules.
- O fluxo de cada pedido:
  - `app.perfil()` lê o perfil de quem chama uma vez (o equivalente a `userData()`).
  - Por cima dele vêm `app.conta_ativa`, `app.unidade_ativa`, `app.tem_modulo(u, slug)` (o `temLista`), `app.eh_admin()`, `app.minha_unidade_id()`, `app.gere_acompanhamento()`, `app.franqueado_da_equipe()`, `app.franqueado_cria_equipe()` e `app.modulos_cabem()`.
  - As políticas usam `(select auth.uid())` e `(select app.…())`, para o Postgres avaliar uma vez por consulta.
- **Grants:** `anon` não recebe nenhum grant nas tabelas internas. `authenticated` recebe só os verbos que existem nas rules: onde a rule diz `delete: if false`, o grant de delete nem existe.
- **Bypass:** `app.da_api()` libera os triggers quando quem executa é `postgres` ou `service_role`, o que só acontece em migrações e no loader do lado do servidor.
- **Privacidade:** as políticas desses dados **não** têm o ramo `eh_admin()`. Por exemplo, `crm_contatos` só aceita `unidade_id = app.minha_unidade_id() and app.tem_modulo(perfil, 'crm')`. Cada caso ganha um teste "admin lê 0 linhas".
- **Advisors:** depois de cada migração rodamos os advisors de segurança e de performance do Supabase.

## 4. Autenticação (escolha e impacto)

O Firebase não exporta hashes que o Supabase aceite: o scrypt do Firebase é diferente do bcrypt do GoTrue. **Por isso as senhas não migram.**

**Escolha: importar as contas sem senha e pedir uma nova senha no primeiro acesso.**

1. O script `scripts/migrar-usuarios.mjs` (fase 2) roda na máquina de quem opera, com a chave secreta só no ambiente local e nunca no repositório.
2. Ele lê o Auth e o Firestore com o `firebase-admin` e cria cada conta com `auth.admin.createUser({ email, email_confirm: true })`, sem senha.
3. Em seguida grava `usuarios` com `firebase_uid` e mapeia as referências.
4. No dia do corte, cada pessoa recebe pelo Supabase o e-mail "Defina sua senha do Portal Ubox", que é o link de recuperação.
5. A tela `#/entrar` ganha o aviso "Primeiro acesso no portal novo? Clique em *Esqueci a senha*".
6. O link volta ao app (fluxo PKCE), e o evento `PASSWORD_RECOVERY` abre a tela **Criar nova senha** (`NovaSenhaPage`, já pronta nesta fase).

**Impacto para quem usa:**

- Cada pessoa define a senha **uma vez**, pelo e-mail, depois do corte.
- O e-mail, o papel, a unidade, os módulos e todo o histórico continuam iguais.
- Quem não tem acesso ao próprio e-mail precisa do admin para trocar o endereço antes do corte.
- **Limite do plano Free:** o SMTP padrão do Supabase envia poucos e-mails por hora (cerca de 2). Para disparar para a rede toda há duas opções:
  - configurar um SMTP próprio, gratuito: Gmail/Workspace ou um provedor com cota grátis;
  - deixar que cada pessoa peça o link em *Esqueci a senha*. O pedido é limitado por pessoa, não pela rede.

**Alternativa descartada:** validar a senha antiga no Firebase durante o login e gravar no Supabase. Ela mantém o Firebase Auth vivo, exige uma Edge Function chamando o Firebase e prolonga o período com dois sistemas.

**Contas da equipe:** hoje o franqueado e o admin criam logins por um app Firebase secundário. No Supabase serão:

- um cliente `supabase-js` secundário com `persistSession: false`, que faz o `signUp` do e-mail da equipe;
- depois, o insert em `usuarios`, coberto pela política `usuarios_franqueado_cria_equipe`/`usuarios_admin_cria`.

Se a confirmação de e-mail estiver ligada, a alternativa é uma Edge Function `convidar` com `inviteUserByEmail`. Ela usa a chave secreta **só** no ambiente da função e valida com `app.franqueado_cria_equipe`.

## 5. Dados: exportar e carregar

- `scripts/exportar-firestore.mjs` usa o `firebase-admin` com credencial local e grava JSONL por coleção numa pasta fora do repositório. A pasta `exportacao/` entra no `.gitignore`.
- `scripts/carregar-supabase.mjs` usa `pg` com a connection string, que fica só no ambiente local, nunca no repositório:
  - carrega na ordem das FKs: usuários e unidades, depois conteúdo, depois módulos;
  - roda tudo numa transação por coleção;
  - roda como `postgres`, então os triggers deixam passar via `app.da_api()`;
  - converte `Timestamp`, mapeia `uid → uuid` e confere as contagens no fim.
- **Ensaio:** a carga roda primeiro num schema `ensaio_*` ou contra um projeto local, compara as contagens e os hashes por coleção, e só então vai para `public` na janela do corte.

## 6. Camada de dados com chave

- `VITE_BACKEND=firebase|supabase` define o backend. **O padrão é `firebase`** (`src/lib/backend.ts`).
- **Fase 1:** `src/lib/auth.tsx` escolhe o provedor (entrar, cadastrar, completar, recuperar, sair, definir nova senha). Os módulos continuam no Firestore.
  - Por isso `VITE_BACKEND=supabase` serve **só para desenvolvimento** até o fim da fase 14.
  - Com ele ligado, o login e o perfil funcionam, mas as telas dos módulos ainda chamam o Firestore e vão falhar sem sessão no Firebase.
- **Fases 2 a 14:** cada `src/data/*.ts` ganha a mesma interface, com uma implementação Firestore e outra Supabase. Os testes Vitest passam pelos dois mapeadores.

## 7. Ordem das fases (um PR cada)

| Fase | Conteúdo |
|---|---|
| 0–1 | Plano e fundação: `usuarios`, `unidades`, `admin_lock`, auth no app com chave (este PR) |
| 2 | Gestão de acessos: telas de usuários, minha equipe e franqueadora no Supabase, criação de logins da equipe, script de importação de contas (ensaio, sem rodar em produção) |
| 3 | Manuais: categorias, documentos e versões, avisos, leituras, aceites, quizzes, certificados, trilha e reestudos |
| 4 | Universidade: cursos, provas, gabarito, tentativas e folha |
| 5 | Chamados |
| 6 | Senhas: acessos, segredo, eventos e solicitações |
| 7 | Marketing |
| 8 | Checklist |
| 9 | Auditoria |
| 10 | Acompanhamento |
| 11 | Estoque |
| 12 | CRM (contatos e atividades só da unidade) |
| 13 | Cliente: clientes, painel público por RPC, cobranças, visitas e recados |
| 14 | Nuvem (área privada só da unidade) |
| 15 | Corte |

## 8. Corte

Consulte o checklist da seção 24 para preparar e executar o corte na janela aprovada.

## 9. Testes

- Os 818 casos de `tests/regras.mjs` (no emulador do Firestore) viram arquivos pgTAP em `supabase/tests/*.test.sql`, um por módulo, portados na mesma fase do módulo.
- Pessoas fictícias ficam em `tests.pessoas`, e `tests.entrar('fr1')` troca o `role`/JWT.
- **Local:** `npm run test:supabase`. Não há Docker nem CLI do Supabase nesta máquina, então o runner usa **PGlite** (o Postgres 18 em wasm) com:
  - um stub de `auth` (`supabase/tests/local/auth_stub.sql`);
  - pgTAP 1.3.3;
  - as migrações em ordem e os testes.
- **Remoto:** `npm run test:supabase:remoto -- supabase/tests/x.test.sql > /tmp/remoto.sql` gera uma versão que:
  - roda no projeto real numa transação;
  - grava o TAP numa tabela temporária;
  - termina com `raise exception`, devolvendo a saída e **desfazendo tudo**: nada fica no banco, nem o schema `tests` nem a extensão.

## 10. O que a fase 1 entregou

- **Migrações aplicadas no projeto:** `20261120130030_fase1_fundacao`, `20261120130132_fase1_indice_trava` e `20261120131437_fase1_trava_so_gatilho`. A última corrige um achado LOW da revisão: a trava do 1º admin só pode ser gravada pelo gatilho da promoção.
- **Tabelas:**
  - `usuarios`: id = `auth.users.id`, com `firebase_uid`;
  - `unidades`: id text;
  - `admin_lock`;
  - o enum `papel`.
- **RLS:** a leitura, o cadastro próprio, a criação pelo admin, a criação da equipe pelo franqueado, as atualizações por trigger, as exclusões, o CRUD de unidades e o bootstrap atômico do 1º admin, tudo igual às rules.
  - **Endurecimentos:**
    - no cadastro próprio, `criado_por` só pode ser nulo ou a própria pessoa;
    - o bootstrap do admin exige `recusado = false`;
    - as datas são carimbadas pelo servidor.
- **Testes:** 75 pgTAP, ok no local e no remoto, com rollback. Os advisors de segurança não apontaram nada. Com a chave publicável e sem login, o REST devolve 401 para as três tabelas.
- **App:**
  - `@supabase/supabase-js`, `src/lib/supabase.ts`, `src/supabaseConfig.ts` e `src/lib/backend.ts`;
  - o caminho Supabase em `auth.tsx` e a `NovaSenhaPage`;
  - testes Vitest do mapeamento e do status.
- Nenhum usuário nem dado foi migrado.

## 11. O que a fase 2 entregou (gestão de acessos)

- **Migração `20261120132140_fase2_gestao_acessos`** (aplicada): duas funções `security invoker`. Elas rodam como quem chama, então o RLS e os gatilhos da fase 1 continuam decidindo. Só `authenticated` pode executá-las; `anon` não tem acesso.
  - `criar_unidade_com_responsavel`: cria a unidade e o perfil do responsável, tudo ou nada.
  - `atualizar_unidade`: edita a unidade e passa as mudanças para o responsável e para a equipe numa transação só. A equipe perde os módulos que a unidade deixou de ter.
- **Edge Function `criar-conta`** (publicada, gratuita no plano Free): cria o login da equipe ou do responsável da unidade.
  - A `service_role` existe só no servidor do Supabase e serve apenas para criar e apagar o login.
  - O perfil é gravado com o token de quem chamou, então o RLS decide. Se a gravação for recusada, o login recém-criado é apagado.
  - Sem sessão válida, a função responde 401.
  - Foi publicada com `verify_jwt: false` porque ela mesma valida a sessão com `auth.getUser()`.
  - Revisão (LOW): toda falha ao criar o login devolve a mesma mensagem, sem dizer se o e-mail já existe; a falha na gravação do perfil devolve uma frase fixa, sem o texto do Postgres; e há um limite de 10 criações por pessoa a cada 10 minutos (`registrar_criacao_conta`, só para a service_role; a tabela `criar_conta_tentativas` fica sem acesso pelo app e o aviso INFO do advisor é intencional).
- **App:** com `VITE_BACKEND=supabase`, `gestao.ts` e `api.ts` usam o Supabase em:
  - listar usuários, unidades e equipe;
  - criar unidade e equipe;
  - editar unidade e usuário, inclusive o próprio nome;
  - enviar o e-mail de redefinição de senha.

  `reidratarAcessos` não faz nada no Supabase até a fase 3. **O padrão continua Firebase.**
- **Ensaio da importação de usuários:** `npm run migracao:ensaio` roda `scripts/migrar-usuarios.mjs ensaio` com dados fictícios em `scripts/migracao/exemplo`.
  - Ele carrega tudo num PGlite em memória, com as migrações reais, e confere as contagens.
  - `aplicar` e `exportar` ainda não importam nada: a importação real fica para o corte, com aprovação explícita.
  - Senhas e hashes nunca são lidos.
- **Testes:**
  - `supabase/tests/fase2_gestao.test.sql` tem 46 casos pgTAP. Desses, 31 foram portados de `tests/regras.mjs` (marcados `[regras]`) e 15 cobrem as funções novas.
  - Com a fase 1, são 121 casos no local e no projeto (com rollback).
  - O Vitest cobre o mapeamento e o ensaio de importação.

## 12. O que a fase 3 entregou (manuais, documentos e avisos)

- **Migração `20261120140950_fase3_manuais`** (aplicada): cria 16 tabelas.
  - Conteúdo: `categorias`, `documentos`, `documento_versoes`, `trilhas`, `quizzes`, `quiz_gabaritos`, `gabaritos`, `avisos`.
  - Registros de estudo: `leituras`, `aceites`, `tentativas`, `certificados`, `avisos_leituras`.
  - Trilha de manuais: `manuais_trilha`, `progresso_manuais`, `reestudos`.
- **Regras:** o RLS, os grants por verbo e os gatilhos repetem as rules.
  - O servidor carimba as datas, e os gatilhos protegem os campos imutáveis e o cronômetro dos manuais.
  - O público é materializado em `uids`, como no Firestore.
  - **Os gabaritos são lidos só pelo admin.**
  - Os rascunhos também ficam só para o admin.
  - Leituras, aceites, certificados e confirmações de aviso só aceitam inserção.
  - `tentativas` (legado) não aceita nem inserção.
- **Dependência da fase 4:** o certificado de curso e o reestudo dependem das tabelas da Universidade. Enquanto elas não existem, as funções auxiliares recusam essas gravações.
- **App:** com `VITE_BACKEND=supabase`, `api.ts` e `manuaisApi.ts` passam pelo Supabase (`src/lib/manuaisSupabase.ts`). O caminho do Firebase continua igual.
- **Testes:**
  - `supabase/tests/fase3_manuais.test.sql` tem 123 casos pgTAP, sendo 63 portados de `tests/regras.mjs` (marcados `[regras]`).
  - No total são 256 casos, no local e no projeto, com rollback.
  - O Vitest cobre os mapeadores.

Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

## 13. O que a fase 4 entregou (Universidade)

- **Migrações** (aplicadas):
  - **`20261120145236_fase4_universidade`** cria `cursos`, `provas`, `provas_gabarito`, `tentativas_prova` e `tentativas_prova_folha`, com RLS igual às rules.
    - O aluno nunca lê o gabarito.
    - O franqueado vê o resultado da equipe, mas não a folha de respostas.
    - A correção é validada por um gatilho, que compara com o gabarito sem expor o gabarito ao aluno.
    - Prova e gabarito, e também tentativa e folha, só valem juntos (FKs adiadas).
  - **`20261120151359_fase4_rpcs`** cria `salvar_prova_universidade` e `enviar_tentativa_universidade`. As duas são `security invoker`, então o RLS e os gatilhos continuam decidindo, e gravam o par numa transação só.
- **Reestudo:** o servidor define `iniciado_em` na criação e em cada reinício. Um valor enviado pelo app é ignorado, e o app deixou de enviar esse campo.
- **App:** com `VITE_BACKEND=supabase`, `universidadeApi.ts` passa pelo Supabase (`src/lib/universidadeSupabase.ts`), inclusive certificados de curso e reestudos.
- **Testes:**
  - 106 casos em `fase4_universidade` e 13 em `fase4_rpcs`.
  - O teste da fase 3 agora usa as tabelas reais da Universidade.
  - No total são 375 casos, no local e no projeto, com rollback.

Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

## 14. O que a fase 5 entregou (chamados)

- Migração `20261120151537_fase5_chamados` (aplicada no projeto): tabelas `chamados` e `chamado_eventos`, RLS por verbo, anon sem nada.
- Gatilho `app.chamado_carimbar` (definer, só no schema `app`) valida as transições de status, carimba datas pelo servidor e grava o evento de transição no mesmo comando; histórico imutável e sem DELETE.
- `public.mudar_status_chamado(...)` (invoker) troca status/responsável e grava o evento atomicamente.
- `app.chamado_alterar_como_autor` (definer): o autor fecha (resolvido→fechado, nota 1–5) ou reabre, mesmo sem leitura pelo módulo — igual às regras do Firestore. Esse caminho não grava evento (também igual ao Firestore).
- Privacidade: consultor (acompanhamento) lê chamados, mas não os eventos; outra unidade, conta/unidade inativa e anon não leem nada.
- App: `src/lib/chamadosSupabase.ts` atrás de `VITE_BACKEND=supabase`; no Supabase a lista é atualizada por polling de 15 s (sem Realtime ainda).
- Testes: `supabase/tests/fase5_chamados.test.sql` (61 casos; 32 casos das regras do Firestore portados), local e remoto com rollback.

## 15. O que a fase 6 entregou (cofre de senhas)

- Migração `20261120154924_fase6_senhas` (aplicada no projeto): `acessos` (metadados), `acesso_segredos` (login/senha/notas, tabela separada com RLS própria), `acesso_eventos` e `solicitacoes_acesso`. Nenhum DELETE.
- Privacidade igual às regras do Firestore: o segredo de unidade só é lido pelo franqueado da unidade com o módulo `senhas`, ou pela equipe da unidade quando `visivel_para_equipe` ou o uid está em `visivel_para`. **Admin e equipe da franqueadora não leem nem gravam segredos de unidade** (leem só os metadados). Segredos da rede seguem `perfilPodeLerSegredo`/`perfilPodeEscreverSegredo`.
- Mesmo lote do Firestore: segredo só é gravado na transação que trocou `ultima_troca_em` (identificador de troca + FK adiada); limpar `pendente_troca` exige rotação. RPCs invoker: `criar_acesso`, `trocar_senha_acesso`, `atualizar_metadados_acesso`, `decidir_solicitacao_acesso` — erros com mensagem fixa, sem dados do segredo.
- Nenhuma função definer devolve colunas do segredo; os predicados em `app` devolvem só booleanos.
- App: `src/lib/senhasSupabase.ts` atrás de `VITE_BACKEND=supabase` (listas por polling de 15 s).
- Testes: `supabase/tests/fase6_senhas.test.sql` — 80 casos (35 das regras do Firestore + privacidade de admin/franqueadora, anon e mesmo lote), local e remoto com rollback.

## 16. O que a fase 7 entregou (Central de Marketing)

- Migração `20261120155013_fase7_marketing` (aplicada no projeto): `marketing_materiais`, `marketing_campanhas`, `marketing_solicitacoes`. Materiais só com link https (sem Storage). Sem DELETE; anon sem nada.
- Leitura igual às regras: gestores de Marketing (admin / equipe da franqueadora com `marketing`) leem tudo; consultor com `acompanhamento` lê as solicitações (só leitura); o autor lê os próprios pedidos; o franqueado lê os da unidade; material direcionado só para as unidades da lista; inativos e sem módulo não leem.
- Autoria, datas, campos imutáveis e transições de status nos gatilhos (`42501`). Cada ação grava uma linha, então não há RPC de lote.
- App: `src/lib/marketingSupabase.ts` atrás de `VITE_BACKEND=supabase` (polling de 15 s).
- Testes: `supabase/tests/fase7_marketing.test.sql` — 90 casos (66 das regras do Firestore + privacidade e anon), local e remoto com rollback.

## 17. O que a fase 8 entregou (Checklist Operacional)

- Migração `20261120161306_fase8_checklist` (aplicada no projeto): `checklist_modelos` e `checklist_execucoes` (itens em jsonb validado). Sem DELETE; anon sem nada.
- Leitura igual às regras: gestores de Checklist (admin / equipe da franqueadora com `checklist`) leem tudo; consultor com `acompanhamento` lê modelos e execuções; auditor (`app.gere_auditoria()`, admin / franqueadora com `auditoria`) lê execuções para referenciar — só leitura; a unidade lê o próprio histórico e os modelos ativos públicos ou direcionados a ela.
- Gatilhos validam versão, pesos e totais contra o modelo, autoria e datas do servidor; depois do envio só a observação do proprietário (franqueado) muda.
- App: `src/lib/checklistSupabase.ts` atrás de `VITE_BACKEND=supabase`.
- Testes: `supabase/tests/fase8_checklist.test.sql` — 90 casos (64 `ck:` + 4 de auditor/consultor das regras, mais privacidade e anon). Cinco casos indiretos que gravam auditorias ficam na fase 9.

## 18. O que a fase 9 entregou (Auditoria e Qualidade)

- Migração `20261120163800_fase9_auditoria` (aplicada no projeto): `auditoria_modelos`, `auditorias`, `auditoria_acoes`. Sem DELETE; anon sem nada.
- Leitura igual às regras: auditores (admin / franqueadora com `auditoria`) leem tudo; consultor com `acompanhamento` lê só auditorias assinadas (`aguardando_ciencia`/`concluida`) e as ações, nunca rascunhos nem modelos; a unidade auditada (franqueado e equipe, sem depender de módulo) lê só as próprias auditorias assinadas e as próprias ações.
- Gatilhos conferem modelo ativo na versão certa, unidade existente, checklist de referência da mesma unidade e com score, aprovação pela nota mínima (auditoria e checklist), assinatura e ciência com hora e identidade do servidor, e as transições do plano de ação (evidência https, validação só pela franqueadora).
- RPC invoker `public.criar_acoes_auditoria(auditoria, acoes jsonb)` grava o plano em lote atômico; helper definer `app` só devolve booleano.
- App: `src/lib/auditoriaSupabase.ts` atrás de `VITE_BACKEND=supabase`. A consulta agregada do Acompanhamento ainda usa o Firestore (fica para a fase do Acompanhamento).
- Testes: `supabase/tests/fase9_auditoria.test.sql` — 109 casos (81 das regras do Firestore, incluindo os 5 adiados da fase 8, mais privacidade, lote e anon), local e remoto com rollback.

## 19. O que a fase 10 entregou (Acompanhamento do Franqueado)

- Migração `20261120171246_fase10_acompanhamento` (aplicada no projeto): `acompanhamento_registros` e `acompanhamento_passos`. Sem DELETE; anon sem nada.
- Leitura igual às regras: consultor com `acompanhamento` (ou admin) lê tudo; a unidade (franqueado e equipe, sem depender de módulo) lê só registros compartilhados da própria unidade e só os passos compartilhados cujo registro-pai também está compartilhado. Registros internos e seus passos ficam invisíveis para a unidade.
- RPC invoker `public.salvar_acompanhamento(...)` grava registro + passos no mesmo lote (equivalente a `existsAfter/getAfter`) e propaga o compartilhamento para os passos, inclusive validados. O franqueado só marca o passo como feito, com comentário.
- **Painel do Acompanhamento no Supabase:** com `VITE_BACKEND=supabase`, o resumo lê as 12 fontes (modelos e execuções de checklist, auditorias e ações, chamados, tentativas e cursos, progresso e trilha de manuais, pedidos de marketing, registros e passos) das tabelas já migradas — sem tocar no Firestore.
- Testes: `supabase/tests/fase10_acompanhamento.test.sql` — 72 casos; os 73 casos `ac:` das regras estão portados (50 aqui, 23 nas fases anteriores).

## 20. O que a fase 11 entregou (Controle de Estoque)

- Migração `20261120171359_fase11_estoque` (aplicada no projeto): `estoque_itens`, `estoque_movimentos`, `estoque_contagens`, `estoque_pedidos` e a nova `estoque_saldos` (saldo por unidade e item). Sem DELETE; anon sem nada.
- Leitura igual às regras: Suprimentos (admin / franqueadora com `estoque`) lê tudo; a unidade com o módulo lê o catálogo e só os próprios movimentos, contagens, pedidos e saldos. O Acompanhamento sozinho não lê estoque (como no Firestore).
- Lotes do Firestore viraram RPCs invoker: `registrar_movimento_estoque`, `confirmar_contagem_estoque` (contagem + ajustes) e `receber_pedido_estoque` (recebimento + entradas). O saldo só muda por gatilho, com o item travado (`for update`); escrita direta em `estoque_saldos` é recusada.
- **Diferença intencional:** o banco recusa movimento que deixaria o saldo negativo (o app já bloqueava isso no cliente; o Firestore não conferia). Na carga de dados reais, `estoque_saldos` precisa ser inicializado com a soma dos deltas importados antes de liberar o módulo.
- App: `src/lib/estoqueSupabase.ts` atrás de `VITE_BACKEND=supabase`.
- `scripts/supabase-test-remoto.mjs`: o `plan()` passa para depois da tabela de saída quando o arquivo o declara antes do `create schema tests`.
- Testes: `supabase/tests/fase11_estoque.test.sql` — 129 casos (99 `es:` das regras + privacidade, atomicidade do saldo e anon), local e remoto com rollback.

## 21. O que a fase 12 entregou (CRM e Gestão Comercial)

- Migração `20261120180006_fase12_crm` (aplicada no projeto): `crm_config`, `crm_leads` (sem PII), `crm_contatos` (nome, telefone, e-mail), `crm_atividades`, `crm_propostas`. Sem DELETE; anon sem nada.
- **Privacidade igual às regras:** `crm_contatos`, atividades e propostas são só da própria unidade (com o módulo `crm`, conta e unidade ativas). Admin, equipe da franqueadora e consultor de acompanhamento **não** leem nem gravam contatos. A franqueadora lê só os leads (sem PII) e a configuração da rede.
- Lead + contato nascem juntos pela RPC invoker `public.criar_lead_crm(...)` (FK/gatilho adiado exige o par); atividade + próximo follow-up também no mesmo lote. Erros com mensagem fixa, sem PII.
- App: `src/lib/crmSupabase.ts` atrás de `VITE_BACKEND=supabase`.
- Testes: `supabase/tests/fase12_crm.test.sql` — 119 casos (85 `crm:` das regras + privacidade de contatos, atomicidade e anon), local e remoto com rollback.

## 22. O que a fase 13 entregou (Painel do Cliente e link público)

- Migração `20261120180417_fase13_cliente` (aplicada no projeto): `clientes` (cadastro com nome, telefone, e-mail), `cliente_paineis` (pk = token de 128 bits em hex), `cliente_painel_cobrancas`, `cliente_painel_visitas`, `cliente_painel_recados`. Sem DELETE.
- **Privacidade:** `clientes` só da própria unidade com o módulo `cliente`; admin, franqueadora e acompanhamento não leem. O painel guarda só o primeiro nome, sem telefone/e-mail/sobrenome.
- **Link público `/painel/:token`:** o anônimo **não tem privilégio em tabela nenhuma** (nem SELECT), então não há listagem nem enumeração. O único acesso é `public.painel_publico(p_token)` (invoker) → `app.painel_publico` (definer, `search_path = ''`). Ela confere o formato do token, exige painel ativo **e** que o token seja o atual do cliente, e devolve só os campos públicos do painel e dos itens (sem `cliente_id`, `unidade_id` nem IDs internos). Token inválido, desconhecido, inativo ou trocado → `null` igual (sem oráculo de existência). Para isso a fase concede `USAGE` no schema `app` ao anon e antes revoga o EXECUTE herdado de PUBLIC dos gatilhos antigos; o teste confere que o anon executa **só** `painel_publico` e nenhuma tabela.
- Troca de link (painel novo + antigo desativado + cliente apontando para o novo; link antigo nunca volta) e criação/edição do cliente com painel no mesmo lote por RPCs invoker (`criar_cliente`, `salvar_cliente`, `trocar_link_cliente`).
- App: `src/lib/clienteSupabase.ts`; a página pública chama `rpc('painel_publico')` sob a chave. O caminho Firebase da página pública mantém o comportamento anterior.
- Testes: `supabase/tests/fase13_cliente.test.sql` — 114 casos (83 `cli:` das regras + superfície do anônimo, chaves públicas e troca de link), local e remoto com rollback.

## 23. O que a fase 14 entregou (Armazenamento em Nuvem)

- Migração `20261120180541_fase14_nuvem` (aplicada no projeto): `nuvem_links` (só links https de `drive.google.com`/`docs.google.com`; o compartilhamento no Drive não muda).
- **Privacidade igual às regras:** a área privada da unidade (`dono = unidade_id`, visibilidade `privada`) só é lida, editada ou apagada pela própria unidade com o módulo `nuvem`; admin e equipe da franqueadora **não** acessam. Links da franqueadora (`dono = ''`) seguem a visibilidade `rede` / `unidades` / `franqueadora` (esta última invisível às unidades). DELETE existe, como nas regras, só para quem pode gravar.
- Dono, autor e data de criação imutáveis; carimbos de atualização só pelo gatilho.
- App: `src/lib/nuvemSupabase.ts` atrás de `VITE_BACKEND=supabase`.
- Testes: `supabase/tests/fase14_nuvem.test.sql` — 74 casos (59 `nv:` das regras + privacidade da área da unidade), local e remoto com rollback.

## 24. Fase 15 — checklist do corte (preparado, não executado)

Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

Produção segue no Firebase. Esta fase prepara o corte para o Supabase `zmreflstgxgofvuhzqau`, no plano Free.

### 24.1 Pré-requisitos que ainda faltam (bloqueiam o corte)

- [ ] 1. Implementar `scripts/migrar-usuarios.mjs exportar` e `aplicar`. Hoje são stubs e só `ensaio` funciona.
- [ ] 2. Criar `scripts/exportar-firestore.mjs` e `scripts/carregar-supabase.mjs`, previstos na seção 5. Incluir a inicialização de `estoque_saldos` a partir dos movimentos importados.
- [ ] 3. Alterar o passo de build de `.github/workflows/pages.yml` para ler `VITE_BACKEND`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` das variáveis do repositório. Hoje o workflow não passa nenhuma das três.
- [ ] 4. Revisar e aprovar o PR **Fase 15b** (scripts e ajuste do workflow) antes do dia do corte. Confirmar nele a sintaxe dos comandos propostos abaixo e ensaiar a carga e o build com os dois backends.

### 24.2 O que o Adilson roda na própria máquina

- [ ] 1. Criar uma pasta privada de exportação fora do repositório e apontar `EXPORT_DIR` para ela. No ambiente local da máquina do Adilson, configurar `GOOGLE_APPLICATION_CREDENTIALS` com o caminho da credencial local do `firebase-admin`, `SUPABASE_SECRET_KEY` para a API administrativa e `SUPABASE_DB_URL` para a conexão como `postgres`. Obter as credenciais do Supabase no dashboard. Manter credenciais e arquivos de exportação fora do repositório e do frontend.
- [ ] 2. Com a Fase 15b pronta, exportar com `node scripts/migrar-usuarios.mjs exportar --dir "$EXPORT_DIR"` e `node scripts/exportar-firestore.mjs --dir "$EXPORT_DIR"`. Conferir `auth.json`, `usuarios.json`, `unidades.json`, `config.json` e os JSONL de coleções e subcoleções. A exportação do Auth contém UID, e-mail e metadados, sem senhas nem hashes.
- [ ] 3. Rodar `node scripts/migrar-usuarios.mjs ensaio --dir "$EXPORT_DIR"` e ensaiar os módulos em destino isolado com `node scripts/carregar-supabase.mjs ensaio --dir "$EXPORT_DIR"`. Conferir contagens previstas e obtidas, hashes por coleção, duplicidades, perfis ignorados e referências sem correspondência. Resolver divergências antes de aplicar. Repetir as conferências com a exportação final.
- [ ] 4. Na janela aprovada, rodar `node scripts/migrar-usuarios.mjs aplicar --dir "$EXPORT_DIR"`. Criar contas sem senha com `auth.admin.createUser({ email, email_confirm: true })`. Usar os UUIDs retornados para gravar `usuarios.id` e mapear pelo `usuarios.firebase_uid`. Carregar unidades, perfis, vínculos dos responsáveis e `admin_lock` respeitando as FKs. Usar o mapa da aplicação real na carga dos módulos, pois o ensaio gera UUIDs próprios.
- [ ] 5. Rodar `node scripts/carregar-supabase.mjs aplicar --dir "$EXPORT_DIR"` como `postgres`. Carregar conteúdo e módulos em ordem de FKs, com pais antes dos filhos e pares com FKs adiadas na mesma transação. Preservar IDs de documentos, converter datas e traduzir referências de usuários pelo mapa real. Como `app.da_api()` retorna falso para `postgres`, os gatilhos dispensam as validações da API e o estoque exige cálculo explícito. FKs e restrições das tabelas continuam valendo.
- [ ] 6. Listar os pares unidade/item com saldo negativo antes de inicializar `estoque_saldos`. Adilson decide se corrige com um ajuste registrado ou se eleva o saldo inicial a zero com exceção documentada. Se optar por zero, usar `greatest(sum(delta), 0)` somente conforme a decisão registrada e reconciliar a diferença com o histórico. Aplicar a inicialização uma vez, em transação, como `postgres`.

  ```sql
  select unidade_id, item_id, sum(delta) as saldo
  from public.estoque_movimentos
  group by 1, 2
  having sum(delta) < 0;

  insert into public.estoque_saldos (unidade_id, item_id, saldo)
  select unidade_id, item_id, sum(delta)
  from public.estoque_movimentos
  group by 1, 2;

  select unidade_id, item_id, saldo
  from public.estoque_saldos
  where saldo < 0;
  ```

- [ ] 7. Comparar `count(*)` por tabela com o manifesto da exportação mapeada, incluindo `auth.users`, `usuarios`, `unidades`, `admin_lock` e tabelas filhas. Para `estoque_saldos`, comparar a contagem de pares distintos e reconciliar os valores com a soma dos deltas e as exceções aprovadas. Conferir amostras de vínculos e histórico por unidade.
- [ ] 8. Após validar a carga e fechar a janela de decisão de rollback, apagar a pasta local de exportação, remover as credenciais do ambiente e revogar ou rotacionar no dashboard a `SUPABASE_SECRET_KEY` usada na migração. A `SUPABASE_SERVICE_ROLE_KEY` da Edge Function fica no ambiente gerenciado do Supabase.

### 24.3 SMTP próprio para o e-mail 'Defina sua senha'

O SMTP padrão do Supabase envia cerca de 2 e-mails por hora no projeto e serve para testes internos. Para enviar à rede toda, configurar SMTP próprio. [Documentação do Supabase](https://supabase.com/docs/guides/auth/auth-smtp)

| Provedor | Limites — conferir no provedor | Configuração | SPF, DKIM e DMARC |
|---|---|---|---|
| Hostinger E-mail, já usado pelo Adilson | Conferir no hPanel a cota diária da caixa | Baixa. `smtp.hostinger.com`, porta 465 SSL ou 587 STARTTLS, usuário igual ao endereço completo da caixa e remetente como `portal@<seu-dominio>`. [Configuração SMTP](https://support.hostinger.com/en/articles/1575756-how-to-get-email-account-configuration-details-for-hostinger-email) · [Cotas](https://support.hostinger.com/en/articles/4625828-parameters-and-limits-of-hostinger-email) | Conferir SPF e DKIM da caixa e o DMARC do domínio |
| Gmail / Google Workspace | Limites diários por conta | Baixa a média. Ativar verificação em duas etapas e usar senha de app, se a conta permitir. [Senha de app](https://support.google.com/accounts/answer/185833) | Gmail usa o DNS do Google. Para domínio próprio no Workspace, conferir SPF, DKIM e DMARC |
| Brevo Free | Cerca de 300/dia. [Cota](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) | Média. Validar remetente e configurar SMTP | Seguir os registros pedidos pelo provedor e conferir SPF, DKIM e DMARC |
| Resend Free | Cerca de 100/dia e 3.000/mês. [Cotas](https://resend.com/pricing) | Média. Validar domínio e configurar SMTP | Publicar SPF e DKIM do provedor e conferir DMARC |
| Amazon SES | Cotas por conta e região. Serviço de baixo custo por uso. [Cotas](https://docs.aws.amazon.com/ses/latest/dg/quotas.html) · [Preços](https://aws.amazon.com/ses/pricing/) | Alta. Verificar domínio, configurar SMTP e solicitar saída do sandbox | Habilitar DKIM e conferir SPF do MAIL FROM e alinhamento DMARC |

- [ ] 1. Em **Authentication > Emails > SMTP Settings**, habilitar o SMTP próprio e preencher servidor, porta, usuário e remetente. Guardar `SMTP_PASSWORD` (senha da caixa, senha de app ou credencial SMTP do provedor) nas configurações SMTP do dashboard do Supabase, fora do repo e do frontend.
- [ ] 2. Em **Authentication > Rate Limits**, elevar o limite de e-mails após habilitar o SMTP próprio, respeitando a vazão horária e a cota diária do provedor.
- [ ] 3. Em **Authentication > URL Configuration**, usar `https://adilsonzetta.github.io/ubox-portal-franqueado/` como **Site URL** e permitir a mesma raiz em **Redirect URLs**. No fluxo da seção 4, o app recebe o retorno na raiz e `PASSWORD_RECOVERY` abre **Criar nova senha** (`#/nova-senha` no roteiro do usuário, sem usar o fragmento como URL de retorno).
- [ ] 4. Em **Email Templates > Reset Password**, definir o assunto **Defina sua senha do Portal Ubox**. Testar entrega, abertura do link, definição de senha e novo login com 2–3 contas internas antes do envio à rede.
- [ ] 5. Validar o disparo no navegador do destinatário. O PKCE atual exige o verificador do navegador que iniciou o pedido. Se o link disparado pelo operador falhar, validar antes do corte um fluxo compatível ou enviar a instrução de primeiro acesso para cada pessoa iniciar **Esqueci a senha** e abrir o link no mesmo navegador. Enviar em lotes dentro dos limites do Supabase e do provedor. [Fluxo PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

### 24.4 Ordem do dia do corte

- [ ] 1. **Adilson · 10 min, com antecedência** — anunciar a janela, o horário de Brasília e o canal de suporte.
- [ ] 2. **Grok Bot · 15–30 min** — publicar o build Firebase com aviso de manutenção e bloquear os fluxos de escrita. O operador só publica regras Firestore de leitura exclusiva com aprovação explícita do Adilson. Confirmar o congelamento antes da exportação.
- [ ] 3. **Adilson · 15–30 min** — fazer a exportação final do Auth e do Firestore e conferir o manifesto.
- [ ] 4. **Adilson · 30–60 min** — rodar o ensaio da exportação final, importar usuários e depois carregar os dados dos módulos.
- [ ] 5. **Adilson · 10–30 min** — resolver negativos conforme a decisão registrada e inicializar `estoque_saldos`.
- [ ] 6. **Adilson e Grok Bot · 20–30 min** — conferir contagens por tabela e amostras por unidade. Suspender a virada se houver divergência sem explicação.
- [ ] 7. **Grok Bot · 15–30 min** — definir as variáveis públicas `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` e virar `VITE_BACKEND=supabase` nas variáveis do repositório. Disparar o workflow do Pages e confirmar a publicação do build.
- [ ] 8. **Adilson e Grok Bot · 30–60 min** — executar os testes abaixo na publicação com contas e registros de teste, mantendo o aviso de manutenção para a rede.
- [ ] 9. **Adilson · 10–15 min para iniciar** — iniciar os lotes de **Defina sua senha do Portal Ubox**, no ritmo validado com o provedor.
- [ ] 10. **Grok Bot · 10–20 min** — com o aceite do Adilson, retirar a manutenção no build Supabase, confirmar o acesso e anunciar a reabertura.

### 24.5 Smoke tests depois da virada

- [ ] 1. **Todos os perfis** — definir nova senha pelo fluxo de recuperação, sair e entrar com ela. Conferir papel, unidade e módulos liberados. Testar uma conta inativa e uma sem módulos.
- [ ] 2. **`admin`** — listar usuários e unidades, editar uma liberação e criar conta de equipe via Edge Function `criar-conta`. No cofre de Senhas, conferir que vê metadados e que a revelação do segredo de uma unidade é negada.
- [ ] 3. **`equipe_franqueadora`** — com os módulos liberados, responder a um Chamado, publicar material de Marketing e assinar uma Auditoria de teste. No CRM, verificar leads da rede e confirmar que os contatos da unidade ficam inacessíveis.
- [ ] 4. **`franqueado`** — criar um login da própria equipe via `criar-conta`, abrir um manual e registrar aceite, concluir uma prova na Universidade e enviar um Checklist. Abrir Chamado e conferir resposta e histórico. Revelar uma senha da própria unidade e conferir o evento. Registrar movimento de Estoque, conferir o saldo após recarregar e testar a recusa de uma saída acima do saldo. Abrir um contato do CRM e um cadastro de Cliente da própria unidade.
- [ ] 5. **`equipe_franqueado`** — acessar apenas os módulos concedidos e os registros da própria unidade. Conferir um material de Marketing direcionado, uma senha liberada para a equipe e a recusa para uma senha restrita. Abrir um link privado da Nuvem da própria unidade e confirmar que o de outra unidade fica inacessível. Confirmar que a franqueadora também fica sem acesso à área privada da unidade.
- [ ] 6. **Consultor com `acompanhamento`** — abrir o painel, conferir os resumos e compartilhar um passo de teste. Validar com o franqueado que o passo compartilhado aparece e o interno fica oculto. Confirmar que o consultor vê chamados sem eventos e auditorias assinadas sem rascunhos.
- [ ] 7. **Cliente e painel público** — em janela privativa, abrir `#/painel/:token` e conferir cobranças, visitas e recados, sem e-mail, telefone ou IDs internos do cliente. Após trocar o link de teste, conferir que só o token atual e ativo funciona.
- [ ] 8. **Rede e advisors** — na aba Rede do navegador, confirmar chamadas a `supabase.co` e ausência de escritas em `firestore.googleapis.com`. Rodar `get_advisors` de segurança no projeto e confirmar que sobra apenas o INFO intencional de `criar_conta_tentativas`.

### 24.6 Plano de volta ao Firebase (rollback)

- [ ] 1. Acionar rollback se houver falha de login para muitas pessoas, vazamento de dados ou divergência relevante sem correção dentro da janela. Adilson define o prazo de decisão, por exemplo, as primeiras 24 h após a virada.
- [ ] 2. **Atenção:** qualquer escrita feita no Supabase após a virada fica lá. Congelar novas escritas e identificar o que mudou desde o corte. Se houver dados a preservar, reexportar manualmente do Supabase, reconciliar os registros com o Firestore e validar a reaplicação autorizada antes de reabrir.
- [ ] 3. Voltar a variável do repositório para `VITE_BACKEND=firebase` e disparar novamente o build do Pages. Se as regras temporárias de leitura exclusiva tiverem sido publicadas, restaurar as regras anteriores. Retirar a manutenção e confirmar login e escrita no Firebase. Os usuários voltam a usar as senhas antigas do Firebase.
- [ ] 4. Enquanto o Supabase estiver em produção, preservar o Firebase intacto e em modo operacional de só leitura por 30 dias. O bloqueio por regras depende da aprovação explícita do Adilson. Após 30 dias, aguardar a decisão de desativação.

### 24.7 Diferenças conhecidas (aceitas)

- [ ] 1. Listas de Chamados, Senhas, Marketing, Checklist, Estoque e outros módulos consultam o Supabase a cada 15 s em vez de usar Realtime.
- [ ] 2. O painel público exige painel ativo e token atual do cliente. O Firestore conferia apenas se o painel estava ativo.
- [ ] 3. O banco recusa movimentos que deixariam o saldo negativo. O app já os bloqueava no cliente.
- [ ] 4. A RPC `painel_publico` não tem limite de requisições próprio. O token tem 128 bits.
- [ ] 5. Fechar ou reabrir um Chamado como autor não grava evento, como no Firestore.

### 24.8 Decisões pendentes do Adilson

- [ ] 1. Escolher o provedor SMTP e o endereço do remetente.
- [ ] 2. Definir data, horário e duração da janela do corte.
- [ ] 3. Autorizar ou dispensar a publicação de regras Firestore de leitura exclusiva durante o congelamento.
- [ ] 4. Decidir como tratar os saldos negativos listados no ensaio.
- [ ] 5. Fixar o prazo de decisão de rollback.
- [ ] 6. Decidir quando desativar o Firebase após os 30 dias.
- [ ] 7. Decidir se o Realtime será habilitado depois.
