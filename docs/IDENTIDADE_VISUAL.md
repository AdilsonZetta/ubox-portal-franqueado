# Identidade visual UBOX no portal

Fonte: *Guia da Marca UBOX* (Solano, dezembro de 2024, `Manual da Marca Ubox.pdf`) e `Logotipo Ubox.pdf`.

## Cores (Guia, p. 14 — 2.1 Paleta de Cores)

| Papel no guia | Hex | Uso no portal |
|---|---|---|
| Verde (principal) | `#A2BD2B` | `--color-lime`: destaques, item ativo do menu (com texto `#23292A`, contraste 6,9:1), barras de progresso |
| Laranja (principal) | `#E95F0C` | `--color-brand-vivid`: símbolo, ícones, contornos de foco, textura, títulos grandes. **Não** usar com texto pequeno branco (3,4:1) |
| Cinza escuro (principal) | `#23292A` | `--color-ink`: títulos e texto; fundo do menu lateral e dos painéis de marca |
| Verde claro (secundária) | `#C8DD66` | `--color-lime-soft`: fundos de selo/tag, texto sobre grafite |
| Laranja claro (secundária) | `#F8A879` | `--color-brand-soft`: realces, texto sobre grafite |
| Cinza grafite (secundária) | `#4E5A5B` | `--color-ink-soft`: parágrafos (guia: "Cinza grafite para parágrafos") |
| Cinza claro (secundária) | `#CBCFD1` | `--color-line-strong`: bordas de campos, texto sobre grafite |
| Branco (secundária) | `#FFFFFB` | `--color-surface`: cartões e superfícies; texto sobre grafite |

Tons derivados só para acessibilidade (WCAG AA 4,5:1 em texto normal):

| Token | Hex | Motivo |
|---|---|---|
| `--color-brand` | `#B84A08` | Laranja da marca escurecido para botões (texto branco 5,2:1) e links (≥4,5:1 em todas as superfícies claras) |
| `--color-brand-dark` | `#A84508` | Hover/pressionado |
| `--color-lime-dark` | `#5E7314` | Verde para texto sobre fundo claro (5,3:1) |
| `--color-muted` | `#5C6869` | Texto auxiliar pequeno |
| `--color-paper` | `#F7F8F4` | Fundo da aplicação (derivado de `#FFFFFB`) |
| `--color-line` | `#E3E6E0` | Divisórias |

## Tipografia (Guia, p. 15 — 2.2 Fontes)

- Títulos: **Poppins Bold** (700).
- Parágrafos: **Poppins Light** (300) — aplicada a parágrafos de leitura (documentos, textos de apoio ≥ 15 px). Rótulos, botões, menus e textos pequenos usam Poppins Regular/Medium/SemiBold (400–600) para manter a legibilidade em tela.

## Marca (Guia, pp. 5–12)

- Principal em fundo claro (p. 5) e em fundo escuro (p. 6): `src/assets/marca/ubox-logo.svg`, `ubox-logo-fundo-escuro.svg` (vetores extraídos de `Logotipo Ubox.pdf`).
- Horizontal (p. 7): `ubox-logo-horizontal.svg`. Símbolo (p. 8, favicon e espaços pequenos): `ubox-simbolo.svg`, `public/favicon.svg`.
- Área de proteção (p. 10): 2x ao redor do logotipo, 1x ao redor do símbolo — respeitada com padding mínimo.
- Altura mínima (p. 11): marca principal 25 px; símbolo e horizontal 15 px.
- Usos incorretos (p. 12): não esticar, não usar contorno, não usar cores fora da paleta, não rotacionar, não aplicar sobre fundo complexo.

## Texturas (Guia, p. 16 — 2.3 Texturas)

Mosaico de blocos geométricos (quadrados, meias-luas, listras, pontos, triângulos, fechadura). No portal: faixa colorida nas laterais/rodapé dos painéis de marca (login e destaque do início) e versão em linha, em baixa opacidade, como fundo. O SVG repete seis blocos quadrados, dimensionados pela altura da faixa. A versão em linha usa os mesmos motivos em contornos.

## Tom

Direto, acolhedor e prático ("Armazenamento de objetos para otimizar o seu espaço", p. 22). Textos da interface em pt-BR, frases curtas.

## Referências de código aberto

- **shadcn/ui (MIT)** — estrutura do estado vazio, dimensões dos selos e hierarquia dos cartões de métricas. [Repositório shadcn/ui](https://github.com/shadcn-ui/ui)
- **Tremor (Apache-2.0)** — composição da barra de progresso com faixa, preenchimento e legenda opcional. [Repositório Tremor](https://github.com/tremorlabs/tremor)
- **TailAdmin Free React Dashboard (MIT)** — disposição do ícone, rótulo e valor nos cartões de métricas. [Repositório TailAdmin](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard)
- **shadcn-admin (MIT)** — altura dos botões da navegação lateral, com os grupos, estados ativos e guias de submenu já usados no portal. [Repositório shadcn-admin](https://github.com/satnaing/shadcn-admin)
