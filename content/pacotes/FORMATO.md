<!-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota). -->

# Pacote de conteúdo Ubox v1

Use JSON UTF-8 de até 5 MB (5 × 1.024² bytes). Na raiz, informe `formato: "ubox-pacote-conteudo"`, `versao: 1`, `titulo` de 1–120 caracteres, `geradoEm` em ISO 8601 com segundos e fuso e as cinco listas `categorias`, `documentos`, `trilha`, `cursos` e `checklists`. Listas sem itens devem ser `[]`. Informe somente os campos documentados. Cada `chave` segue `^[a-z0-9][a-z0-9-]{1,79}$` e é única em todo o pacote, inclusive nas provas. Referências apontam para chaves do próprio pacote.

| Registro | Campos e limites |
| --- | --- |
| Categoria | `chave`, `nome` (2–120), `descricao` (até 600), `ordem` (número finito), `publico: true`, `parent` opcional (chave de categoria ou `null`). A hierarquia deve ser acíclica. |
| Documento | `chave`, `titulo` (2–120), `categoria` (chave), `tipo`, `formato`, `status` (`rascunho` ou `publicado`), `publico: true`. Opcionais: `leituraObrigatoria` (booleano, padrão `false`) e `anexos` (até 30 objetos com `nome`, `url`, `tipo` igual a `link`, `drive` ou `video`). |
| Conteúdo do documento | `manual` e `pop` usam `formato: "richtext"` e podem informar `conteudoHtml` (até 800.000 caracteres). `tipo: "html"` usa `formato: "html"` e exige `htmlConteudo` (até 300 KB, 300 × 1.024 bytes) ou `htmlUrl`. URLs de anexos e de interativos devem ser HTTPS e ter até 600 caracteres. HTML, texto pesquisável e anexos precisam caber no limite de 1 MiB do registro, com espaço para metadados. |
| Item da trilha | `chave`, `documento` (chave), `etapa` (até 80), `tempoMinimoSeg` (30–14.400), `videoMinutos` (0–600), `ativo` (booleano). Um item por documento, até 450 na trilha. A ordem segue a lista do pacote para itens novos, preservando a ordem relativa dos existentes. |
| Curso | `chave`, `titulo` (2–120), `descricao` (1–1.000), `ordem` (1–999), `aulas` (até 20 chaves de documentos diferentes em ordem), `publicado` (booleano) e `prova` opcional. Inclua na trilha os documentos usados como aulas para que as unidades possam concluí-los. |
| Prova | `chave`, `titulo` (2–120), `notaMinima` (1–100), `manualRetorno` (chave de documento), `tempoReestudoSeg` (30–14.400), `publicado` (booleano), `perguntas` (1–20). Cada pergunta tem `id` único na prova (1–40), `enunciado` (1–600), `opcoes` (2–6 textos de 1–300) e `correta` (um único índice inteiro, começando em zero). |
| Checklist | `chave`, `titulo` (2–120), `descricao` (até 1.000), `tipo` (`abertura`, `fechamento`, `limpeza`, `inauguracao`, `vistoria`, `outro`), `frequencia` (`diaria`, `semanal`, `mensal`, `avulsa`), `publico: true`, `ativo` (booleano), `itens` (1–60). Cada item tem `id` único no modelo (1–80), `texto` (2–300), `secao` (até 60), `peso` (1–10), `exigeEvidencia` e `exigeObs` (booleanos). `geradoPorIA` e `iaModelo` são opcionais. Se `geradoPorIA` for `true`, informe `iaModelo` (2–80). |

Tempos, notas, pesos e ordem de cursos são inteiros. Nomes e títulos são comparados após remover espaços nas pontas do valor do pacote, com distinção entre maiúsculas, minúsculas e acentos. A correspondência usa nome e pai para categorias, título e tipo para documentos, título para cursos e checklists, documento para trilha e curso para prova. Evite repetir identidades no pacote. Se a base já tiver mais de um registro com a mesma identidade, a prévia usa o menor ID em ordem lexicográfica.

A importação ignora itens existentes por padrão. A opção de atualização usa os IDs encontrados e segue o versionamento dos editores. Se gravar um curso e a prova falhar, a próxima importação reconhece o curso e tenta gravar a prova ausente. A opção de rascunho altera o status dos documentos gravados nessa execução. A publicação de cursos e provas continua indicada pelos respectivos campos `publicado`.

O arquivo de exemplo contém dados sintéticos. O gabarito do pacote é material administrativo. Guarde o arquivo em local de acesso restrito quando contiver respostas reais.

[Exemplo mínimo](./exemplo-minimo.json)
