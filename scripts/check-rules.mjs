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
exigir(rules.includes('allow update, delete: if false'), 'registros de leitura não são só de criação')

if (erros.length) {
  console.error(erros.join('\n'))
  process.exit(1)
}
console.log('firestore.rules: checagens estáticas ok')
