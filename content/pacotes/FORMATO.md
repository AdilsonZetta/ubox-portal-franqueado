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

Tempos, notas, pesos e ordem de cursos são inteiros. Mantenha as chaves ao renomear itens. Depois da primeira gravação, a importação localiza o registro pelo vínculo entre tipo, chave e ID. Se ainda não houver vínculo, a prévia procura um registro com a identidade legada e sem vínculo com outra chave. A identidade usa nome e pai para categorias, título e tipo para documentos, título para cursos e checklists, título do manual e documento para trilha, título e curso para prova. A comparação distingue maiúsculas, minúsculas e acentos. Se houver mais de um registro elegível, a prévia usa o menor ID em ordem lexicográfica.

A importação ignora itens existentes por padrão. A opção de atualização mantém as audiências atuais e segue o versionamento dos editores. Itens com audiência restrita exigem confirmação separada. A prévia exibe a correspondência, a audiência e as URLs externas antes da gravação. A opção de rascunho altera o status dos documentos gravados nessa execução. A publicação de cursos e provas continua indicada pelos respectivos campos `publicado`.

## Gerar e verificar um pacote real

Guarde e compartilhe pacotes reais somente fora do repositório, em local de acesso restrito. Informe um caminho de saída explícito. As opções locais ignoradas pelo Git são `pacotes-gerados/` e arquivos `content/pacotes/*.real.json`.

```sh
node scripts/gerar-pacote-conteudo.mjs <diretório-origem> /caminho/privado/ubox.real.json
node scripts/verificar-pacote.mjs /caminho/privado/ubox.real.json
```

O gerador embaralha as alternativas por padrão e atualiza o índice `correta`. Use `--embaralhar` para indicar esse comportamento explicitamente ou `--no-embaralhar` para manter a ordem da origem. O verificador retorna código 1 se encontrar conteúdo exclusivo da franqueadora.

O [exemplo mínimo](./exemplo-minimo.json) contém dados sintéticos. Os JSONs versionados em `content/` devem ficar livres do campo `correta`.
