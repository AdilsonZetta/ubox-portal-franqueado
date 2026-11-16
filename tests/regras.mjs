import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'

const criado = new Date('2026-01-01T00:00:00.000Z')
const falhas = []

function usuario(uid, extra = {}) {
  const dados = {
    uid,
    email: extra.email ?? `${uid}@ubox.test`,
    nome: extra.nome ?? 'Pessoa Teste',
    papel: extra.papel ?? 'franqueado',
    ativo: extra.ativo ?? true,
    recusado: false,
    unidade: extra.unidade ?? 'Uberaba Centro',
    cidade: extra.cidade ?? 'Uberaba',
    criadoPor: extra.criadoPor ?? 'admin-1',
    criadoEm: extra.criadoEm ?? criado,
    atualizadoEm: extra.atualizadoEm ?? criado,
  }
  if (extra.semUnidadeId) return dados
  dados.unidadeId = extra.unidadeId === undefined ? null : extra.unidadeId
  if (!extra.semModulos) dados.modulosLiberados = extra.modulos ?? ['manuais']
  return dados
}

async function caso(nome, promessa) {
  try {
    await promessa
    console.log(`ok  ${nome}`)
  } catch (erro) {
    falhas.push(nome)
    console.error(`falhou  ${nome}`)
    console.error(erro instanceof Error ? erro.message : erro)
  }
}

