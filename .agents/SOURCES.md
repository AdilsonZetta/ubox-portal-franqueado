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
