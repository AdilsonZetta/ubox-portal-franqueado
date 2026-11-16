# Instruções para agentes — Portal do Franqueado Ubox

Este arquivo é a política do repositório para Cursor, Codex e Gemini CLI. Foi preparado por Grok Bot e atualizado quando novas skills de construção de sistema foram adicionadas.

Interface e textos do produto ficam em **português do Brasil**.

## Visão do projeto

- SPA **React + Vite + TypeScript**, publicada no GitHub Pages em `https://adilsonzetta.github.io/ubox-portal-franqueado/`.
- Rotas em hash (`/#/biblioteca`) com `base` `/ubox-portal-franqueado/`.
- Firebase projeto `ubox-portal-franqueado`, plano **Spark apenas**, Firestore em `southamerica-east1`.
- Auth com e-mail e senha. Sem Cloud Functions. Sem upload pelo Storage.
- Quatro papéis: `admin`, `equipe_franqueadora`, `franqueado`, `equipe_franqueado`.
- Módulos são fail-closed: sem `modulosLiberados`, o usuário não vê módulo nenhum.

## Skills — quando usar

As skills deste repositório estão em `.agents/skills/<nome>/SKILL.md`. Leia a skill indicada antes de projetar, implementar ou revisar o que ela cobre.

| Quando | Skill |
| --- | --- |
| Criar ou revisar qualquer tela, componente, dashboard ou estado de UI | `ubox-design`, `frontend-design`, `web-design-guidelines` |
| Escrever ou refatorar componentes React, dados no cliente, bundle, re-render | `vercel-react-best-practices` (veja a ressalva abaixo) |
| APIs de componentes, props booleanas, composição, React 19 | `vercel-composition-patterns` |
| Planejar um módulo ou mudança maior antes de codar | `writing-plans` |
| Implementar comportamento novo | `test-driven-development` |
| Bug, teste falhando ou comportamento inesperado | `systematic-debugging` |
| Antes de declarar pronto, commit ou PR | `verification-before-completion` |
| Revisar um diff ou PR | `code-review-and-quality` |
| Simplificar código que já funciona | `code-simplification` |
| Investigar lentidão com medição (não chute) | `performance-optimization` |
| Documentar decisão de arquitetura ou o “porquê” | `documentation-and-adrs` |
| Modelar dados, consultas ou índices do Firestore | `firebase-firestore` |
| Escrever ou alterar `firestore.rules` | `firestore-rules-creation` |
| Auditar regras de segurança | `firebase-security-rules-auditor` |
| Auth (o projeto já usa e-mail e senha) | `firebase-auth-basics` |
| IA do portal (Gemini Developer API / AI Logic) | `firebase-ai-logic-basics` |
| Revisão de segurança de frontend pedida pelo usuário | `security-best-practices` |

Ressalva React: `vercel-react-best-practices` mistura React e Next.js. Este projeto **não é Next.js** e não tem RSC/SSR. Aplique regras gerais de React (bundle, re-render, fetch no cliente, JS). Ignore `next/dynamic`, Server Actions, `after()`, caches de RSC e afins. A mesma ressalva vale para trechos só de Next.js em `performance-optimization`.

Ressalva Firebase: as skills oficiais às vezes ensinam a criar banco Enterprise, publicar regras, `init ailogic` ou subir para Blaze. Neste repositório isso está **proibido** sem pedido explícito do Adilson. O projeto `ubox-portal-franqueado` já existe, no plano Spark. Leia `UBOX-CONSTRAINTS.md` dentro da skill. Altere regras no repo e rode os testes; quem publica é o operador. Não crie `docs/superpowers/` só porque a skill `writing-plans` sugere essa pasta: descreva o plano no PR ou onde o Adilson pedir.

## Qualidade visual (obrigatório)

O feedback atual é que o sistema está simples demais. Cada módulo novo e cada correção de tela devem sair com acabamento de produto, não de protótipo.

- Siga `src/index.css`: `--color-paper` `#f6f7fb`, `--color-ink` `#10163a`, `--color-ink-soft` `#3d4663`, `--color-brand` `#f37021`, `--color-brand-dark` `#d85a10`, `--color-lime` `#9dbe2e`, `--color-lime-dark` `#5c7a12`, `--color-line` `#e6e8f2`, fonte Inter.
- Não troque paleta nem tipografia sem pedido explícito. Eleve o visual **dentro** da marca.
- Telas consistentes: cards, tabelas, filtros, tipografia e espaçamento iguais em todos os módulos.
- Toda lista ou painel tem estado de carregamento, vazio e erro, em português, com próxima ação.
- Layout responsivo e acessível (teclado, foco visível, labels, contraste, `prefers-reduced-motion`).
- Dashboard com indicadores úteis, não números decorativos.
- Evite estética genérica de IA (ver `frontend-design` e `ubox-design`).

## Convenções que não podem quebrar

- Não migrar o projeto para Lovable nem para outra plataforma de app hosted.
- Não subir o Firebase para Blaze, não ligar faturamento e não ativar Storage/Functions sem o Adilson pedir.
- Não alterar o compartilhamento do Google Drive sem autorização.
- Não imprimir, registrar nem commitar segredos (`FIREBASE_AUTH_CODE`, senhas, tokens).
- A chave pública do app Firebase pode ir no build; quem protege os dados são as regras do Firestore.
- Cadastro público cria `franqueado` inativo com `modulosLiberados: []`. A pessoa não altera `papel`, `ativo` nem `modulosLiberados`.
- Regras em `firestore.rules` precisam continuar testáveis (`npm test` / `tests/regras.mjs`). Não use `--force` no deploy de índices.
- O operador do projeto publica as regras; não peça isso ao dono da conta como se fosse um passo dele, e não faça upgrade de plano.

## Comandos

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

`npm test` roda checagem de regras, Vitest e o emulador do Firestore (precisa de Java). Se o emulador não puder rodar neste ambiente, execute pelo menos o typecheck, o Vitest que não depende do emulador e explique a limitação.

## Código

- TypeScript estrito, componentes em `src/`.
- Reaproveite componentes e padrões já existentes antes de criar bibliotecas novas.
- Textos da UI em pt-BR.
- Depois de mudar UI ou regras, rode os testes cabíveis (`verification-before-completion`) e descreva o que ficou de fora.
- Preferência: teste que falha, depois o código mínimo, no estilo do Vitest e de `tests/regras.mjs` já existentes.
