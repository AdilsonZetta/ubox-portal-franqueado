# Origem das skills instaladas

Cópia de trabalho preparada por Grok Bot em 16 de novembro de 2026 (America/Sao_Paulo). Só foram instalados arquivos de instrução em markdown (e as licenças). Nenhum script de instalação de terceiros foi executado.

| Skill | Origem | Licença | Por quê |
| --- | --- | --- | --- |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) (`skills/frontend-design`, rev. 41bbe19d1a1a) | Apache-2.0 | Evitar visual genérico de IA e exigir escolhas de design deliberadas. |
| `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) + guidelines de [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) (command.md rev. 4ecfb9fb8d1d) | MIT | Auditoria de acessibilidade, formulários, foco, UX e desempenho de interface. |
| `vercel-react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (`skills/react-best-practices`) | MIT | Boas práticas de React (bundle, re-render, fetch). Ignorar regras só de Next.js. |
| `vercel-composition-patterns` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (`skills/composition-patterns`) | MIT | Composição de componentes e APIs que escalam; inclui React 19. |
| `security-best-practices` | [openai/skills](https://github.com/openai/skills) (catálogo marcado como deprecated; skill curated Apache-2.0, rev. 5c8f1e26803b) | Apache-2.0 | Revisão segura para frontend React/TypeScript. Só o guia desse stack foi copiado. |
| `ubox-design` | Escrita para este repositório | Original | Identidade, estados e nível de acabamento da Ubox. |

Cada pasta em `.agents/skills/<nome>/` tem um `SOURCE.txt` e o arquivo de licença correspondente.

Não foi instalado o pacote inteiro do [PatrickJS/awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) (CC0): é uma lista enorme de qualidade irregular. Também não foram copiados scripts (por exemplo `webapp-testing` da Anthropic, o wrapper do Playwright do catálogo OpenAI, ou o `install.sh` das guidelines da Vercel).

## Segunda leva (construção de sistema, 16 nov 2026, America/Sao_Paulo)

Prepared by Grok Bot. De novo: só markdown e licenças; nenhum script de instalação foi executado.

| Skill | Origem | Licença | Por quê |
| --- | --- | --- | --- |
| `test-driven-development` | [obra/superpowers](https://github.com/obra/superpowers) (`skills/test-driven-development`, HEAD 22f0b463e7a5, v7.0.2) | MIT | TDD vermelho-verde-refatore e o guia de bons testes, alinhado ao Vitest do repo. |
| `systematic-debugging` | [obra/superpowers](https://github.com/obra/superpowers) | MIT | Depuração pela causa raiz, não por correção de sintoma. Script `find-polluter.sh` omitido. |
| `verification-before-completion` | [obra/superpowers](https://github.com/obra/superpowers) | MIT | Só declarar pronto com evidência de teste/verificação. |
| `writing-plans` | [obra/superpowers](https://github.com/obra/superpowers) | MIT | Quebrar módulos em tarefas pequenas, com arquivos e critérios de teste. |
| `firebase-firestore` | [firebase/agent-skills](https://github.com/firebase/agent-skills) (HEAD 99954a30898b) | Apache-2.0 | Modelagem, consultas e índices. Com sobreposição Ubox: não criar banco nem mudar plano. |
| `firestore-rules-creation` | [firebase/agent-skills](https://github.com/firebase/agent-skills) | Apache-2.0 | Autoria de `firestore.rules` fail-closed. Publicação fica com o operador. |
| `firebase-security-rules-auditor` | [firebase/agent-skills](https://github.com/firebase/agent-skills) | Apache-2.0 | Auditoria red-team das regras (escalonamento, update bypass, tipos). |
| `firebase-auth-basics` | [firebase/agent-skills](https://github.com/firebase/agent-skills) | Apache-2.0 | Padrões de Auth no cliente web. Não trocar o login já existente nem fazer `deploy --only auth`. |
| `firebase-ai-logic-basics` | [firebase/agent-skills](https://github.com/firebase/agent-skills) | Apache-2.0 | IA do portal no Gemini Developer API. Não migrar para Vertex/Blaze nem rodar `init ailogic`. |
| `code-review-and-quality` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (HEAD 39b723ceebf8, 0.6.16) | MIT | Revisão por eixos de qualidade e gravidade. |
| `code-simplification` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | MIT | Refatorar para clareza sem mudar comportamento. |
| `performance-optimization` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | MIT | Medir antes de otimizar (Core Web Vitals, bundle). Ignorar conselhos só de Next.js. |
| `documentation-and-adrs` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | MIT | Documentação e decisões de arquitetura. |

Considerados e não instalados nesta leva: o pacote inteiro do [trailofbits/skills](https://github.com/trailofbits/skills) (CC-BY-SA-4.0; muitas skills são de C/Rust/Actions); [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) foi usado só como índice; `spec-driven-development` do Addy (fica coberto por `writing-plans`); skills de Firebase Hosting, App Hosting, Data Connect, Functions e Crashlytics (não cabem neste SPA no Pages/Spark). Não há skill oficial enxuta só de TypeScript ou de Vitest; o TDD do Superpowers cobre o fluxo de teste do repo.
