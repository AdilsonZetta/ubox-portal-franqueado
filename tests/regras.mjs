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
await caso('quem tem universidade lê o gabarito', assertSucceeds(getDoc(doc(dono, 'gabarito', 'g1'))))
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

void manual
await ambiente.cleanup()

const recusasNoLimite = estouros.length
if (recusasNoLimite) {
  console.error(`\nrecusas que ainda citam o limite de 1000 expressões: ${recusasNoLimite}`)
}

if (falhas.length) {
  console.error(`\n${falhas.length} caso(s) falharam: ${falhas.join(', ')}`)
  process.exit(1)
}
console.log('\nregras: todos os casos passaram')
