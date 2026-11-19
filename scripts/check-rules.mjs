import { readFileSync } from 'node:fs'

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
const erros = []

function exigir(condicao, mensagem) {
  if (!condicao) erros.push(mensagem)
}

exigir(rules.includes("rules_version = '2'"), 'rules_version 2 ausente')
exigir(!/allow\s+read\s*:\s*if\s+true/.test(rules), 'leitura pública encontrada')
exigir(!/allow\s+write\s*:\s*if\s+true/.test(rules), 'escrita pública encontrada')
exigir(rules.includes("request.resource.data.papel == 'franqueado'"), 'cadastro não força papel franqueado')
exigir(rules.includes('request.resource.data.ativo == false'), 'cadastro não começa inativo')
exigir(rules.includes("data.texto == 'Li e concordo'"), 'aceite sem texto fixo')
exigir(rules.includes('config/adminCriado'), 'trava do primeiro admin ausente')
exigir(rules.includes('match /categorias/{id}'), 'coleção categorias ausente')
exigir(rules.includes('match /documentos/{id}'), 'coleção documentos ausente')
exigir(rules.includes('match /usuarios/{uid}'), 'coleção usuarios ausente')
exigir(rules.includes('match /aceites/{id}'), 'coleção aceites ausente')
exigir(rules.includes('match /trilhas/{id}'), 'coleção trilhas ausente')
exigir(rules.includes('match /quizzes/{id}'), 'coleção quizzes ausente')
exigir(rules.includes('match /tentativas/{id}'), 'coleção tentativas ausente')
exigir(rules.includes('match /certificados/{id}'), 'coleção certificados ausente')
exigir(rules.includes('match /chamados/{chamadoId}'), 'coleção chamados ausente')
exigir(rules.includes("data.prioridade == 'urgente' && data.slaHoras == 4"), 'SLA urgente ausente')
exigir(rules.includes("data.prioridade == 'alta' && data.slaHoras == 24"), 'SLA alta ausente')
exigir(rules.includes("data.prioridade == 'media' && data.slaHoras == 48"), 'SLA média ausente')
exigir(rules.includes("data.prioridade == 'baixa' && data.slaHoras == 72"), 'SLA baixa ausente')
exigir(rules.includes("temModulo('universidade')"), 'gabarito/tentativa sem módulo universidade')
exigir(rules.includes('reabertoEm'), 'reabertura sem reabertoEm')
exigir(rules.includes('autorNome == dados.nome'), 'evento sem conferir o nome do autor')
exigir(rules.includes('modulosCabemNaUnidade'), 'teto da unidade ausente')
exigir(rules.includes('isAdmin() || operaRede()') || rules.includes('(isAdmin() || operaRede())'), 'admin fora da fila de chamados')
exigir(rules.includes('allow update, delete: if false'), 'registros de leitura não são só de criação')
exigir(rules.includes('match /acessos/{acessoId}'), 'coleção acessos ausente')
exigir(rules.includes('match /segredo/{segredoId}'), 'subcoleção segredo ausente')
exigir(rules.includes('match /solicitacoesAcesso/{solicitacaoId}'), 'coleção solicitacoesAcesso ausente')
exigir(rules.includes("data.texto == 'Visualizou a senha.'"), 'evento de acesso sem frase oficial')
exigir(rules.includes('allow delete: if false'), 'recusa de delete ausente')

exigir(rules.includes('match /manuaisTrilha/{id}'), 'coleção manuaisTrilha ausente')
exigir(rules.includes('match /progressoManuais/{progressoId}'), 'coleção progressoManuais ausente')
exigir(rules.includes("progressoId == request.auth.uid + '_' + data.documentoId"), 'progresso sem id uid_documento')
exigir(rules.includes("duration.value(get(trilhaManualPath(resource.data.documentoId)).data.tempoMinimoSeg, 's')"), 'conclusão sem tempo mínimo no servidor')
exigir(rules.includes("get(progressoManualPath(request.auth.uid + '_' + item.anteriorId)).data.status == 'concluido'"), 'trilha sem exigir o anterior concluído')
exigir(rules.includes('getAfter(acessoPath(acessoId)).data.ultimaTrocaEm == request.time'), 'segredo sem registrar a troca no acesso')

