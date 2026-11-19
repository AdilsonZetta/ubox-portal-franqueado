import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

const estouros = []
for (const metodo of ['error', 'warn', 'log']) {
  const original = console[metodo].bind(console)
  console[metodo] = (...args) => {
    const texto = args.map((item) => (typeof item === 'string' ? item : item instanceof Error ? item.message : '')).join(' ')
    if (/unable to evaluate/i.test(texto)) estouros.push(texto)
    original(...args)
  }
}

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
  const antes = estouros.length
  try {
    await promessa
    console.log(`ok  ${nome}`)
  } catch (erro) {
    falhas.push(nome)
    console.error(`falhou  ${nome}`)
    console.error(erro instanceof Error ? erro.message : erro)
  }
  if (estouros.length > antes && !falhas.includes(nome)) {
    console.error(`limite de expressões em recusa: ${nome}`)
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
await caso('franqueado sem lista não lê o manual', assertFails(getDoc(doc(legado, 'documentos', 'pub'))))
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
await caso('cadastro próprio nasce franqueado inativo e sem módulos', assertSucceeds(setDoc(doc(visitante, 'usuarios', 'visitante'), {
  uid: 'visitante',
  email: 'visitante@ubox.test',
  nome: 'Visitante',
  papel: 'franqueado',
  ativo: false,
  recusado: false,
  unidade: '',
  cidade: '',
  modulosLiberados: [],
  criadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
})))
const visitanteModulo = ambiente.authenticatedContext('visitante-mod', { email: 'visitante-mod@ubox.test' }).firestore()
await caso('cadastro não escolhe os próprios módulos', assertFails(setDoc(doc(visitanteModulo, 'usuarios', 'visitante-mod'), {
  uid: 'visitante-mod',
  email: 'visitante-mod@ubox.test',
  nome: 'Visitante Mod',
  papel: 'franqueado',
  ativo: false,
  recusado: false,
  unidade: '',
  cidade: '',
  modulosLiberados: ['manuais'],
  criadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
})))
const baseLegado = usuario('fr-legado', { semModulos: true, semUnidadeId: true, nome: 'Legado' })
await caso('admin grava os módulos do franqueado legado', assertSucceeds(setDoc(doc(admin, 'usuarios', 'fr-legado'), {
  ...baseLegado,
  modulosLiberados: ['manuais'],
  atualizadoEm: serverTimestamp(),
})))
await caso('franqueado sem unidade não lê mesmo com módulos', assertFails(getDoc(doc(legado, 'documentos', 'pub'))))
await caso('admin liga o legado a uma unidade ativa', assertSucceeds(setDoc(doc(admin, 'usuarios', 'fr-legado'), {
  ...baseLegado,
  unidadeId: 'un-1',
  modulosLiberados: ['manuais'],
  atualizadoEm: serverTimestamp(),
})))
await caso('franqueado legado lê depois de ligado à unidade', assertSucceeds(getDoc(doc(legado, 'documentos', 'pub'))))
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

await ambiente.withSecurityRulesDisabled(async (contexto) => {
  const banco = contexto.firestore()
  await setDoc(doc(banco, 'usuarios', 'fr-ch'), usuario('fr-ch', { unidadeId: 'un-1', modulos: ['chamados'], nome: 'Dono Chamado' }))
  await setDoc(doc(banco, 'usuarios', 'eq-ch'), usuario('eq-ch', { papel: 'equipe_franqueado', unidadeId: 'un-1', modulos: ['chamados'], criadoPor: 'fr-ch', nome: 'Equipe Chamado' }))
  await setDoc(doc(banco, 'usuarios', 'fr-ch2'), usuario('fr-ch2', { unidadeId: 'un-2', modulos: ['chamados'], nome: 'Outra Unidade' }))
  await setDoc(doc(banco, 'usuarios', 'eq-fila'), usuario('eq-fila', { papel: 'equipe_franqueadora', unidade: 'Franqueadora', unidadeId: null, modulos: ['chamados'], nome: 'Fila Rede' }))
  await setDoc(doc(banco, 'gabarito', 'g1'), { respostas: [0] })
  await setDoc(doc(banco, 'quizzes', 'q1', 'gabarito', 'item'), { respostas: [0] })
  await setDoc(doc(banco, 'tentativas', 't-fr1'), { uid: 'fr-1', quizId: 'q1', nota: 80 })
  await setDoc(doc(banco, 'tentativas', 't-ch'), { uid: 'fr-ch', quizId: 'q1', nota: 80 })
  await setDoc(doc(banco, 'certificados', 'c-fr1'), { uid: 'fr-1', trilhaId: 'trilha' })
  await setDoc(doc(banco, 'certificados', 'c-ch'), { uid: 'fr-ch', trilhaId: 'trilha' })
})

const frCh = ambiente.authenticatedContext('fr-ch', { email: 'fr-ch@ubox.test' }).firestore()
const eqCh = ambiente.authenticatedContext('eq-ch', { email: 'eq-ch@ubox.test' }).firestore()
const frCh2 = ambiente.authenticatedContext('fr-ch2', { email: 'fr-ch2@ubox.test' }).firestore()
const eqFila = ambiente.authenticatedContext('eq-fila', { email: 'eq-fila@ubox.test' }).firestore()

function chamado(uid, extra = {}) {
  return {
    titulo: 'Porta emperrada',
    categoria: 'operacao',
    prioridade: 'urgente',
    descricao: 'A porta da recepção não fecha.',
    anexos: [{ nome: 'Foto', url: 'https://exemplo.ubox.net.br/porta' }],
    status: 'aberto',
    unidadeId: 'un-1',
    unidadeNome: 'Uberaba Centro',
    abertoPor: uid,
    abertoPorNome: 'Dono Chamado',
    responsavelId: null,
    responsavelNome: null,
    avaliacao: null,
    slaHoras: 4,
    resolvidoEm: null,
    fechadoEm: null,
    reabertoEm: null,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    ...extra,
  }
}

await caso('franqueado com o módulo abre chamado da própria unidade', assertSucceeds(setDoc(doc(frCh, 'chamados', 'ch-1'), chamado('fr-ch'))))
await caso('equipe da unidade com o módulo lê o chamado', assertSucceeds(getDoc(doc(eqCh, 'chamados', 'ch-1'))))
await caso('admin lê o chamado', assertSucceeds(getDoc(doc(admin, 'chamados', 'ch-1'))))
await caso('equipe da franqueadora com o módulo lê o chamado', assertSucceeds(getDoc(doc(eqFila, 'chamados', 'ch-1'))))
await caso('franqueado sem o módulo não lê o chamado', assertFails(getDoc(doc(dono, 'chamados', 'ch-1'))))
await caso('equipe da franqueadora sem o módulo não lê o chamado', assertFails(getDoc(doc(equipeRede, 'chamados', 'ch-1'))))
await caso('outra unidade não lê o chamado', assertFails(getDoc(doc(frCh2, 'chamados', 'ch-1'))))
await caso('franqueado não lista a fila inteira', assertFails(getDocs(collection(frCh, 'chamados'))))
await caso('franqueado lista só a própria unidade', assertSucceeds(getDocs(query(collection(frCh, 'chamados'), where('unidadeId', '==', 'un-1')))))
await caso('franqueado não lista outra unidade', assertFails(getDocs(query(collection(frCh, 'chamados'), where('unidadeId', '==', 'un-2')))))
await caso('franqueado não altera o responsável', assertFails(updateDoc(doc(frCh, 'chamados', 'ch-1'), { responsavelId: 'fr-ch', responsavelNome: 'Dono Chamado', atualizadoEm: serverTimestamp() })))
await caso('franqueado não altera o SLA', assertFails(updateDoc(doc(frCh, 'chamados', 'ch-1'), { slaHoras: 72, atualizadoEm: serverTimestamp() })))
await caso('franqueado não fecha direto de aberto', assertFails(updateDoc(doc(frCh, 'chamados', 'ch-1'), {
  status: 'fechado',
  avaliacao: 5,
  fechadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
})))
await caso('chamado não aceita nome de unidade diferente', assertFails(setDoc(doc(frCh, 'chamados', 'ch-nome'), chamado('fr-ch', { unidadeNome: 'Outra' }))))
await caso('chamado não nasce com SLA fora da prioridade', assertFails(setDoc(doc(frCh, 'chamados', 'ch-sla'), chamado('fr-ch', { slaHoras: 1 }))))
await caso('franqueado comenta o próprio chamado', assertSucceeds(setDoc(doc(frCh, 'chamados', 'ch-1', 'eventos', 'ev-1'), {
  tipo: 'comentario',
  texto: 'Segue o detalhe.',
  de: '',
  para: '',
  autorId: 'fr-ch',
  autorNome: 'Dono Chamado',
  criadoEm: serverTimestamp(),
})))
await caso('outra unidade não comenta', assertFails(setDoc(doc(frCh2, 'chamados', 'ch-1', 'eventos', 'ev-2'), {
  tipo: 'comentario',
  texto: 'Não deveria.',
  de: '',
  para: '',
  autorId: 'fr-ch2',
  autorNome: 'Outra Unidade',
  criadoEm: serverTimestamp(),
})))
await caso('franqueadora assume o chamado', assertSucceeds(updateDoc(doc(eqFila, 'chamados', 'ch-1'), {
  responsavelId: 'eq-fila',
  responsavelNome: 'Fila Rede',
  status: 'em_andamento',
  atualizadoEm: serverTimestamp(),
})))
await caso('franqueadora marca como resolvido', (async () => {
  const lote = writeBatch(eqFila)
  lote.update(doc(eqFila, 'chamados', 'ch-1'), {
    status: 'resolvido',
    resolvidoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  })
  lote.set(doc(eqFila, 'chamados', 'ch-1', 'eventos', 'ev-resolvido'), {
    tipo: 'status',
    texto: 'Status: resolvido',
    de: 'em_andamento',
    para: 'resolvido',
    autorId: 'eq-fila',
    autorNome: 'Fila Rede',
    criadoEm: serverTimestamp(),
  })
  await lote.commit()
})())
await caso('colega não fecha o chamado de outro', assertFails(updateDoc(doc(eqCh, 'chamados', 'ch-1'), {
  status: 'fechado',
  avaliacao: 4,
  fechadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
})))
await caso('franqueado fecha e avalia', assertSucceeds(updateDoc(doc(frCh, 'chamados', 'ch-1'), {
  status: 'fechado',
  avaliacao: 5,
  fechadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
})))
await caso('franqueado reabre e zera a avaliação', (async () => {
  await updateDoc(doc(frCh, 'chamados', 'ch-1'), {
    status: 'aberto',
    avaliacao: null,
    fechadoEm: null,
    resolvidoEm: null,
    reabertoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  })
  const dados = (await getDoc(doc(frCh, 'chamados', 'ch-1'))).data()
  if (!dados || dados.avaliacao !== null || dados.fechadoEm !== null || dados.resolvidoEm !== null || !dados.reabertoEm) {
    throw new Error('reabertura não limpou o encerramento')
  }
})())
await caso('admin conduz a fila', assertSucceeds(updateDoc(doc(admin, 'chamados', 'ch-1'), {
  status: 'em_andamento',
  atualizadoEm: serverTimestamp(),
})))
await caso('comentário não aceita nome forjado', assertFails(setDoc(doc(frCh, 'chamados', 'ch-1', 'eventos', 'ev-falso-nome'), {
  tipo: 'comentario',
  texto: 'Nome trocado.',
  de: '',
  para: '',
  autorId: 'fr-ch',
  autorNome: 'Outra Pessoa',
  criadoEm: serverTimestamp(),
})))
await caso('unidade não grava evento de status', assertFails(setDoc(doc(frCh, 'chamados', 'ch-1', 'eventos', 'ev-status'), {
  tipo: 'status',
  texto: 'Status: fechado',
  de: 'aberto',
  para: 'fechado',
  autorId: 'fr-ch',
  autorNome: 'Dono Chamado',
  criadoEm: serverTimestamp(),
})))
await caso('evento de status sem mudança é recusado', assertFails(setDoc(doc(eqFila, 'chamados', 'ch-1', 'eventos', 'ev-sem-mudanca'), {
  tipo: 'status',
  texto: 'Status: resolvido',
  de: 'em_andamento',
  para: 'resolvido',
  autorId: 'eq-fila',
  autorNome: 'Fila Rede',
  criadoEm: serverTimestamp(),
})))
await caso('admin não libera módulo fora da unidade', assertFails(updateDoc(doc(admin, 'usuarios', 'fr-1'), {
  modulosLiberados: ['manuais', 'universidade', 'crm'],
  atualizadoEm: serverTimestamp(),
})))
await caso('aluno com universidade não lê mais o gabarito legado', assertFails(getDoc(doc(dono, 'gabarito', 'g1'))))
await caso('aluno com universidade não lê o gabarito legado do quiz', assertFails(getDoc(doc(dono, 'quizzes', 'q1', 'gabarito', 'item'))))
await caso('admin lê o gabarito legado', assertSucceeds(getDoc(doc(admin, 'gabarito', 'g1'))))
await caso('quem não tem universidade não lê o gabarito', assertFails(getDoc(doc(frCh, 'gabarito', 'g1'))))
await caso('equipe só de manuais não lê o gabarito do quiz', assertFails(getDoc(doc(equipeRede, 'quizzes', 'q1', 'gabarito', 'item'))))
await caso('franqueado com universidade lê a própria tentativa', assertSucceeds(getDoc(doc(dono, 'tentativas', 't-fr1'))))
await caso('sem universidade não lê a própria tentativa', assertFails(getDoc(doc(frCh, 'tentativas', 't-ch'))))
await caso('sem universidade não lê o próprio certificado', assertFails(getDoc(doc(frCh, 'certificados', 'c-ch'))))
await caso('equipe sem o módulo não abre chamado', assertFails(setDoc(doc(equipeSem, 'chamados', 'ch-sem'), chamado('eq-sem', { abertoPor: 'eq-sem', abertoPorNome: 'Pessoa Teste' }))))

await caso('franqueadora tira de fechado e zera a nota', (async () => {
  await updateDoc(doc(eqFila, 'chamados', 'ch-1'), {
    status: 'resolvido',
    resolvidoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  })
  await updateDoc(doc(frCh, 'chamados', 'ch-1'), {
    status: 'fechado',
    avaliacao: 2,
    fechadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  })
  await updateDoc(doc(eqFila, 'chamados', 'ch-1'), {
    status: 'em_andamento',
    avaliacao: null,
    fechadoEm: null,
    resolvidoEm: null,
    reabertoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  })
  const dados = (await getDoc(doc(eqFila, 'chamados', 'ch-1'))).data()
  if (!dados || dados.status !== 'em_andamento' || dados.avaliacao !== null || dados.fechadoEm !== null || dados.resolvidoEm !== null) {
    throw new Error('sair de fechado não limpou a nota')
  }
})())

// ===============================================================
// Módulo 3 — Central de Acessos e Senhas
// ===============================================================

await ambiente.withSecurityRulesDisabled(async (contexto) => {
  const banco = contexto.firestore()
  await setDoc(doc(banco, 'unidades', 'un-s'), {
    nome: 'Unidade Senhas',
    cidade: 'Uberaba',
    responsavel: 'Dono Senhas',
    email: 'fr-s@ubox.test',
    uid: 'fr-s',
    modulosLiberados: ['manuais', 'senhas'],
    ativo: true,
    criadoPor: 'admin-1',
    criadoEm: criado,
    atualizadoEm: criado,
  })
  await setDoc(doc(banco, 'unidades', 'un-s2'), {
    nome: 'Unidade Dois Senhas',
    cidade: 'Uberaba',
    responsavel: 'Dono Dois Senhas',
    email: 'fr-s2@ubox.test',
    uid: 'fr-s2',
    modulosLiberados: ['manuais', 'senhas'],
    ativo: true,
    criadoPor: 'admin-1',
    criadoEm: criado,
    atualizadoEm: criado,
  })
  await setDoc(doc(banco, 'usuarios', 'fr-s'), usuario('fr-s', { unidadeId: 'un-s', modulos: ['manuais', 'senhas'], nome: 'Dono Senhas' }))
  await setDoc(doc(banco, 'usuarios', 'fr-s2'), usuario('fr-s2', { unidadeId: 'un-s2', modulos: ['manuais', 'senhas'], nome: 'Dono Dois Senhas' }))
  await setDoc(doc(banco, 'usuarios', 'eq-s-visivel'), usuario('eq-s-visivel', { papel: 'equipe_franqueado', unidadeId: 'un-s', modulos: ['manuais', 'senhas'], criadoPor: 'fr-s', nome: 'Equipe Visivel' }))
  await setDoc(doc(banco, 'usuarios', 'eq-s-oculto'), usuario('eq-s-oculto', { papel: 'equipe_franqueado', unidadeId: 'un-s', modulos: ['manuais', 'senhas'], criadoPor: 'fr-s', nome: 'Equipe Oculto' }))
  await setDoc(doc(banco, 'usuarios', 'eq-rede-s'), usuario('eq-rede-s', { papel: 'equipe_franqueadora', unidade: 'Franqueadora', unidadeId: null, modulos: ['manuais', 'senhas'], nome: 'Rede Senhas' }))
})

const frS = ambiente.authenticatedContext('fr-s', { email: 'fr-s@ubox.test' }).firestore()
const frS2 = ambiente.authenticatedContext('fr-s2', { email: 'fr-s2@ubox.test' }).firestore()
const eqSVisivel = ambiente.authenticatedContext('eq-s-visivel', { email: 'eq-s-visivel@ubox.test' }).firestore()
const eqSOculto = ambiente.authenticatedContext('eq-s-oculto', { email: 'eq-s-oculto@ubox.test' }).firestore()
const eqRedeS = ambiente.authenticatedContext('eq-rede-s', { email: 'eq-rede-s@ubox.test' }).firestore()

function acessoPayload(extra = {}) {
  return {
    nome: 'Sistema de Gestão',
    categoria: 'gestao',
    url: 'https://gestao.ubox.com.br',
    escopo: 'unidade',
    unidadeId: 'un-s',
    unidadeNome: 'Unidade Senhas',
    responsavelId: 'fr-s',
    responsavelNome: 'Dono Senhas',
    visivelPara: ['eq-s-visivel'],
    visivelParaEquipe: false,
    ultimaTrocaEm: serverTimestamp(),
    pendenteTroca: false,
    criadoPor: 'fr-s',
    criadoPorNome: 'Dono Senhas',
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    ...extra,
  }
}

function segredoPayload(extra = {}) {
  return {
    login: 'admin@unidade',
    senha: 'senha-super-secreta',
    notas: 'Notas operacionais',
    atualizadoEm: serverTimestamp(),
    atualizadoPor: 'fr-s',
    ...extra,
  }
}

await caso('equipe da unidade não cadastra sistema no cofre', assertFails(setDoc(doc(eqSVisivel, 'acessos', 'ac-equipe'), acessoPayload({
  criadoPor: 'eq-s-visivel',
  criadoPorNome: 'Pessoa Teste',
}))))
await caso('segredo de acesso inexistente é recusado', assertFails(setDoc(doc(frS, 'acessos', 'ac-s-solto', 'segredo', 'atual'), segredoPayload())))
await caso('franqueado cria acesso e segredo no mesmo lote', (async () => {
  const lote = writeBatch(frS)
  lote.set(doc(frS, 'acessos', 'ac-s1'), acessoPayload())
  lote.set(doc(frS, 'acessos', 'ac-s1', 'segredo', 'atual'), segredoPayload())
  await assertSucceeds(lote.commit())
})())

await caso('equipe fora de visivelPara lê metadados', assertSucceeds(getDoc(doc(eqSOculto, 'acessos', 'ac-s1'))))
await caso('equipe fora de visivelPara NÃO lê segredo', assertFails(getDoc(doc(eqSOculto, 'acessos', 'ac-s1', 'segredo', 'atual'))))

await caso('equipe em visivelPara lê segredo', assertSucceeds(getDoc(doc(eqSVisivel, 'acessos', 'ac-s1', 'segredo', 'atual'))))

await caso('outra unidade não lê metadados', assertFails(getDoc(doc(frS2, 'acessos', 'ac-s1'))))
await caso('outra unidade não lê segredo', assertFails(getDoc(doc(frS2, 'acessos', 'ac-s1', 'segredo', 'atual'))))

await caso('franqueado sem módulo senhas não lê metadados', assertFails(getDoc(doc(dono, 'acessos', 'ac-s1'))))
await caso('franqueado sem módulo senhas não lê segredo', assertFails(getDoc(doc(dono, 'acessos', 'ac-s1', 'segredo', 'atual'))))

await caso('usuário inativo não lê acesso', assertFails(getDoc(doc(inativo, 'acessos', 'ac-s1'))))
await caso('unidade desativada não lê acesso', assertFails(getDoc(doc(parado, 'acessos', 'ac-s1'))))

await caso('equipe da franqueadora lê metadados da unidade', assertSucceeds(getDoc(doc(eqRedeS, 'acessos', 'ac-s1'))))
await caso('equipe da franqueadora NÃO lê segredo da unidade', assertFails(getDoc(doc(eqRedeS, 'acessos', 'ac-s1', 'segredo', 'atual'))))

await caso('equipe da franqueadora cria acesso e segredo da rede no mesmo lote', (async () => {
  const lote = writeBatch(eqRedeS)
  lote.set(doc(eqRedeS, 'acessos', 'ac-rede1'), acessoPayload({
    escopo: 'rede',
    unidadeId: '',
    unidadeNome: '',
    responsavelId: null,
    responsavelNome: 'Franqueadora',
    visivelPara: [],
    visivelParaEquipe: false,
    criadoPor: 'eq-rede-s',
    criadoPorNome: 'Rede Senhas',
  }))
  lote.set(doc(eqRedeS, 'acessos', 'ac-rede1', 'segredo', 'atual'), segredoPayload({ atualizadoPor: 'eq-rede-s' }))
  await assertSucceeds(lote.commit())
})())
await caso('franqueado com módulo lê segredo da rede', assertSucceeds(getDoc(doc(frS, 'acessos', 'ac-rede1', 'segredo', 'atual'))))

await caso('acesso recusa visivelPara com tipo não string', assertFails(setDoc(doc(frS, 'acessos', 'ac-invalido-1'), acessoPayload({
  visivelPara: [123],
}))))

await caso('acesso recusa visivelPara com uid longo demais', assertFails(setDoc(doc(frS, 'acessos', 'ac-invalido-2'), acessoPayload({
  visivelPara: ['a'.repeat(129)],
}))))

await caso('quem pode ler segredo registra evento revelou', assertSucceeds(setDoc(doc(eqSVisivel, 'acessos', 'ac-s1', 'eventos', 'ev-1'), {
  tipo: 'revelou',
  texto: 'Visualizou a senha.',
  autorId: 'eq-s-visivel',
  autorNome: 'Equipe Visivel',
  criadoEm: serverTimestamp(),
})))
await caso('quem pode ler segredo NÃO consegue gravar texto livre no evento', assertFails(setDoc(doc(eqSVisivel, 'acessos', 'ac-s1', 'eventos', 'ev-livre'), {
  tipo: 'revelou',
  texto: 'senha-vazada-123',
  autorId: 'eq-s-visivel',
  autorNome: 'Equipe Visivel',
  criadoEm: serverTimestamp(),
})))
await caso('evento de acesso recusa frase diferente da oficial', assertFails(setDoc(doc(eqSVisivel, 'acessos', 'ac-s1', 'eventos', 'ev-frase-falsa'), {
  tipo: 'revelou',
  texto: 'Visualizou a senha sem ponto',
  autorId: 'eq-s-visivel',
  autorNome: 'Equipe Visivel',
  criadoEm: serverTimestamp(),
})))
await caso('quem NÃO pode ler segredo é recusado ao registrar evento revelou', assertFails(setDoc(doc(eqSOculto, 'acessos', 'ac-s1', 'eventos', 'ev-2'), {
  tipo: 'revelou',
  texto: 'Visualizou a senha.',
  autorId: 'eq-s-oculto',
  autorNome: 'Equipe Oculto',
  criadoEm: serverTimestamp(),
})))
await caso('evento de acesso recusa autorNome forjado', assertFails(setDoc(doc(eqSVisivel, 'acessos', 'ac-s1', 'eventos', 'ev-3'), {
  tipo: 'revelou',
  texto: 'Visualizou a senha.',
  autorId: 'eq-s-visivel',
  autorNome: 'Nome Falso',
  criadoEm: serverTimestamp(),
})))
await caso('admin não grava evento em acesso da unidade', assertFails(setDoc(doc(admin, 'acessos', 'ac-s1', 'eventos', 'ev-admin'), {
  tipo: 'atualizacao',
  texto: 'Acesso atualizado.',
  autorId: 'admin-1',
  autorNome: 'Administrador',
  criadoEm: serverTimestamp(),
})))

await caso('franqueado 2 cria acesso da unidade 2', assertSucceeds(setDoc(doc(frS2, 'acessos', 'ac-s2'), acessoPayload({
  unidadeId: 'un-s2',
  unidadeNome: 'Unidade Dois Senhas',
  responsavelId: 'fr-s2',
  responsavelNome: 'Dono Dois Senhas',
  criadoPor: 'fr-s2',
  criadoPorNome: 'Dono Dois Senhas',
}))))

await caso('equipe da unidade cria solicitação de acesso', assertSucceeds(setDoc(doc(eqSOculto, 'solicitacoesAcesso', 'sol-s1'), {
  tipo: 'pedir_acesso',
  status: 'aberta',
  acessoId: 'ac-s1',
  acessoNome: 'Sistema de Gestão',
  unidadeId: 'un-s',
  unidadeNome: 'Unidade Senhas',
  solicitadoPor: 'eq-s-oculto',
  solicitadoPorNome: 'Equipe Oculto',
  motivo: 'Preciso emitir relatórios da unidade.',
  alvoUid: 'eq-s-oculto',
  alvoNome: 'Equipe Oculto',
  decididoPor: null,
  decididoPorNome: null,
  criadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
})))
await caso('solicitação com acessoId de outra unidade falha', assertFails(setDoc(doc(eqSOculto, 'solicitacoesAcesso', 'sol-outra-un'), {
  tipo: 'pedir_acesso',
  status: 'aberta',
  acessoId: 'ac-s2',
  acessoNome: 'Sistema de Outra Unidade',
  unidadeId: 'un-s',
  unidadeNome: 'Unidade Senhas',
  solicitadoPor: 'eq-s-oculto',
  solicitadoPorNome: 'Equipe Oculto',
  motivo: 'Acesso indevido a outra unidade.',
  alvoUid: 'eq-s-oculto',
  alvoNome: 'Equipe Oculto',
  decididoPor: null,
  decididoPorNome: null,
  criadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
})))
await caso('solicitação com unidadeNome forjado falha', assertFails(setDoc(doc(eqSOculto, 'solicitacoesAcesso', 'sol-nome-forjado'), {
  tipo: 'pedir_acesso',
  status: 'aberta',
  acessoId: 'ac-s1',
  acessoNome: 'Sistema de Gestão',
  unidadeId: 'un-s',
  unidadeNome: 'Nome Forjado de Unidade',
  solicitadoPor: 'eq-s-oculto',
  solicitadoPorNome: 'Equipe Oculto',
  motivo: 'Teste nome forjado.',
  alvoUid: 'eq-s-oculto',
  alvoNome: 'Equipe Oculto',
  decididoPor: null,
  decididoPorNome: null,
  criadoEm: serverTimestamp(),
  atualizadoEm: serverTimestamp(),
})))
await caso('outra unidade não aprova solicitação', assertFails(updateDoc(doc(frS2, 'solicitacoesAcesso', 'sol-s1'), {
  status: 'aprovada',
  decididoPor: 'fr-s2',
  decididoPorNome: 'Dono Dois Senhas',
  atualizadoEm: serverTimestamp(),
})))
await caso('franqueado da unidade aprova solicitação', assertSucceeds(updateDoc(doc(frS, 'solicitacoesAcesso', 'sol-s1'), {
  status: 'aprovada',
  decididoPor: 'fr-s',
  decididoPorNome: 'Dono Senhas',
  atualizadoEm: serverTimestamp(),
})))

await caso('franqueado não apaga acesso', assertFails(deleteDoc(doc(frS, 'acessos', 'ac-s1'))))
await caso('admin não apaga acesso', assertFails(deleteDoc(doc(admin, 'acessos', 'ac-s1'))))

// Item 7 — segredo exige ultimaTrocaEm == request.time no acesso pai
await caso('gravar segredo sem atualizar ultimaTrocaEm é recusado', assertFails(
  setDoc(doc(frS, 'acessos', 'ac-s1', 'segredo', 'atual'), segredoPayload())
))

await caso('gravar segredo com batch correto é aceito', (async () => {
  const lote = writeBatch(frS)
  lote.update(doc(frS, 'acessos', 'ac-s1'), {
    ultimaTrocaEm: serverTimestamp(),
    pendenteTroca: false,
    atualizadoEm: serverTimestamp(),
  })
  lote.set(doc(frS, 'acessos', 'ac-s1', 'segredo', 'atual'), segredoPayload())
  await assertSucceeds(lote.commit())
})())


// ===============================================================
// Módulo 4 — trilha de manuais com tempo mínimo
// ===============================================================
const passado = new Date(Date.now() - 2 * 60 * 60 * 1000)
await ambiente.withSecurityRulesDisabled(async (contexto) => {
  const banco = contexto.firestore()
  await setDoc(doc(banco, 'unidades', 'un-m'), {
    nome: 'Unidade Manuais', cidade: 'Uberaba', responsavel: 'Dono Manuais', email: 'fr-m@ubox.test', uid: 'fr-m',
    modulosLiberados: ['manuais'], ativo: true, criadoPor: 'admin-1', criadoEm: criado, atualizadoEm: criado,
  })
  await setDoc(doc(banco, 'unidades', 'un-m2'), {
    nome: 'Outra Manuais', cidade: 'Uberaba', responsavel: 'Dono Dois', email: 'fr-m2@ubox.test', uid: 'fr-m2',
    modulosLiberados: ['manuais'], ativo: true, criadoPor: 'admin-1', criadoEm: criado, atualizadoEm: criado,
  })
  await setDoc(doc(banco, 'usuarios', 'fr-m'), usuario('fr-m', { unidadeId: 'un-m', unidade: 'Unidade Manuais', nome: 'Dono Manuais' }))
  await setDoc(doc(banco, 'usuarios', 'eq-m'), usuario('eq-m', { papel: 'equipe_franqueado', unidadeId: 'un-m', unidade: 'Unidade Manuais', criadoPor: 'fr-m', nome: 'Equipe Manuais' }))
  await setDoc(doc(banco, 'usuarios', 'eq-m2'), usuario('eq-m2', { papel: 'equipe_franqueado', unidadeId: 'un-m2', unidade: 'Outra Manuais', criadoPor: 'fr-m2', nome: 'Equipe Outra' }))
  await setDoc(doc(banco, 'usuarios', 'fr-sem-m'), usuario('fr-sem-m', { unidadeId: 'un-m', unidade: 'Unidade Manuais', modulos: [], nome: 'Sem Manuais' }))
  await setDoc(doc(banco, 'usuarios', 'eq-rede-m'), usuario('eq-rede-m', { papel: 'equipe_franqueadora', unidade: 'Franqueadora', unidadeId: null, modulos: ['manuais'], nome: 'Rede Manuais' }))
  await setDoc(doc(banco, 'usuarios', 'eq-rede-sem'), usuario('eq-rede-sem', { papel: 'equipe_franqueadora', unidade: 'Franqueadora', unidadeId: null, modulos: [], nome: 'Rede Sem' }))
  for (const id of ['man-1', 'man-2', 'man-3']) {
    await setDoc(doc(banco, 'documentos', id), { titulo: `Manual ${id}`, categoriaId: 'cat-1', tipo: 'manual', status: 'publicado', publico: true, unidades: [], papeis: [], uidsExtra: [], uids: [] })
  }
  const item = (id, ordem, anteriorId, tempo = 60) => ({
    documentoId: id, titulo: `Manual ${id}`, etapa: 'Etapa 1', ordem, tempoMinimoSeg: tempo, videoMinutos: 0,
    anteriorId, ativo: true, atualizadoPor: 'admin-1', atualizadoPorNome: 'Admin Rede', atualizadoEm: criado,
  })
  await setDoc(doc(banco, 'manuaisTrilha', 'man-1'), item('man-1', 1, ''))
  await setDoc(doc(banco, 'manuaisTrilha', 'man-2'), item('man-2', 2, 'man-1'))
  await setDoc(doc(banco, 'manuaisTrilha', 'man-3'), item('man-3', 3, 'man-2'))
  // Progresso antigo do man-2 da equipe, iniciado há 2 horas, para testar a conclusão no tempo.
  await setDoc(doc(banco, 'progressoManuais', 'eq-m_man-1'), {
    uid: 'eq-m', documentoId: 'man-1', nome: 'Equipe Manuais', unidadeId: 'un-m', unidadeNome: 'Unidade Manuais',
    status: 'concluido', iniciadoEm: passado, reinicios: 0, tempoMinimoSeg: 60, concluidoEm: passado, atualizadoEm: passado,
  })
  await setDoc(doc(banco, 'progressoManuais', 'eq-m_man-2'), {
    uid: 'eq-m', documentoId: 'man-2', nome: 'Equipe Manuais', unidadeId: 'un-m', unidadeNome: 'Unidade Manuais',
    status: 'em_andamento', iniciadoEm: passado, reinicios: 0, tempoMinimoSeg: 60, concluidoEm: null, atualizadoEm: passado,
  })
})

const frM = ambiente.authenticatedContext('fr-m', { email: 'fr-m@ubox.test' }).firestore()
const eqM = ambiente.authenticatedContext('eq-m', { email: 'eq-m@ubox.test' }).firestore()
const eqM2 = ambiente.authenticatedContext('eq-m2', { email: 'eq-m2@ubox.test' }).firestore()
const frSemM = ambiente.authenticatedContext('fr-sem-m', { email: 'fr-sem-m@ubox.test' }).firestore()
const eqRedeM = ambiente.authenticatedContext('eq-rede-m', { email: 'eq-rede-m@ubox.test' }).firestore()
const eqRedeSem = ambiente.authenticatedContext('eq-rede-sem', { email: 'eq-rede-sem@ubox.test' }).firestore()
const adminM = ambiente.authenticatedContext('admin-1', { email: 'admin@ubox.test' }).firestore()

function progresso(uid, documentoId, extra = {}) {
  return {
    uid, documentoId, nome: 'Dono Manuais', unidadeId: 'un-m', unidadeNome: 'Unidade Manuais',
    status: 'em_andamento', iniciadoEm: serverTimestamp(), reinicios: 0, tempoMinimoSeg: 60, concluidoEm: null,
    atualizadoEm: serverTimestamp(), ...extra,
  }
}

function itemTrilha(autor, nome, extra = {}) {
  return {
    documentoId: 'man-3', titulo: 'Manual man-3', etapa: 'Etapa 2', ordem: 3, tempoMinimoSeg: 120, videoMinutos: 1,
    anteriorId: 'man-2', ativo: true, atualizadoPor: autor, atualizadoPorNome: nome, atualizadoEm: serverTimestamp(), ...extra,
  }
}

await caso('franqueado lê a trilha de manuais', assertSucceeds(getDocs(collection(frM, 'manuaisTrilha'))))
await caso('franqueado sem o módulo manuais não lê a trilha', assertFails(getDocs(collection(frSemM, 'manuaisTrilha'))))
await caso('franqueado lê o próprio progresso que ainda não existe', assertSucceeds(getDoc(doc(frM, 'progressoManuais', 'fr-m_man-1'))))
await caso('franqueado grava o próprio progresso do primeiro manual', assertSucceeds(setDoc(doc(frM, 'progressoManuais', 'fr-m_man-1'), progresso('fr-m', 'man-1'))))
await caso('não grava progresso de outro uid', assertFails(setDoc(doc(frM, 'progressoManuais', 'eq-m_man-3'), progresso('eq-m', 'man-3', { nome: 'Equipe Manuais' }))))
await caso('não cria progresso com id diferente de uid_documento', assertFails(setDoc(doc(frM, 'progressoManuais', 'qualquer'), progresso('fr-m', 'man-1'))))
await caso('não pula manual sem concluir o anterior', assertFails(setDoc(doc(frM, 'progressoManuais', 'fr-m_man-2'), progresso('fr-m', 'man-2'))))
await caso('não cria progresso já concluído', assertFails(setDoc(doc(frM, 'progressoManuais', 'fr-m_man-3'), progresso('fr-m', 'man-3', { status: 'concluido', concluidoEm: serverTimestamp() }))))
await caso('não cria progresso com tempo mínimo diferente da trilha', assertFails(setDoc(doc(eqM, 'progressoManuais', 'eq-m_man-3'), progresso('eq-m', 'man-3', { nome: 'Equipe Manuais', tempoMinimoSeg: 30 }))))
await caso('franqueado sem o módulo não grava progresso', assertFails(setDoc(doc(frSemM, 'progressoManuais', 'fr-sem-m_man-1'), progresso('fr-sem-m', 'man-1', { nome: 'Sem Manuais' }))))
await caso('não conclui antes do tempo mínimo', assertFails(updateDoc(doc(frM, 'progressoManuais', 'fr-m_man-1'), {
  status: 'concluido', concluidoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
})))
await caso('reinício zera o cronômetro do servidor', assertSucceeds(updateDoc(doc(frM, 'progressoManuais', 'fr-m_man-1'), {
  iniciadoEm: serverTimestamp(), reinicios: 1, tempoMinimoSeg: 60, atualizadoEm: serverTimestamp(),
})))
await caso('reinício não pula o contador', assertFails(updateDoc(doc(frM, 'progressoManuais', 'fr-m_man-1'), {
  iniciadoEm: serverTimestamp(), reinicios: 5, tempoMinimoSeg: 60, atualizadoEm: serverTimestamp(),
})))
await caso('reinício não volta o iniciadoEm para o passado', assertFails(updateDoc(doc(frM, 'progressoManuais', 'fr-m_man-1'), {
  iniciadoEm: passado, reinicios: 2, tempoMinimoSeg: 60, atualizadoEm: serverTimestamp(),
})))
await caso('conclui depois do tempo mínimo', assertSucceeds(updateDoc(doc(eqM, 'progressoManuais', 'eq-m_man-2'), {
  status: 'concluido', concluidoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
})))
await caso('concluído não volta para em andamento', assertFails(updateDoc(doc(eqM, 'progressoManuais', 'eq-m_man-2'), {
  status: 'em_andamento', iniciadoEm: serverTimestamp(), reinicios: 1, atualizadoEm: serverTimestamp(),
})))
await caso('próximo manual abre depois de concluir o anterior', assertSucceeds(setDoc(doc(eqM, 'progressoManuais', 'eq-m_man-3'), progresso('eq-m', 'man-3', { nome: 'Equipe Manuais' }))))
await caso('outra pessoa não conclui o progresso de alguém', assertFails(updateDoc(doc(frM, 'progressoManuais', 'eq-m_man-3'), {
  status: 'concluido', concluidoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
})))
await caso('ninguém apaga progresso', assertFails(deleteDoc(doc(eqM, 'progressoManuais', 'eq-m_man-3'))))
await caso('equipe de outra unidade não lê progresso alheio', assertFails(getDoc(doc(eqM2, 'progressoManuais', 'eq-m_man-2'))))
await caso('equipe de outra unidade não lista a unidade alheia', assertFails(getDocs(query(collection(eqM2, 'progressoManuais'), where('unidadeId', '==', 'un-m')))))
await caso('equipe da unidade não lista a unidade toda', assertFails(getDocs(query(collection(eqM, 'progressoManuais'), where('unidadeId', '==', 'un-m')))))
await caso('pessoa lista o próprio progresso', assertSucceeds(getDocs(query(collection(eqM, 'progressoManuais'), where('uid', '==', 'eq-m')))))
await caso('franqueado lista o progresso da própria unidade', assertSucceeds(getDocs(query(collection(frM, 'progressoManuais'), where('unidadeId', '==', 'un-m')))))
await caso('franqueadora com o módulo lê o progresso da rede', assertSucceeds(getDocs(collection(eqRedeM, 'progressoManuais'))))
await caso('franqueadora sem o módulo não lê o progresso da rede', assertFails(getDocs(collection(eqRedeSem, 'progressoManuais'))))
await caso('franqueadora com o módulo configura a trilha', assertSucceeds(setDoc(doc(eqRedeM, 'manuaisTrilha', 'man-3'), itemTrilha('eq-rede-m', 'Rede Manuais'))))
await caso('admin configura a trilha', assertSucceeds(setDoc(doc(adminM, 'manuaisTrilha', 'man-3'), itemTrilha('admin-1', 'Admin Rede'))))
await caso('franqueado não configura a trilha', assertFails(setDoc(doc(frM, 'manuaisTrilha', 'man-3'), itemTrilha('fr-m', 'Dono Manuais'))))
await caso('franqueadora sem o módulo não configura a trilha', assertFails(setDoc(doc(eqRedeSem, 'manuaisTrilha', 'man-3'), itemTrilha('eq-rede-sem', 'Rede Sem'))))
await caso('trilha recusa tempo mínimo abaixo de 30 s', assertFails(setDoc(doc(adminM, 'manuaisTrilha', 'man-3'), itemTrilha('admin-1', 'Admin Rede', { tempoMinimoSeg: 5 }))))
await caso('trilha recusa item de documento que não existe', assertFails(setDoc(doc(adminM, 'manuaisTrilha', 'nao-existe'), itemTrilha('admin-1', 'Admin Rede', { documentoId: 'nao-existe' }))))
await caso('trilha recusa nome do autor forjado', assertFails(setDoc(doc(eqRedeM, 'manuaisTrilha', 'man-3'), itemTrilha('eq-rede-m', 'Outro Nome'))))
await caso('ninguém apaga item da trilha', assertFails(deleteDoc(doc(adminM, 'manuaisTrilha', 'man-3'))))


// ===================== Módulo 5: Universidade =====================
const perguntasU = [
  { id: 'p1', enunciado: 'Pergunta 1', opcoes: ['a', 'b', 'c'] },
  { id: 'p2', enunciado: 'Pergunta 2', opcoes: ['a', 'b'] },
  { id: 'p3', enunciado: 'Pergunta 3', opcoes: ['a', 'b', 'c', 'd'] },
  { id: 'p4', enunciado: 'Pergunta 4', opcoes: ['a', 'b'] },
]
const corretasU = [1, 0, 3, 1]
await ambiente.withSecurityRulesDisabled(async (contexto) => {
  const banco = contexto.firestore()
  await setDoc(doc(banco, 'unidades', 'un-u'), {
    nome: 'Unidade Uni', cidade: 'Uberaba', responsavel: 'Dono Uni', email: 'fr-u@ubox.test', uid: 'fr-u',
    modulosLiberados: ['manuais', 'universidade'], ativo: true, criadoPor: 'admin-1', criadoEm: criado, atualizadoEm: criado,
  })
  await setDoc(doc(banco, 'usuarios', 'fr-u'), usuario('fr-u', { unidadeId: 'un-u', unidade: 'Unidade Uni', modulos: ['manuais', 'universidade'], nome: 'Dono Uni' }))
  await setDoc(doc(banco, 'usuarios', 'eq-u'), usuario('eq-u', { papel: 'equipe_franqueado', unidadeId: 'un-u', unidade: 'Unidade Uni', modulos: ['manuais', 'universidade'], criadoPor: 'fr-u', nome: 'Aluno Uni' }))
  await setDoc(doc(banco, 'usuarios', 'eq-u2'), usuario('eq-u2', { papel: 'equipe_franqueado', unidadeId: 'un-u', unidade: 'Unidade Uni', modulos: ['manuais', 'universidade'], criadoPor: 'fr-u', nome: 'Aluno Dois' }))
  await setDoc(doc(banco, 'usuarios', 'eq-u3'), usuario('eq-u3', { papel: 'equipe_franqueado', unidadeId: 'un-u', unidade: 'Unidade Uni', modulos: ['manuais', 'universidade'], criadoPor: 'fr-u', nome: 'Aluno Tres' }))
  await setDoc(doc(banco, 'usuarios', 'eq-u-sem'), usuario('eq-u-sem', { papel: 'equipe_franqueado', unidadeId: 'un-u', unidade: 'Unidade Uni', modulos: ['manuais'], criadoPor: 'fr-u', nome: 'Sem Uni' }))
  await setDoc(doc(banco, 'usuarios', 'eq-rede-u'), usuario('eq-rede-u', { papel: 'equipe_franqueadora', unidade: 'Franqueadora', unidadeId: null, modulos: ['universidade'], nome: 'Rede Uni' }))
  await setDoc(doc(banco, 'cursos', 'curso-a'), {
    titulo: 'Curso A', descricao: 'Abertura', ordem: 1, aulas: ['man-1'], publicado: true,
    atualizadoPor: 'admin-1', atualizadoPorNome: 'Admin Rede', atualizadoEm: criado,
  })
  await setDoc(doc(banco, 'cursos', 'curso-rascunho'), {
    titulo: 'Rascunho', descricao: 'x', ordem: 2, aulas: [], publicado: false,
    atualizadoPor: 'admin-1', atualizadoPorNome: 'Admin Rede', atualizadoEm: criado,
  })
  await setDoc(doc(banco, 'provas', 'curso-a'), {
    cursoId: 'curso-a', titulo: 'Prova A', notaMinima: 75, perguntas: perguntasU, totalPerguntas: 4,
    manualRetornoId: 'man-1', tempoReestudoSeg: 60, versao: 1, publicado: true,
    atualizadoPor: 'admin-1', atualizadoPorNome: 'Admin Rede', atualizadoEm: criado,
  })
  await setDoc(doc(banco, 'provasGabarito', 'curso-a'), { cursoId: 'curso-a', corretas: corretasU, versao: 1, atualizadoPor: 'admin-1', atualizadoEm: criado })
  // Aluno Dois já reprovou 3 vezes no ciclo 1 e tem um reestudo antigo em andamento.
  for (const numero of [1, 2, 3]) {
    await setDoc(doc(banco, 'tentativasProva', `eq-u2_curso-a_1_${numero}`), {
      uid: 'eq-u2', cursoId: 'curso-a', ciclo: 1, numero, nome: 'Aluno Dois', unidadeId: 'un-u', unidadeNome: 'Unidade Uni',
      versao: 1, aprovado: false, criadoEm: passado, corrigidoEm: passado,
    })
  }
  await setDoc(doc(banco, 'reestudos', 'eq-u2_curso-a_1'), {
    uid: 'eq-u2', cursoId: 'curso-a', ciclo: 1, documentoId: 'man-1', status: 'em_andamento', iniciadoEm: passado,
    reinicios: 0, concluidoEm: null, atualizadoEm: passado,
  })
})

const frU = ambiente.authenticatedContext('fr-u', { email: 'fr-u@ubox.test' }).firestore()
const eqU = ambiente.authenticatedContext('eq-u', { email: 'eq-u@ubox.test' }).firestore()
const eqU2 = ambiente.authenticatedContext('eq-u2', { email: 'eq-u2@ubox.test' }).firestore()
const eqU3 = ambiente.authenticatedContext('eq-u3', { email: 'eq-u3@ubox.test' }).firestore()
const eqUSem = ambiente.authenticatedContext('eq-u-sem', { email: 'eq-u-sem@ubox.test' }).firestore()
const eqRedeU = ambiente.authenticatedContext('eq-rede-u', { email: 'eq-rede-u@ubox.test' }).firestore()

function tentativaU(uid, nome, ciclo, numero, respostas, extra = {}) {
  return {
    uid, cursoId: 'curso-a', ciclo, numero, nome, unidadeId: 'un-u', unidadeNome: 'Unidade Uni', versao: 1,
    aprovado: null, criadoEm: serverTimestamp(), corrigidoEm: null, ...extra,
  }
}
// Envio real: tentativa (sem respostas) + folha de respostas no mesmo lote.
function enviarU(db, id, uid, nome, ciclo, numero, respostas, extra = {}, folhaExtra = {}) {
  const lote = writeBatch(db)
  lote.set(doc(db, 'tentativasProva', id), tentativaU(uid, nome, ciclo, numero, respostas, extra))
  lote.set(doc(db, 'tentativasProva', id, 'folha', 'atual'), { uid, versao: extra.versao ?? 1, respostas, ...folhaExtra })
  return lote.commit()
}
const corrigir = (aprovado) => ({ aprovado, corrigidoEm: serverTimestamp() })
const errado = [0, 1, 0, 0]

await caso('aluno lê curso publicado', assertSucceeds(getDoc(doc(eqU, 'cursos', 'curso-a'))))
await caso('aluno lista cursos publicados', assertSucceeds(getDocs(query(collection(eqU, 'cursos'), where('publicado', '==', true)))))
await caso('aluno não lê curso em rascunho', assertFails(getDoc(doc(eqU, 'cursos', 'curso-rascunho'))))
await caso('sem universidade não lê cursos', assertFails(getDoc(doc(eqUSem, 'cursos', 'curso-a'))))
await caso('aluno lê a prova publicada (sem respostas)', assertSucceeds(getDoc(doc(eqU, 'provas', 'curso-a'))))
await caso('aluno NUNCA lê o gabarito', assertFails(getDoc(doc(eqU, 'provasGabarito', 'curso-a'))))
await caso('franqueado NUNCA lê o gabarito', assertFails(getDoc(doc(frU, 'provasGabarito', 'curso-a'))))
await caso('aluno não lista gabaritos', assertFails(getDocs(collection(eqU, 'provasGabarito'))))
await caso('franqueadora com universidade lê o gabarito', assertSucceeds(getDoc(doc(eqRedeU, 'provasGabarito', 'curso-a'))))
await caso('franqueadora sem universidade não lê o gabarito', assertFails(getDoc(doc(eqRedeSem, 'provasGabarito', 'curso-a'))))

await caso('aluno lê a própria tentativa que ainda não existe', assertSucceeds(getDoc(doc(eqU, 'tentativasProva', 'eq-u_curso-a_1_1'))))
await caso('aluno não pula para a 2ª tentativa', assertFails(enviarU(eqU, 'eq-u_curso-a_1_2', 'eq-u', 'Aluno Uni', 1, 2, errado)))
await caso('aluno não cria tentativa já aprovada', assertFails(enviarU(eqU, 'eq-u_curso-a_1_1', 'eq-u', 'Aluno Uni', 1, 1, corretasU, { aprovado: true })))
await caso('aluno não cria tentativa com número de respostas errado', assertFails(enviarU(eqU, 'eq-u_curso-a_1_1', 'eq-u', 'Aluno Uni', 1, 1, [0, 1])))
await caso('aluno não cria tentativa em nome de outro', assertFails(enviarU(eqU, 'eq-u2_curso-a_1_1', 'eq-u2', 'Aluno Dois', 1, 1, errado)))
await caso('sem universidade não envia prova', assertFails(enviarU(eqUSem, 'eq-u-sem_curso-a_1_1', 'eq-u-sem', 'Sem Uni', 1, 1, errado)))
await caso('aluno envia a 1ª tentativa', assertSucceeds(enviarU(eqU, 'eq-u_curso-a_1_1', 'eq-u', 'Aluno Uni', 1, 1, errado)))
await caso('aluno não reenvia a mesma tentativa', assertFails(enviarU(eqU, 'eq-u_curso-a_1_1', 'eq-u', 'Aluno Uni', 1, 1, corretasU)))
await caso('2ª tentativa só depois de corrigir a 1ª', assertFails(enviarU(eqU, 'eq-u_curso-a_1_2', 'eq-u', 'Aluno Uni', 1, 2, errado)))
await caso('rules recusam aprovar resposta errada', assertFails(updateDoc(doc(eqU, 'tentativasProva', 'eq-u_curso-a_1_1'), corrigir(true))))
await caso('aluno não troca as respostas na correção', assertFails(setDoc(doc(eqU, 'tentativasProva', 'eq-u_curso-a_1_1', 'folha', 'atual'), { uid: 'eq-u', versao: 1, respostas: corretasU })))
await caso('rules aceitam a reprovação correta', assertSucceeds(updateDoc(doc(eqU, 'tentativasProva', 'eq-u_curso-a_1_1'), corrigir(false))))
await caso('tentativa corrigida é imutável', assertFails(updateDoc(doc(eqU, 'tentativasProva', 'eq-u_curso-a_1_1'), corrigir(true))))
await caso('ninguém apaga tentativa', assertFails(deleteDoc(doc(eqU, 'tentativasProva', 'eq-u_curso-a_1_1'))))
await caso('aluno envia a 2ª tentativa (3 de 4 certas)', assertSucceeds(enviarU(eqU, 'eq-u_curso-a_1_2', 'eq-u', 'Aluno Uni', 1, 2, [1, 0, 3, 0])))
await caso('rules recusam reprovar quem atingiu a nota', assertFails(updateDoc(doc(eqU, 'tentativasProva', 'eq-u_curso-a_1_2'), corrigir(false))))
await caso('rules aprovam quem atingiu a nota mínima', assertSucceeds(updateDoc(doc(eqU, 'tentativasProva', 'eq-u_curso-a_1_2'), corrigir(true))))
await caso('depois de aprovado não abre a 3ª', assertFails(enviarU(eqU, 'eq-u_curso-a_1_3', 'eq-u', 'Aluno Uni', 1, 3, errado)))
await caso('não existe 4ª tentativa no ciclo', assertFails(enviarU(eqU2, 'eq-u2_curso-a_1_4', 'eq-u2', 'Aluno Dois', 1, 4, errado)))
await caso('reprovado 3x não abre ciclo novo sem reestudar', assertFails(enviarU(eqU2, 'eq-u2_curso-a_2_1', 'eq-u2', 'Aluno Dois', 2, 1, errado)))
await caso('reestudo só depois de reprovar 3x', assertFails(setDoc(doc(eqU, 'reestudos', 'eq-u_curso-a_1'), {
  uid: 'eq-u', cursoId: 'curso-a', ciclo: 1, documentoId: 'man-1', status: 'em_andamento', iniciadoEm: serverTimestamp(),
  reinicios: 0, concluidoEm: null, atualizadoEm: serverTimestamp(),
})))
await caso('reestudo precisa ser do manual de retorno', assertFails(setDoc(doc(eqU2, 'reestudos', 'eq-u2_curso-a_9'), {
  uid: 'eq-u2', cursoId: 'curso-a', ciclo: 9, documentoId: 'man-2', status: 'em_andamento', iniciadoEm: serverTimestamp(),
  reinicios: 0, concluidoEm: null, atualizadoEm: serverTimestamp(),
})))
await caso('reestudo não conclui sem o tempo (reinício recente)', assertSucceeds(updateDoc(doc(eqU2, 'reestudos', 'eq-u2_curso-a_1'), {
  iniciadoEm: serverTimestamp(), reinicios: 1, atualizadoEm: serverTimestamp(),
})))
await caso('reestudo recusa conclusão antes do tempo', assertFails(updateDoc(doc(eqU2, 'reestudos', 'eq-u2_curso-a_1'), {
  status: 'concluido', concluidoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
})))
await ambiente.withSecurityRulesDisabled(async (contexto) => {
  await updateDoc(doc(contexto.firestore(), 'reestudos', 'eq-u2_curso-a_1'), { iniciadoEm: passado })
})
await caso('reestudo conclui depois do tempo', assertSucceeds(updateDoc(doc(eqU2, 'reestudos', 'eq-u2_curso-a_1'), {
  status: 'concluido', concluidoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
})))
await caso('depois do reestudo abre o ciclo 2', assertSucceeds(enviarU(eqU2, 'eq-u2_curso-a_2_1', 'eq-u2', 'Aluno Dois', 2, 1, corretasU)))
await caso('ciclo 2 aprova com tudo certo', assertSucceeds(updateDoc(doc(eqU2, 'tentativasProva', 'eq-u2_curso-a_2_1'), corrigir(true))))

await caso('franqueado vê resultados da própria equipe', assertSucceeds(getDocs(query(collection(frU, 'tentativasProva'), where('unidadeId', '==', 'un-u')))))
await caso('franqueado de outra unidade não vê resultados', assertFails(getDocs(query(collection(dono, 'tentativasProva'), where('unidadeId', '==', 'un-u')))))
await caso('equipe não vê resultados da unidade inteira', assertFails(getDocs(query(collection(eqU, 'tentativasProva'), where('unidadeId', '==', 'un-u')))))
await caso('aluno lista as próprias tentativas', assertSucceeds(getDocs(query(collection(eqU, 'tentativasProva'), where('uid', '==', 'eq-u')))))
await caso('franqueadora vê resultados da rede', assertSucceeds(getDocs(collection(eqRedeU, 'tentativasProva'))))

const autoriaU = (uid, nome) => ({ atualizadoPor: uid, atualizadoPorNome: nome, atualizadoEm: serverTimestamp() })
await caso('franqueadora cria curso', assertSucceeds(setDoc(doc(eqRedeU, 'cursos', 'curso-b'), {
  titulo: 'Curso B', descricao: 'Novo', ordem: 3, aulas: ['man-2'], publicado: true, ...autoriaU('eq-rede-u', 'Rede Uni'),
})))
await caso('franqueado não cria curso', assertFails(setDoc(doc(frU, 'cursos', 'curso-c'), {
  titulo: 'Curso C', descricao: 'Novo', ordem: 3, aulas: [], publicado: true, ...autoriaU('fr-u', 'Dono Uni'),
})))
const provaB = (versao, extra = {}) => ({
  cursoId: 'curso-b', titulo: 'Prova B', notaMinima: 70, perguntas: perguntasU.slice(0, 2), totalPerguntas: 2,
  manualRetornoId: 'man-2', tempoReestudoSeg: 120, versao, publicado: true, ...autoriaU('eq-rede-u', 'Rede Uni'), ...extra,
})
const gabB = (versao, corretas = [0, 1]) => ({ cursoId: 'curso-b', corretas, versao, atualizadoPor: 'eq-rede-u', atualizadoEm: serverTimestamp() })
{
  const lote = writeBatch(eqRedeU)
  lote.set(doc(eqRedeU, 'provas', 'curso-b'), provaB(1))
  lote.set(doc(eqRedeU, 'provasGabarito', 'curso-b'), gabB(1))
  await caso('franqueadora publica prova + gabarito no mesmo lote', assertSucceeds(lote.commit()))
}
await caso('prova sozinha (sem gabarito na mesma versão) é recusada', assertFails(setDoc(doc(eqRedeU, 'provas', 'curso-b'), provaB(2))))
await caso('prova recusa pergunta com resposta embutida', assertFails((async () => {
  const lote = writeBatch(eqRedeU)
  lote.set(doc(eqRedeU, 'provas', 'curso-b'), provaB(2, { perguntas: [{ ...perguntasU[0], correta: 1 }, perguntasU[1]] }))
  lote.set(doc(eqRedeU, 'provasGabarito', 'curso-b'), gabB(2))
  await lote.commit()
})()))
await caso('gabarito precisa ter o mesmo número de questões', assertFails((async () => {
  const lote = writeBatch(eqRedeU)
  lote.set(doc(eqRedeU, 'provas', 'curso-b'), provaB(2))
  lote.set(doc(eqRedeU, 'provasGabarito', 'curso-b'), gabB(2, [0, 1, 1]))
  await lote.commit()
})()))
{
  const lote = writeBatch(frU)
  lote.set(doc(frU, 'provas', 'curso-b'), provaB(2, autoriaU('fr-u', 'Dono Uni')))
  lote.set(doc(frU, 'provasGabarito', 'curso-b'), { ...gabB(2), atualizadoPor: 'fr-u' })
  await caso('franqueado não publica prova', assertFails(lote.commit()))
}
await caso('nota mínima acima de 100 é recusada', assertFails((async () => {
  const lote = writeBatch(eqRedeU)
  lote.set(doc(eqRedeU, 'provas', 'curso-b'), provaB(2, { notaMinima: 120 }))
  lote.set(doc(eqRedeU, 'provasGabarito', 'curso-b'), gabB(2))
  await lote.commit()
})()))


// --- Revisão do PR #10 ---
await caso('tentativa sem folha de respostas é recusada', assertFails(setDoc(doc(eqU3, 'tentativasProva', 'eq-u3_curso-a_1_1'), tentativaU('eq-u3', 'Aluno Tres', 1, 1, errado))))
await caso('folha não pode ser criada depois da tentativa', assertFails(setDoc(doc(eqU2, 'tentativasProva', 'eq-u2_curso-a_1_1', 'folha', 'atual'), { uid: 'eq-u2', versao: 1, respostas: corretasU })))
await caso('folha com campo extra é recusada', assertFails(enviarU(eqU3, 'eq-u3_curso-a_1_1', 'eq-u3', 'Aluno Tres', 1, 1, errado, {}, { correta: 1 })))
await caso('folha com versão diferente da tentativa é recusada', assertFails(enviarU(eqU3, 'eq-u3_curso-a_1_1', 'eq-u3', 'Aluno Tres', 1, 1, errado, {}, { versao: 9 })))
await caso('franqueado da unidade lê a tentativa (pai) da equipe', assertSucceeds(getDoc(doc(frU, 'tentativasProva', 'eq-u_curso-a_1_1'))))
await caso('franqueado da unidade NÃO lê a folha de respostas da equipe', assertFails(getDoc(doc(frU, 'tentativasProva', 'eq-u_curso-a_1_1', 'folha', 'atual'))))
await caso('outro aluno da unidade não lê a folha alheia', assertFails(getDoc(doc(eqU2, 'tentativasProva', 'eq-u_curso-a_1_1', 'folha', 'atual'))))
await caso('dono lê a própria folha', assertSucceeds(getDoc(doc(eqU, 'tentativasProva', 'eq-u_curso-a_1_1', 'folha', 'atual'))))
await caso('franqueadora lê a folha', assertSucceeds(getDoc(doc(eqRedeU, 'tentativasProva', 'eq-u_curso-a_1_1', 'folha', 'atual'))))
await caso('consulta da equipe não traz respostas', (async () => {
  const snap = await getDocs(query(collection(frU, 'tentativasProva'), where('unidadeId', '==', 'un-u')))
  if (!snap.size) throw new Error('consulta vazia')
  if (snap.docs.some((d) => 'respostas' in d.data())) throw new Error('respostas vazaram no doc pai')
})())
await caso('tentativa não aceita respostas no doc pai', assertFails(enviarU(eqU3, 'eq-u3_curso-a_1_1', 'eq-u3', 'Aluno Tres', 1, 1, errado, { respostas: errado })))

// Gabarito muda entre o envio e a correção.
await caso('aluno 3 envia a 1ª tentativa (certa)', assertSucceeds(enviarU(eqU3, 'eq-u3_curso-a_1_1', 'eq-u3', 'Aluno Tres', 1, 1, corretasU)))
await ambiente.withSecurityRulesDisabled(async (contexto) => {
  const banco = contexto.firestore()
  await updateDoc(doc(banco, 'provas', 'curso-a'), { versao: 2 })
  await updateDoc(doc(banco, 'provasGabarito', 'curso-a'), { versao: 2 })
})
await caso('versão mudou: rules não aprovam mesmo com tudo certo', assertFails(updateDoc(doc(eqU3, 'tentativasProva', 'eq-u3_curso-a_1_1'), corrigir(true))))
await caso('versão mudou: dono fecha como reprovada (perde a chance)', assertSucceeds(updateDoc(doc(eqU3, 'tentativasProva', 'eq-u3_curso-a_1_1'), corrigir(false))))
await caso('envio com versão antiga da prova é recusado', assertFails(enviarU(eqU3, 'eq-u3_curso-a_1_2', 'eq-u3', 'Aluno Tres', 1, 2, corretasU)))
await caso('envio na versão nova é aceito', assertSucceeds(enviarU(eqU3, 'eq-u3_curso-a_1_2', 'eq-u3', 'Aluno Tres', 1, 2, corretasU, { versao: 2 })))
await caso('franqueado não fecha tentativa pendente', assertFails(updateDoc(doc(frU, 'tentativasProva', 'eq-u3_curso-a_1_2'), corrigir(false))))
await caso('franqueadora não aprova tentativa pendente', assertFails(updateDoc(doc(eqRedeU, 'tentativasProva', 'eq-u3_curso-a_1_2'), corrigir(true))))
await caso('franqueadora fecha tentativa pendente como reprovada', assertSucceeds(updateDoc(doc(eqRedeU, 'tentativasProva', 'eq-u3_curso-a_1_2'), corrigir(false))))
await caso('franqueadora não reabre tentativa corrigida', assertFails(updateDoc(doc(eqRedeU, 'tentativasProva', 'eq-u3_curso-a_1_2'), corrigir(false))))
await ambiente.withSecurityRulesDisabled(async (contexto) => {
  const banco = contexto.firestore()
  await updateDoc(doc(banco, 'provas', 'curso-a'), { versao: 1 })
  await updateDoc(doc(banco, 'provasGabarito', 'curso-a'), { versao: 1 })
})

// Alternativas precisam ser texto curto.
for (const [nome, opcoes] of [['alternativa não-texto', ['a', 7]], ['alternativa vazia', ['a', '']], ['alternativa gigante', ['a', 'x'.repeat(301)]], ['alternativa em mapa', ['a', { correta: true }]]]) {
  await caso(`prova recusa ${nome}`, assertFails((async () => {
    const lote = writeBatch(eqRedeU)
    lote.set(doc(eqRedeU, 'provas', 'curso-b'), provaB(2, { perguntas: [{ id: 'p1', enunciado: 'Q', opcoes }, perguntasU[1]] }))
    lote.set(doc(eqRedeU, 'provasGabarito', 'curso-b'), gabB(2))
    await lote.commit()
  })()))
}
await caso('prova com alternativas válidas na versão 2', assertSucceeds((async () => {
  const lote = writeBatch(eqRedeU)
  lote.set(doc(eqRedeU, 'provas', 'curso-b'), provaB(2))
  lote.set(doc(eqRedeU, 'provasGabarito', 'curso-b'), gabB(2))
  await lote.commit()
})()))

await caso('aluno emite certificado do curso aprovado', assertSucceeds(setDoc(doc(eqU, 'certificados', 'eq-u_curso-a'), {
  uid: 'eq-u', trilhaId: 'curso-a', nome: 'Aluno Uni', trilhaTitulo: 'Curso A', emitidoEm: serverTimestamp(), codigo: 'UBOX-ABC123', tentativaId: 'eq-u_curso-a_1_2',
})))
await caso('não emite certificado com tentativa reprovada', assertFails(setDoc(doc(eqU2, 'certificados', 'eq-u2_curso-a'), {
  uid: 'eq-u2', trilhaId: 'curso-a', nome: 'Aluno Dois', trilhaTitulo: 'Curso A', emitidoEm: serverTimestamp(), codigo: 'UBOX-ABC124', tentativaId: 'eq-u2_curso-a_1_3',
})))
await caso('não emite certificado com tentativa alheia', assertFails(setDoc(doc(eqU2, 'certificados', 'eq-u2_curso-a'), {
  uid: 'eq-u2', trilhaId: 'curso-a', nome: 'Aluno Dois', trilhaTitulo: 'Curso A', emitidoEm: serverTimestamp(), codigo: 'UBOX-ABC125', tentativaId: 'eq-u_curso-a_1_2',
})))
await caso('aluno não cria tentativa legada (nota do aparelho)', assertFails(setDoc(doc(eqU, 'tentativas', 't-novo'), { uid: 'eq-u', quizId: 'q1', nota: 100, aprovado: true })))

// ===================== Módulo 6: Central de Marketing =====================
await ambiente.withSecurityRulesDisabled(async (contexto) => {
  const banco = contexto.firestore()
  for (const [id, nome, mods] of [['un-mk', 'Unidade Mkt', ['marketing']], ['un-mk2', 'Outra Mkt', ['marketing']]]) {
    await setDoc(doc(banco, 'unidades', id), {
      nome, cidade: 'Uberaba', responsavel: 'Dono', email: `${id}@ubox.test`, uid: null,
      modulosLiberados: mods, ativo: true, criadoPor: 'admin-1', criadoEm: criado, atualizadoEm: criado,
    })
  }
  await setDoc(doc(banco, 'usuarios', 'fr-mk'), usuario('fr-mk', { unidadeId: 'un-mk', unidade: 'Unidade Mkt', modulos: ['marketing'], nome: 'Dono Mkt' }))
  await setDoc(doc(banco, 'usuarios', 'eq-mk'), usuario('eq-mk', { papel: 'equipe_franqueado', unidadeId: 'un-mk', unidade: 'Unidade Mkt', modulos: ['marketing'], criadoPor: 'fr-mk', nome: 'Equipe Mkt' }))
  await setDoc(doc(banco, 'usuarios', 'eq-mk-b'), usuario('eq-mk-b', { papel: 'equipe_franqueado', unidadeId: 'un-mk', unidade: 'Unidade Mkt', modulos: ['marketing'], criadoPor: 'fr-mk', nome: 'Equipe Mkt B' }))
  await setDoc(doc(banco, 'usuarios', 'fr-mk2'), usuario('fr-mk2', { unidadeId: 'un-mk2', unidade: 'Outra Mkt', modulos: ['marketing'], nome: 'Dono Outra' }))
  await setDoc(doc(banco, 'usuarios', 'fr-mk-sem'), usuario('fr-mk-sem', { unidadeId: 'un-mk', unidade: 'Unidade Mkt', modulos: ['manuais'], nome: 'Sem Mkt' }))
  await setDoc(doc(banco, 'usuarios', 'eq-rede-mk'), usuario('eq-rede-mk', { papel: 'equipe_franqueadora', unidade: 'Franqueadora', unidadeId: null, modulos: ['marketing'], nome: 'Rede Mkt' }))
  await setDoc(doc(banco, 'usuarios', 'eq-rede-nomk'), usuario('eq-rede-nomk', { papel: 'equipe_franqueadora', unidade: 'Franqueadora', unidadeId: null, modulos: ['manuais'], nome: 'Rede Sem Mkt' }))
  const mat = (extra) => ({
    titulo: 'Arte', descricao: '', tipo: 'arte', categoria: 'Redes sociais', campanhaId: '', url: 'https://drive.google.com/x', previaUrl: '',
    formato: 'PNG', regrasUso: '', validoDe: null, validoAte: null, publico: true, unidades: [], ativo: true, geradoPorIA: false, iaModelo: '',
    criadoEm: criado, atualizadoPor: 'admin-1', atualizadoPorNome: 'Admin Rede', atualizadoEm: criado, ...extra,
  })
  await setDoc(doc(banco, 'marketingMateriais', 'mat-rede'), mat({}))
  await setDoc(doc(banco, 'marketingMateriais', 'mat-un'), mat({ publico: false, unidades: ['un-mk'] }))
  await setDoc(doc(banco, 'marketingMateriais', 'mat-outra'), mat({ publico: false, unidades: ['un-mk2'] }))
  await setDoc(doc(banco, 'marketingMateriais', 'mat-off'), mat({ ativo: false }))
  await setDoc(doc(banco, 'marketingCampanhas', 'camp-on'), { titulo: 'Black Friday', descricao: '', tipo: 'campanha', inicio: criado, fim: criado, ativo: true, geradoPorIA: false, iaModelo: '', atualizadoPor: 'admin-1', atualizadoPorNome: 'Admin Rede', atualizadoEm: criado })
  await setDoc(doc(banco, 'marketingCampanhas', 'camp-off'), { titulo: 'Rascunho', descricao: '', tipo: 'campanha', inicio: criado, fim: criado, ativo: false, geradoPorIA: false, iaModelo: '', atualizadoPor: 'admin-1', atualizadoPorNome: 'Admin Rede', atualizadoEm: criado })
})
const frMk = ambiente.authenticatedContext('fr-mk', { email: 'fr-mk@ubox.test' }).firestore()
const eqMk = ambiente.authenticatedContext('eq-mk', { email: 'eq-mk@ubox.test' }).firestore()
const eqMkB = ambiente.authenticatedContext('eq-mk-b', { email: 'eq-mk-b@ubox.test' }).firestore()
const frMk2 = ambiente.authenticatedContext('fr-mk2', { email: 'fr-mk2@ubox.test' }).firestore()
const frMkSem = ambiente.authenticatedContext('fr-mk-sem', { email: 'fr-mk-sem@ubox.test' }).firestore()
const redeMk = ambiente.authenticatedContext('eq-rede-mk', { email: 'eq-rede-mk@ubox.test' }).firestore()
const redeNoMk = ambiente.authenticatedContext('eq-rede-nomk', { email: 'eq-rede-nomk@ubox.test' }).firestore()
const adminMk = ambiente.authenticatedContext('admin-1', { email: 'admin@ubox.test' }).firestore()

function materialNovo(autor, nome, extra = {}) {
  return {
    titulo: 'Post Dia das Mães', descricao: 'Arte para feed', tipo: 'arte', categoria: 'Redes sociais', campanhaId: 'camp-on',
    url: 'https://drive.google.com/file/d/abc/view', previaUrl: '', formato: 'PNG 1080x1080', regrasUso: 'Não alterar o logo.',
    validoDe: null, validoAte: null, publico: true, unidades: [], ativo: true, geradoPorIA: false, iaModelo: '',
    criadoEm: serverTimestamp(), atualizadoPor: autor, atualizadoPorNome: nome, atualizadoEm: serverTimestamp(), ...extra,
  }
}
function pedido(uid, nome, extra = {}) {
  return {
    uid, nome, unidadeId: 'un-mk', unidadeNome: 'Unidade Mkt', titulo: 'Panfleto inauguração', tipoPeca: 'panfleto',
    descricao: 'Panfleto A5 com o endereço da unidade.', medidas: 'A5', prazoDesejado: null, referenciaUrl: '', campanhaId: '',
    status: 'aberta', complemento: '', resposta: '', entregaUrl: '', geradoPorIA: false, iaModelo: '', responsavelNome: '',
    criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(), entregueEm: null, ...extra,
  }
}

const listaRede = (db) => getDocs(query(collection(db, 'marketingMateriais'), where('ativo', '==', true), where('publico', '==', true)))
const listaUnidade = (db, un) => getDocs(query(collection(db, 'marketingMateriais'), where('ativo', '==', true), where('unidades', 'array-contains', un)))
await caso('mkt: unidade lista materiais da rede', assertSucceeds(listaRede(eqMk)))
await caso('mkt: unidade lista materiais da própria unidade', assertSucceeds(listaUnidade(frMk, 'un-mk')))
await caso('mkt: unidade não lista materiais de outra unidade', assertFails(listaUnidade(frMk, 'un-mk2')))
await caso('mkt: unidade não lê material de outra unidade', assertFails(getDoc(doc(frMk, 'marketingMateriais', 'mat-outra'))))
await caso('mkt: unidade lê material direcionado a ela', assertSucceeds(getDoc(doc(eqMk, 'marketingMateriais', 'mat-un'))))
await caso('mkt: unidade não lê material inativo', assertFails(getDoc(doc(frMk, 'marketingMateriais', 'mat-off'))))
await caso('mkt: unidade não lista sem filtrar ativos', assertFails(getDocs(collection(frMk, 'marketingMateriais'))))
await caso('mkt: sem o módulo não lê materiais', assertFails(listaRede(frMkSem)))
await caso('mkt: franqueadora com módulo lista tudo', assertSucceeds(getDocs(collection(redeMk, 'marketingMateriais'))))
await caso('mkt: franqueadora sem módulo não lista', assertFails(getDocs(collection(redeNoMk, 'marketingMateriais'))))
await caso('mkt: franqueadora cria material', assertSucceeds(setDoc(doc(redeMk, 'marketingMateriais', 'mat-novo'), materialNovo('eq-rede-mk', 'Rede Mkt'))))
await caso('mkt: material com IA exige o modelo', assertFails(setDoc(doc(redeMk, 'marketingMateriais', 'mat-ia'), materialNovo('eq-rede-mk', 'Rede Mkt', { geradoPorIA: true, iaModelo: '' }))))
await caso('mkt: material com IA registrada é aceito', assertSucceeds(setDoc(doc(redeMk, 'marketingMateriais', 'mat-ia'), materialNovo('eq-rede-mk', 'Rede Mkt', { geradoPorIA: true, iaModelo: 'Grok Imagine' }))))
await caso('mkt: material exige link https', assertFails(setDoc(doc(redeMk, 'marketingMateriais', 'mat-http'), materialNovo('eq-rede-mk', 'Rede Mkt', { url: 'http://exemplo.com/a' }))))
await caso('mkt: material recusa javascript: no link', assertFails(setDoc(doc(redeMk, 'marketingMateriais', 'mat-js'), materialNovo('eq-rede-mk', 'Rede Mkt', { url: 'javascript:alert(1)' }))))
await caso('mkt: material recusa tipo desconhecido', assertFails(setDoc(doc(adminMk, 'marketingMateriais', 'mat-x'), materialNovo('admin-1', 'Admin Rede', { tipo: 'exe' }))))
await caso('mkt: material recusa campo extra', assertFails(setDoc(doc(adminMk, 'marketingMateriais', 'mat-x'), materialNovo('admin-1', 'Admin Rede', { senha: 'x' }))))
await caso('mkt: autor forjado é recusado', assertFails(setDoc(doc(redeMk, 'marketingMateriais', 'mat-x'), materialNovo('eq-rede-mk', 'Outro Nome'))))
await caso('mkt: material da rede toda não lista unidades', assertFails(setDoc(doc(redeMk, 'marketingMateriais', 'mat-x'), materialNovo('eq-rede-mk', 'Rede Mkt', { publico: true, unidades: ['un-mk'] }))))
await caso('mkt: material direcionado exige ao menos uma unidade', assertFails(setDoc(doc(redeMk, 'marketingMateriais', 'mat-x'), materialNovo('eq-rede-mk', 'Rede Mkt', { publico: false, unidades: [] }))))
await caso('mkt: material direcionado com unidade é aceito', assertSucceeds(setDoc(doc(redeMk, 'marketingMateriais', 'mat-dir'), materialNovo('eq-rede-mk', 'Rede Mkt', { publico: false, unidades: ['un-mk'] }))))
await caso('mkt: franqueado não cria material', assertFails(setDoc(doc(frMk, 'marketingMateriais', 'mat-x'), materialNovo('fr-mk', 'Dono Mkt'))))
await caso('mkt: franqueadora sem módulo não cria material', assertFails(setDoc(doc(redeNoMk, 'marketingMateriais', 'mat-x'), materialNovo('eq-rede-nomk', 'Rede Sem Mkt'))))
await caso('mkt: edição mantém criadoEm', assertFails(updateDoc(doc(redeMk, 'marketingMateriais', 'mat-novo'), { criadoEm: serverTimestamp(), atualizadoPor: 'eq-rede-mk', atualizadoPorNome: 'Rede Mkt', atualizadoEm: serverTimestamp() })))
await caso('mkt: franqueadora edita material', assertSucceeds(updateDoc(doc(redeMk, 'marketingMateriais', 'mat-novo'), { ativo: false, atualizadoPor: 'eq-rede-mk', atualizadoPorNome: 'Rede Mkt', atualizadoEm: serverTimestamp() })))
await caso('mkt: ninguém apaga material', assertFails(deleteDoc(doc(adminMk, 'marketingMateriais', 'mat-rede'))))

await caso('mkt: unidade lista campanhas ativas', assertSucceeds(getDocs(query(collection(eqMk, 'marketingCampanhas'), where('ativo', '==', true)))))
await caso('mkt: unidade não lê campanha inativa', assertFails(getDoc(doc(eqMk, 'marketingCampanhas', 'camp-off'))))
await caso('mkt: franqueadora cria campanha', assertSucceeds(setDoc(doc(redeMk, 'marketingCampanhas', 'camp-nova'), {
  titulo: 'Natal', descricao: 'Campanha de fim de ano', tipo: 'data_comemorativa', inicio: new Date('2026-12-01'), fim: new Date('2026-12-25'), ativo: true,
  geradoPorIA: false, iaModelo: '', atualizadoPor: 'eq-rede-mk', atualizadoPorNome: 'Rede Mkt', atualizadoEm: serverTimestamp(),
})))
await caso('mkt: campanha com fim antes do início é recusada', assertFails(setDoc(doc(redeMk, 'marketingCampanhas', 'camp-x'), {
  titulo: 'Errada', descricao: '', tipo: 'campanha', inicio: new Date('2026-12-25'), fim: new Date('2026-12-01'), ativo: true,
  geradoPorIA: false, iaModelo: '', atualizadoPor: 'eq-rede-mk', atualizadoPorNome: 'Rede Mkt', atualizadoEm: serverTimestamp(),
})))
await caso('mkt: franqueado não cria campanha', assertFails(setDoc(doc(frMk, 'marketingCampanhas', 'camp-x'), {
  titulo: 'Minha', descricao: '', tipo: 'campanha', inicio: new Date('2026-12-01'), fim: new Date('2026-12-02'), ativo: true,
  geradoPorIA: false, iaModelo: '', atualizadoPor: 'fr-mk', atualizadoPorNome: 'Dono Mkt', atualizadoEm: serverTimestamp(),
})))

await caso('mkt: equipe abre pedido de peça', assertSucceeds(setDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-1'), pedido('eq-mk', 'Equipe Mkt'))))
await caso('mkt: pedido não nasce entregue', assertFails(setDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-x'), pedido('eq-mk', 'Equipe Mkt', { status: 'entregue' }))))
await caso('mkt: pedido não nasce com resposta', assertFails(setDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-x'), pedido('eq-mk', 'Equipe Mkt', { resposta: 'ok' }))))
await caso('mkt: pedido em nome de outra unidade é recusado', assertFails(setDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-x'), pedido('eq-mk', 'Equipe Mkt', { unidadeId: 'un-mk2', unidadeNome: 'Outra Mkt' }))))
await caso('mkt: pedido em nome de outra pessoa é recusado', assertFails(setDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-x'), pedido('eq-mk-b', 'Equipe Mkt B'))))
await caso('mkt: sem o módulo não pede peça', assertFails(setDoc(doc(frMkSem, 'marketingSolicitacoes', 'sol-x'), pedido('fr-mk-sem', 'Sem Mkt'))))
await caso('mkt: pedido com referência não-https é recusado', assertFails(setDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-x'), pedido('eq-mk', 'Equipe Mkt', { referenciaUrl: 'ftp://x' }))))
await caso('mkt: quem pediu lê o próprio pedido', assertSucceeds(getDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-1'))))
await caso('mkt: quem pediu lista os próprios pedidos', assertSucceeds(getDocs(query(collection(eqMk, 'marketingSolicitacoes'), where('uid', '==', 'eq-mk')))))
await caso('mkt: colega da equipe não lê o pedido', assertFails(getDoc(doc(eqMkB, 'marketingSolicitacoes', 'sol-1'))))
await caso('mkt: franqueado lista pedidos da unidade', assertSucceeds(getDocs(query(collection(frMk, 'marketingSolicitacoes'), where('unidadeId', '==', 'un-mk')))))
await caso('mkt: franqueado de outra unidade não lista', assertFails(getDocs(query(collection(frMk2, 'marketingSolicitacoes'), where('unidadeId', '==', 'un-mk')))))
await caso('mkt: franqueadora lista todos os pedidos', assertSucceeds(getDocs(collection(redeMk, 'marketingSolicitacoes'))))
await caso('mkt: unidade não muda status para em produção', assertFails(updateDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-1'), { status: 'em_producao', atualizadoEm: serverTimestamp() })))
await caso('mkt: franqueadora coloca em produção', assertSucceeds(updateDoc(doc(redeMk, 'marketingSolicitacoes', 'sol-1'), { status: 'em_producao', responsavelNome: 'Rede Mkt', atualizadoEm: serverTimestamp() })))
await caso('mkt: unidade não cancela pedido em produção', assertFails(updateDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-1'), { status: 'cancelada', atualizadoEm: serverTimestamp() })))
await caso('mkt: franqueadora pede informação', assertSucceeds(updateDoc(doc(redeMk, 'marketingSolicitacoes', 'sol-1'), { status: 'aguardando_unidade', resposta: 'Qual o endereço?', responsavelNome: 'Rede Mkt', atualizadoEm: serverTimestamp() })))
await caso('mkt: unidade não mexe na resposta da franqueadora', assertFails(updateDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-1'), { status: 'aberta', resposta: '', complemento: 'Rua X', atualizadoEm: serverTimestamp() })))
await caso('mkt: unidade não responde em branco', assertFails(updateDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-1'), { status: 'aberta', atualizadoEm: serverTimestamp() })))
await caso('mkt: resposta da unidade exige 2 caracteres', assertFails(updateDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-1'), { status: 'aberta', complemento: 'x', atualizadoEm: serverTimestamp() })))
await caso('mkt: unidade responde e o pedido volta para a fila', assertSucceeds(updateDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-1'), { status: 'aberta', complemento: 'Rua X, 100', atualizadoEm: serverTimestamp() })))
await caso('mkt: franqueadora pede informação de novo', assertSucceeds(updateDoc(doc(redeMk, 'marketingSolicitacoes', 'sol-1'), { status: 'aguardando_unidade', resposta: 'Qual o bairro?', responsavelNome: 'Rede Mkt', atualizadoEm: serverTimestamp() })))
await caso('mkt: unidade não repete a mesma resposta', assertFails(updateDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-1'), { status: 'aberta', complemento: 'Rua X, 100', atualizadoEm: serverTimestamp() })))
await caso('mkt: unidade responde de novo com texto novo', assertSucceeds(updateDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-1'), { status: 'aberta', complemento: 'Rua X, 100 — Centro', atualizadoEm: serverTimestamp() })))
await caso('mkt: entrega exige link', assertFails(updateDoc(doc(redeMk, 'marketingSolicitacoes', 'sol-1'), { status: 'entregue', responsavelNome: 'Rede Mkt', entregueEm: serverTimestamp(), atualizadoEm: serverTimestamp() })))
await caso('mkt: entrega com IA exige o modelo', assertFails(updateDoc(doc(redeMk, 'marketingSolicitacoes', 'sol-1'), { status: 'entregue', entregaUrl: 'https://drive.google.com/y', geradoPorIA: true, iaModelo: '', responsavelNome: 'Rede Mkt', entregueEm: serverTimestamp(), atualizadoEm: serverTimestamp() })))
await caso('mkt: responsável forjado é recusado', assertFails(updateDoc(doc(redeMk, 'marketingSolicitacoes', 'sol-1'), { status: 'em_producao', responsavelNome: 'Outra Pessoa', atualizadoEm: serverTimestamp() })))
await caso('mkt: franqueadora entrega com link e IA registrada', assertSucceeds(updateDoc(doc(redeMk, 'marketingSolicitacoes', 'sol-1'), { status: 'entregue', entregaUrl: 'https://drive.google.com/y', geradoPorIA: true, iaModelo: 'Grok Imagine', resposta: 'Pronto!', responsavelNome: 'Rede Mkt', entregueEm: serverTimestamp(), atualizadoEm: serverTimestamp() })))
await caso('mkt: pedido entregue não reabre', assertFails(updateDoc(doc(redeMk, 'marketingSolicitacoes', 'sol-1'), { status: 'em_producao', responsavelNome: 'Rede Mkt', entregueEm: null, atualizadoEm: serverTimestamp() })))
await caso('mkt: franqueado cancela pedido aberto da equipe', assertSucceeds((async () => {
  await setDoc(doc(eqMkB, 'marketingSolicitacoes', 'sol-2'), pedido('eq-mk-b', 'Equipe Mkt B'))
  await updateDoc(doc(frMk, 'marketingSolicitacoes', 'sol-2'), { status: 'cancelada', atualizadoEm: serverTimestamp() })
})()))
await caso('mkt: colega não cancela pedido de outro', assertFails((async () => {
  await setDoc(doc(eqMkB, 'marketingSolicitacoes', 'sol-3'), pedido('eq-mk-b', 'Equipe Mkt B'))
  await updateDoc(doc(eqMk, 'marketingSolicitacoes', 'sol-3'), { status: 'cancelada', atualizadoEm: serverTimestamp() })
})()))
await caso('mkt: ninguém apaga pedido', assertFails(deleteDoc(doc(redeMk, 'marketingSolicitacoes', 'sol-1'))))

void manual
await ambiente.cleanup()

const recusasNoLimite = estouros.length
if (recusasNoLimite) {
  console.error(`\nrecusas que ainda citam o limite de 1000 expressões: ${recusasNoLimite}`)
  process.exit(1)
}

if (falhas.length) {
  console.error(`\n${falhas.length} caso(s) falharam: ${falhas.join(', ')}`)
  process.exit(1)
}
console.log('\nregras: todos os casos passaram')
