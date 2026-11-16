# Portal do Franqueado Ubox

Biblioteca de POPs, manuais, políticas e trilhas da rede **Ubox Self Storage** (Uberaba/MG), para a franqueadora e os franqueados. A interface está em português do Brasil.

O app é uma SPA React + Vite + TypeScript, publicada no GitHub Pages, com Firebase Auth (e-mail e senha) e Cloud Firestore no plano Spark.

## Endereço

https://adilsonzetta.github.io/ubox-portal-franqueado/

O fluxo de publicação está em `.github/workflows/pages.yml` e roda a cada push na branch `main`. Na primeira vez, em **Settings → Pages**, a origem precisa ser **GitHub Actions**.

Enquanto o workflow não tiver rodado nessa branch, o endereço ainda não mostra esta versão.

## Firebase

Projeto: `ubox-portal-franqueado` (Firestore nativo em `southamerica-east1`).

A configuração pública do app web está em `src/firebaseConfig.ts` e já vai no build do Pages. Variáveis `VITE_FIREBASE_*` substituem esses valores quando não estão vazias. A chave do Firebase é pública por desenho; as regras do Firestore é que protegem os dados.

| Variável | Função |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Substitui a apiKey do fallback |
| `VITE_FIREBASE_AUTH_DOMAIN` | Substitui o authDomain |
| `VITE_FIREBASE_PROJECT_ID` | Substitui o projectId |
| `VITE_FIREBASE_STORAGE_BUCKET` | Substitui o storageBucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Substitui o sender id |
| `VITE_FIREBASE_APP_ID` | Substitui o appId |
| `VITE_FIREBASE_MEASUREMENT_ID` | Opcional |
| `VITE_AI_ENABLED` | IA ligada se vazia ou `true`. Use `false` para desligar |
| `VITE_AI_MODEL` | Opcional. Padrão `gemini-3.8-flash` |
| `VITE_STORAGE_ENABLED` | Deixe vazio. Storage não faz parte do Spark |
| `VITE_APPCHECK_SITE_KEY` | Opcional, reCAPTCHA v3, se o App Check passar a ser exigido pela IA |

No GitHub, cadastre isso em **Settings → Secrets and variables → Actions → Variables** (não em Secrets).

Se a configuração fosse removida, a entrada do portal mostra **Configuração do Firebase pendente** em vez de quebrar.

## Regras do Firestore

O arquivo `firestore.rules` deste repositório é a versão final para publicar. As regras que já estão no projeto precisam ser substituídas por este arquivo para o cadastro, a biblioteca e os aceites funcionarem como o app espera.

```bash
npx -y firebase-tools@latest login
npm run deploy:rules
```

O comando publica `firestore.rules` e `firestore.indexes.json` no projeto `ubox-portal-franqueado`. Os índices compostos podem levar alguns minutos para ficarem ativos.

Resumo da proteção:

- Há quatro papéis: `admin`, `equipe_franqueadora`, `franqueado` e `equipe_franqueado`.
- Só usuário ativo, de unidade ativa, lê conteúdo publicado que seja público ou esteja na lista `uids`, e só se o slug estiver em `modulosLiberados`. Sem essa lista, o usuário não vê módulo nenhum. O admin lê tudo. Franqueado antigo e ativo, sem a lista, recebe o catálogo atual com `npm run migrar-modulos`.
- Rascunho fica só com o admin da franqueadora.
- O cadastro público cria `usuarios/{uid}` como `franqueado` inativo, sem módulos. A própria pessoa não altera `papel`, `ativo` nem `modulosLiberados`.
- O admin cria unidades e a equipe da franqueadora. O franqueado só cria `equipe_franqueado` da própria unidade, com módulos que já foram liberados para ela. Usuário inativo não lê conteúdo.
- O primeiro admin sai pelo script abaixo, e só enquanto `config/adminCriado` não existe.
- Leitura, aceite, tentativa de quiz, certificado e leitura de aviso são criados pelo dono e não podem ser editados nem apagados. O aceite grava o texto `Li e concordo`, o e-mail do login e o horário do servidor, na versão publicada do documento.
- A correção do quiz é feita no navegador (plano Spark, sem Cloud Functions). A franqueadora vê as respostas e o painel recalcula a nota. Um usuário técnico pode gravar uma nota diferente; o painel marca **rever** quando isso acontece.

As nove categorias já existentes são lidas pelos ids `institucional`, `implantacao`, `operacao`, `equipe`, `marketing`, `financeiro`, `treinamento`, `suporte` e `expansao-juridico`. O seed completa os campos que o app usa sem trocar esses ids. Se o documento antigo não tiver `publico`, a regra trata a categoria como visível para usuário ativo até o seed gravar o campo.

## Primeiro acesso

1. Publique as regras (comando acima).
2. Abra o portal e crie uma conta na tela **Criar conta**. Ela fica aguardando aprovação.
3. Promova essa conta:

```bash
ADMIN_EMAIL=voce@email.com ADMIN_PASSWORD=senha npm run make-admin
```

4. Carregue as categorias (preservando o nome que já estiver lá) e os documentos de exemplo:

```bash
ADMIN_EMAIL=voce@email.com ADMIN_PASSWORD=senha npm run seed
```

`SEED_FORCE=1` regrava os documentos de exemplo. Sem isso, o seed não mexe em documento que já existe.

Franqueado que já estava ativo e ainda não tem `modulosLiberados` fica sem módulos até a migração. Ela grava o catálogo atual do franqueado só nessas contas:

```bash
ADMIN_EMAIL=voce@email.com ADMIN_PASSWORD=senha npm run migrar-modulos
```

Para desfazer a promoção no futuro, use o console do Authentication junto com o painel de usuários. O script não apaga a conta.

## O que o portal faz

- Entrada, cadastro com aprovação, recuperação de senha.
- Biblioteca em categorias, página rica (títulos, listas, tabelas, checklist, imagem por URL, vídeo), busca, impressão.
- Manual HTML interativo em quadro isolado (`sandbox`), por conteúdo ou por URL.
- Editor da franqueadora com modelos e importação de `.docx`, `.md` e `.html`.
- Visibilidade para toda a rede ou para papéis, unidades e pessoas.
- Leitura obrigatória com aceite registrado.
- Trilhas com documentos e quiz de múltipla escolha, nota mínima e certificado para imprimir.
- Painel de quem leu, aceitou e passou, mais aprovação de usuários.
- Avisos dentro do portal quando um documento é publicado ou atualizado.
- **Pergunte ao Portal**: busca nos documentos visíveis e resposta do Firebase AI Logic (Gemini Developer API), com a fonte ao lado. Se a chamada falhar, os trechos da busca continuam na tela.

Anexos são links (Google Drive, YouTube ou outra URL). Não há upload pelo Storage.

## Desenvolvimento

```bash
npm install
npm test
npm run dev
```

`npm run build` gera `dist/` com `base` `/ubox-portal-franqueado/`. As rotas usam hash (`/#/biblioteca`), então a atualização da página no Pages continua na mesma tela. O build também copia `index.html` para `404.html`.

Cores da interface: carvão `#2a2e2e`, laranja `#f37021` e verde `#9dbe2e`, as mesmas variáveis do site ubox.net.br. O logo do portal é um wordmark de texto, não o arquivo da marca.