exigir(rules.includes('match /cursos/{cursoId}'), 'coleção cursos ausente')
exigir(rules.includes('match /provas/{cursoId}'), 'coleção provas ausente')
exigir(rules.includes('match /provasGabarito/{cursoId}'), 'coleção provasGabarito ausente')
exigir(rules.includes('match /tentativasProva/{tentativaId}'), 'coleção tentativasProva ausente')
exigir(rules.includes('match /reestudos/{reestudoId}'), 'coleção reestudos ausente')
exigir(rules.includes("q.keys().hasOnly(['id', 'enunciado', 'opcoes'])"), 'pergunta pública pode carregar a resposta')
exigir(rules.includes('get(gabaritoProvaPath(resource.data.cursoId)).data'), 'correção sem ler o gabarito nas rules')
exigir(rules.includes('d.numero is int && d.numero >= 1 && d.numero <= 3'), 'tentativa sem limite de 3 chances')
{
  const bloco = rules.slice(rules.indexOf('match /provasGabarito/{cursoId}'), rules.indexOf('match /tentativasProva/{tentativaId}'))
  const leituras = bloco.split('\n').filter((linha) => linha.includes('allow read'))
  exigir(leituras.length === 1 && leituras[0].includes('gereUniversidade(userData())') && !leituras[0].includes('podeModulo'), 'gabarito da prova legível por quem não é da franqueadora')
}

{
  const ini = rules.indexOf('match /folha/{folhaId}')
  const folha = rules.slice(ini, rules.indexOf('allow update, delete: if false;', ini))
  exigir(ini > 0, 'folha de respostas ausente')
  exigir(!folha.includes('leResultadoUnidade') && !folha.includes('podeModulo'), 'folha de respostas legível pela unidade')
  const tentativa = rules.slice(rules.indexOf('function isValidTentativaProva'), rules.indexOf('function alunoConfere'))
  exigir(!tentativa.includes("'respostas'"), 'respostas voltaram para o doc da tentativa')
}
exigir(rules.includes('o[5] is string'), 'alternativas da prova sem checagem de texto')
exigir(rules.includes(': depois.aprovado == false'), 'tentativa presa quando a versão do gabarito muda')

exigir(rules.includes('match /marketingMateriais/{materialId}'), 'coleção marketingMateriais ausente')
exigir(rules.includes('match /marketingCampanhas/{campanhaId}'), 'coleção marketingCampanhas ausente')
exigir(rules.includes('match /marketingSolicitacoes/{solicitacaoId}'), 'coleção marketingSolicitacoes ausente')
exigir(rules.includes("v.matches('^https://"), 'links de marketing sem exigir https')
exigir(rules.includes('data.geradoPorIA == false || data.iaModelo.size() >= 2'), 'conteúdo com IA sem registrar o modelo')
exigir(rules.includes('data.publico == true ? data.unidades.size() == 0 : data.unidades.size() > 0'), 'material de marketing sem coerência entre público e unidades')
exigir(rules.includes('request.resource.data.complemento != resource.data.complemento'), 'resposta da unidade ao pedido de marketing sem exigir texto novo')
exigir(rules.includes('match /checklistModelos/{modeloId}'), 'coleção checklistModelos ausente')
exigir(rules.includes('match /checklistExecucoes/{execucaoId}'), 'coleção checklistExecucoes ausente')
exigir(rules.includes('data.score == math.floor(data.pontosObtidos * 100 / data.pontosPossiveis)'), 'score do checklist sem conferência nas rules')
exigir(rules.includes('(data.qtdNaoOk == 0) == (data.pontosObtidos == data.pontosPossiveis)'), 'checklist sem amarrar não conformidade aos pontos')
exigir(rules.includes("affectedKeys().hasOnly(['obsProprietario', 'obsProprietarioPor', 'obsProprietarioNome', 'obsProprietarioEm'])"), 'execução de checklist editável além da observação do proprietário')

if (erros.length) {
  console.error(erros.join('\n'))
  process.exit(1)
}
console.log('firestore.rules: checagens estáticas ok')
