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

1. Congelar a escrita: o aviso de manutenção sai no build do Firebase. Opcionalmente, um deploy de regras só leitura, **com aprovação explícita** do responsável.
2. Exportar o Firestore e o Auth, carregar no Supabase e conferir as contagens.
3. Fazer o build com `VITE_BACKEND=supabase`, publicar no Pages e enviar os e-mails de primeiro acesso.
4. **Volta atrás:** basta publicar de novo o build com `VITE_BACKEND=firebase`. O Firebase fica intacto e só leitura por 30 dias. Depois disso, quem decide é o responsável.

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
