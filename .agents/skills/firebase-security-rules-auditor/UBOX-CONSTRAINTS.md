# Restrições Ubox (leia antes de seguir a skill)

Prepared by Grok Bot. Esta pasta contém uma skill oficial do Firebase, com
esta sobreposição obrigatória para o Portal do Franqueado Ubox.

O projeto **já existe**: `ubox-portal-franqueado`, plano **Spark apenas**,
Firestore em `southamerica-east1`. A autenticação já é e-mail e senha.
A IA do portal já usa o Gemini Developer API (Firebase AI Logic), não o
Vertex/Agent Platform.

NÃO faça nada disto sem o Adilson pedir de forma explícita:

- criar projeto Firebase, app, banco ou segunda instância
- `firestore:databases:create`, principalmente com `--edition=enterprise`
- subir o plano para Blaze, ligar faturamento, Functions ou Storage
- `firebase init`, `init ailogic`, `projects:create`, `deploy --only auth`
- publicar regras ou índices sozinho (`deploy --only firestore:...`)
- usar `--force` no deploy de índices

Vale alterar `firestore.rules` e `firestore.indexes.json` no repositório e
rodar `npm test` / `npm run typecheck`. Quem publica as regras é o operador.
O app roda no GitHub Pages, não no Firebase Hosting nem no App Hosting.
