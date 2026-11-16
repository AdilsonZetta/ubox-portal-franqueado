---
name: ubox-design
description: Sistema visual e de acabamento do Portal do Franqueado Ubox. Use ao criar ou revisar telas, componentes, dashboards, estados vazios, carregamento, erro, tabelas, filtros, formulários e qualquer UI do portal.
---

# Design do Portal do Franqueado Ubox

Você é o responsável pelo acabamento visual deste produto. O portal não pode parecer um template genérico de IA nem um CRUD simples. Ele é o sistema operacional da rede Ubox Self Storage (Uberaba/MG): sério, premium e consistente de um módulo para o outro.

Este arquivo foi preparado por Grok Bot.

## Produto e audiência

- Público: franqueadora, franqueados e equipes, em português do Brasil.
- Trabalho principal: operar a unidade e a rede (biblioteca, chamados, gestão de pessoas, indicadores, checklists, estoque, etc.).
- Tom: confiável, claro, profissional. Sem linguagem de startup genérica, sem inglês na interface, sem rótulos técnicos no lugar de palavras de negócio.

## Sistema visual (já existe — não invente outra marca)

Siga as variáveis de `src/index.css`. Não troque a paleta nem a fonte sem o Adilson pedir.

- Fundo: `--color-paper` `#f6f7fb`
- Texto: `--color-ink` `#10163a` e `--color-ink-soft` `#3d4663`
- Ação principal / marca: `--color-brand` `#f37021` e `--color-brand-dark` `#d85a10`
- Destaque positivo / sucesso: `--color-lime` `#9dbe2e` e `--color-lime-dark` `#5c7a12`
- Linhas e divisórias: `--color-line` `#e6e8f2`
- Fonte: Inter (`--font-sans`). Não troque por outra família. Use uma escala tipográfica deliberada (tamanhos, pesos e espaçamento) para dar hierarquia.
- O logo do portal é um wordmark de texto, não o arquivo da marca.

Eleve o visual dentro dessa identidade: densidade profissional de um dashboard de rede, não uma landing colorida nem um admin cinza sem personalidade.

## O que cada tela precisa ter

- Hierarquia clara: título da página, contexto (unidade, período, filtro) e ação primária no lugar óbvio.
- Cards, tabelas e listas com o mesmo raio, borda, sombra e espaçamento do restante do portal. Não crie um visual novo a cada módulo.
- Dados reais e úteis no lugar de números decorativos. Evite o padrão genérico "número enorme + label pequena + gradiente".
- Filtros, busca e ordenação alinhados, com estados visíveis (ativo, vazio, inválido).
- Responsivo: utilizável no desktop e no celular, com alvos de toque adequados.
- Acessível: HTML semântico, teclado, foco visível (`:focus-visible`), labels em campos, `aria-label` em botão só com ícone, contraste suficiente.

## Estados obrigatórios

Toda lista, painel ou formulário que busca dados precisa dos três estados, com o mesmo padrão do portal:

1. **Carregamento**: skeleton ou indicador estável; evite flicker (atraso curto para exibir e tempo mínimo visível). Preserve o layout.
2. **Vazio**: explique o que falta e a próxima ação (ex.: "Nenhum chamado aberto. Abrir chamado.").
3. **Erro**: diga o que aconteceu em português e ofereça tentar de novo. Não mostre stack trace.

Ações destrutivas pedem confirmação ou uma forma segura de desfazer. Botão que dispara pedido de rede mostra que está processando e não deve ser clicado de novo.

## O que evitar

- Visual de "AI slop": acento em uma só palavra do título, labels em caixa alta só por estilo, marcadores 01/02/03 quando não há sequência, fade-and-slide em todo card, roxo/gradiente genérico, hero com número enorme sem motivo.
- Inventar cores, fontes ou um design system paralelo.
- Deixar tela "crua" (só tabela sem padding, sem estado vazio, sem ação primária).
- Copiar padrões de Next.js que este projeto não usa. Isto é uma SPA React + Vite no GitHub Pages, com rotas em hash.

## Processo

1. Leia também as skills `frontend-design` e `web-design-guidelines` quando for criar ou revisar UI.
2. Reaproveite componentes já existentes antes de criar outros.
3. Ao terminar uma tela, critique: ela parece um produto Ubox pronto para franqueado usar, ou um protótipo simples? Se parecer protótipo, ajuste antes de entregar.
