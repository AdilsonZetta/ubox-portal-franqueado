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
exigir(rules.includes('allow delete: if false'), 'recusa de delete ausente')


if (erros.length) {
  console.error(erros.join('\n'))
  process.exit(1)
}
console.log('firestore.rules: checagens estáticas ok')