const ambiente = await initializeTestEnvironment({
  projectId: 'demo-ubox',
  firestore: {
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
})

await ambiente.withSecurityRulesDisabled(async (contexto) => {
  const banco = contexto.firestore()
  await setDoc(doc(banco, 'usuarios', 'admin-1'), {
    uid: 'admin-1',
    email: 'admin@ubox.test',
    nome: 'Admin Rede',
    papel: 'admin',
    ativo: true,
    recusado: false,
    unidade: 'Franqueadora',
    cidade: 'Uberaba',
    criadoEm: criado,
    atualizadoEm: criado,
  })
  await setDoc(doc(banco, 'config', 'adminCriado'), { uid: 'admin-1', email: 'admin@ubox.test', criadoEm: criado })
  await setDoc(doc(banco, 'unidades', 'un-1'), {
    nome: 'Uberaba Centro',
    cidade: 'Uberaba',
    responsavel: 'Dono Um',
    email: 'fr-1@ubox.test',
    uid: 'fr-1',
    modulosLiberados: ['manuais', 'universidade'],
    ativo: true,
    criadoPor: 'admin-1',
    criadoEm: criado,
    atualizadoEm: criado,
  })
  await setDoc(doc(banco, 'unidades', 'un-2'), {
    nome: 'Outra',
    cidade: 'Uberaba',
    responsavel: 'Dono Dois',
    email: 'fr-2@ubox.test',
    uid: 'fr-2',
    modulosLiberados: ['manuais'],
    ativo: true,
    criadoPor: 'admin-1',
    criadoEm: criado,
    atualizadoEm: criado,
  })
  await setDoc(doc(banco, 'unidades', 'un-off'), {
    nome: 'Parada',
    cidade: 'Uberaba',
    responsavel: 'Dono Off',
    email: 'fr-off@ubox.test',
    uid: 'fr-off',
    modulosLiberados: ['manuais'],
    ativo: false,
    criadoPor: 'admin-1',
    criadoEm: criado,
    atualizadoEm: criado,
  })
  await setDoc(doc(banco, 'usuarios', 'fr-1'), usuario('fr-1', { unidadeId: 'un-1', modulos: ['manuais', 'universidade'], nome: 'Dono Um' }))
  await setDoc(doc(banco, 'usuarios', 'fr-2'), usuario('fr-2', { unidadeId: 'un-2', modulos: ['manuais'], nome: 'Dono Dois' }))
  await setDoc(doc(banco, 'usuarios', 'fr-legado'), usuario('fr-legado', { semModulos: true, semUnidadeId: true, nome: 'Legado' }))
  await setDoc(doc(banco, 'usuarios', 'fr-off'), usuario('fr-off', { unidadeId: 'un-off', modulos: ['manuais'], nome: 'Dono Off' }))
  await setDoc(doc(banco, 'usuarios', 'fr-inativo'), usuario('fr-inativo', { ativo: false, unidadeId: 'un-1', modulos: ['manuais'] }))
  await setDoc(doc(banco, 'usuarios', 'eq-rede'), usuario('eq-rede', { papel: 'equipe_franqueadora', modulos: ['manuais'], unidade: 'Franqueadora', unidadeId: null }))
  await setDoc(doc(banco, 'usuarios', 'eq-rede-vazio'), usuario('eq-rede-vazio', { papel: 'equipe_franqueadora', modulos: [], unidade: 'Franqueadora', unidadeId: null }))
  await setDoc(doc(banco, 'usuarios', 'eq-1'), usuario('eq-1', { papel: 'equipe_franqueado', unidadeId: 'un-1', modulos: ['manuais'], criadoPor: 'fr-1' }))
  await setDoc(doc(banco, 'usuarios', 'eq-sem'), usuario('eq-sem', { papel: 'equipe_franqueado', unidadeId: 'un-1', modulos: [], criadoPor: 'fr-1' }))
  await setDoc(doc(banco, 'documentos', 'pub'), { titulo: 'Abertura', status: 'publicado', publico: true, uids: [] })
})

const admin = ambiente.authenticatedContext('admin-1', { email: 'admin@ubox.test' }).firestore()
const dono = ambiente.authenticatedContext('fr-1', { email: 'fr-1@ubox.test' }).firestore()
const outro = ambiente.authenticatedContext('fr-2', { email: 'fr-2@ubox.test' }).firestore()
const legado = ambiente.authenticatedContext('fr-legado', { email: 'fr-legado@ubox.test' }).firestore()
const parado = ambiente.authenticatedContext('fr-off', { email: 'fr-off@ubox.test' }).firestore()
const inativo = ambiente.authenticatedContext('fr-inativo', { email: 'fr-inativo@ubox.test' }).firestore()
const equipeRede = ambiente.authenticatedContext('eq-rede', { email: 'eq-rede@ubox.test' }).firestore()
const equipeVazio = ambiente.authenticatedContext('eq-rede-vazio', { email: 'eq-rede-vazio@ubox.test' }).firestore()
const equipe = ambiente.authenticatedContext('eq-1', { email: 'eq-1@ubox.test' }).firestore()
const equipeSem = ambiente.authenticatedContext('eq-sem', { email: 'eq-sem@ubox.test' }).firestore()
const manual = doc(admin, 'documentos', 'pub')

await caso('admin lê manual publicado', assertSucceeds(getDoc(doc(admin, 'documentos', 'pub'))))
await caso('franqueado com manuais lê o manual', assertSucceeds(getDoc(doc(dono, 'documentos', 'pub'))))
await caso('franqueado legado sem lista ainda lê o manual', assertSucceeds(getDoc(doc(legado, 'documentos', 'pub'))))
await caso('equipe da franqueadora com manuais lê o manual', assertSucceeds(getDoc(doc(equipeRede, 'documentos', 'pub'))))
await caso('equipe da franqueadora sem manuais não lê o manual', assertFails(getDoc(doc(equipeVazio, 'documentos', 'pub'))))
await caso('equipe da unidade com manuais lê o manual', assertSucceeds(getDoc(doc(equipe, 'documentos', 'pub'))))
await caso('equipe da unidade sem manuais não lê o manual', assertFails(getDoc(doc(equipeSem, 'documentos', 'pub'))))
await caso('inativo não lê o manual', assertFails(getDoc(doc(inativo, 'documentos', 'pub'))))
await caso('unidade desativada não lê o manual', assertFails(getDoc(doc(parado, 'documentos', 'pub'))))
await caso('inativo não lê outro usuário', assertFails(getDoc(doc(inativo, 'usuarios', 'fr-1'))))

await caso('franqueado não vira admin', assertFails(updateDoc(doc(dono, 'usuarios', 'fr-1'), { papel: 'admin', atualizadoEm: serverTimestamp() })))
await caso('franqueado não amplia os próprios módulos', assertFails(updateDoc(doc(dono, 'usuarios', 'fr-1'), { modulosLiberados: ['manuais', 'universidade', 'crm'], atualizadoEm: serverTimestamp() })))
await caso('franqueado atualiza o próprio nome', assertSucceeds(updateDoc(doc(dono, 'usuarios', 'fr-1'), { nome: 'Dono Um Editado', atualizadoEm: serverTimestamp() })))
await caso('equipe não amplia os próprios módulos', assertFails(updateDoc(doc(equipe, 'usuarios', 'eq-1'), { modulosLiberados: ['manuais', 'crm'], atualizadoEm: serverTimestamp() })))
await caso('equipe não muda o próprio papel', assertFails(updateDoc(doc(equipe, 'usuarios', 'eq-1'), { papel: 'franqueado', atualizadoEm: serverTimestamp() })))

await caso('admin cria unidade', assertSucceeds(setDoc(doc(admin, 'unidades', 'un-nova'), {
  nome: 'Nova Unidade',
  cidade: 'Uberaba',
  responsavel: 'Nova Pessoa',
  email: 'nova@ubox.test',
  uid: null,
  modulosLiberados: ['manuais'],
  ativo: true,
  criadoPor: 'admin-1',
  criadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
})))
await caso('franqueado não cria unidade', assertFails(setDoc(doc(dono, 'unidades', 'un-proibida'), {
  nome: 'Proibida',
  cidade: 'Uberaba',
  responsavel: 'Dono Um',
  email: 'x@ubox.test',
  uid: null,
  modulosLiberados: ['manuais'],
  ativo: true,
  criadoPor: 'fr-1',
  criadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
})))
await caso('equipe da franqueadora não cria unidade', assertFails(setDoc(doc(equipeRede, 'unidades', 'un-equipe'), {
  nome: 'Equipe',
  cidade: 'Uberaba',
  responsavel: 'Equipe',
  email: 'e@ubox.test',
  uid: null,
  modulosLiberados: ['manuais'],
  ativo: true,
  criadoPor: 'eq-rede',
  criadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
})))

function novoUsuario(uid, extra) {
  return {
    ...usuario(uid, extra),
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  }
}

await caso('admin cria franqueado', assertSucceeds(setDoc(doc(admin, 'usuarios', 'fr-novo'), novoUsuario('fr-novo', { papel: 'franqueado', unidadeId: 'un-nova', modulos: ['manuais'], criadoPor: 'admin-1' }))))
await caso('admin cria equipe da franqueadora', assertSucceeds(setDoc(doc(admin, 'usuarios', 'eq-nova'), novoUsuario('eq-nova', { papel: 'equipe_franqueadora', unidade: 'Franqueadora', unidadeId: null, modulos: ['marketing'], criadoPor: 'admin-1' }))))
await caso('admin não promove alguém a admin', assertFails(updateDoc(doc(admin, 'usuarios', 'fr-2'), { papel: 'admin', atualizadoEm: serverTimestamp() })))
await caso('franqueado não cria equipe da franqueadora', assertFails(setDoc(doc(dono, 'usuarios', 'eq-escala'), novoUsuario('eq-escala', { papel: 'equipe_franqueadora', unidadeId: null, modulos: ['manuais'], criadoPor: 'fr-1' }))))
await caso('franqueado cria equipe dentro dos módulos da unidade', assertSucceeds(setDoc(doc(dono, 'usuarios', 'eq-ok'), novoUsuario('eq-ok', { papel: 'equipe_franqueado', unidadeId: 'un-1', modulos: ['manuais'], criadoPor: 'fr-1' }))))
await caso('franqueado não libera módulo que a unidade não tem', assertFails(setDoc(doc(dono, 'usuarios', 'eq-crm'), novoUsuario('eq-crm', { papel: 'equipe_franqueado', unidadeId: 'un-1', modulos: ['crm'], criadoPor: 'fr-1' }))))
await caso('franqueado não cria equipe de outra unidade', assertFails(setDoc(doc(dono, 'usuarios', 'eq-outra'), novoUsuario('eq-outra', { papel: 'equipe_franqueado', unidadeId: 'un-2', modulos: ['manuais'], criadoPor: 'fr-1' }))))
await caso('equipe da unidade não cria outro usuário', assertFails(setDoc(doc(equipe, 'usuarios', 'eq-filho'), novoUsuario('eq-filho', { papel: 'equipe_franqueado', unidadeId: 'un-1', modulos: ['manuais'], criadoPor: 'eq-1' }))))

const baseEquipe = usuario('eq-1', { papel: 'equipe_franqueado', unidadeId: 'un-1', modulos: ['manuais'], criadoPor: 'fr-1' })
await caso('franqueado desativa a própria equipe', assertSucceeds(setDoc(doc(dono, 'usuarios', 'eq-1'), { ...baseEquipe, ativo: false, atualizadoEm: serverTimestamp() })))
await caso('outro franqueado não edita essa equipe', assertFails(updateDoc(doc(outro, 'usuarios', 'eq-1'), { ativo: false, atualizadoEm: serverTimestamp() })))

await caso('franqueado lista a própria equipe', assertSucceeds(getDocs(query(collection(dono, 'usuarios'), where('unidadeId', '==', 'un-1'), where('papel', '==', 'equipe_franqueado')))))
await caso('franqueado não lista a equipe de outra unidade', assertFails(getDocs(query(collection(dono, 'usuarios'), where('unidadeId', '==', 'un-2'), where('papel', '==', 'equipe_franqueado')))))
await caso('franqueado não lista todos os usuários', assertFails(getDocs(collection(dono, 'usuarios'))))

const visitante = ambiente.authenticatedContext('visitante', { email: 'visitante@ubox.test' }).firestore()
await caso('cadastro próprio nasce franqueado inativo', assertSucceeds(setDoc(doc(visitante, 'usuarios', 'visitante'), {
  uid: 'visitante',
  email: 'visitante@ubox.test',
  nome: 'Visitante',
  papel: 'franqueado',
  ativo: false,
  recusado: false,
  unidade: '',
  cidade: '',
  criadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
})))
await caso('cadastro não nasce admin', assertFails(setDoc(doc(visitante, 'usuarios', 'visitante'), {
  uid: 'visitante',
  email: 'visitante@ubox.test',
  nome: 'Visitante',
  papel: 'admin',
  ativo: true,
  recusado: false,
  unidade: '',
  cidade: '',
  criadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
})))

void manual
await ambiente.cleanup()

if (falhas.length) {
  console.error(`\n${falhas.length} caso(s) falharam: ${falhas.join(', ')}`)
  process.exit(1)
}
console.log('\nregras: todos os casos passaram')
