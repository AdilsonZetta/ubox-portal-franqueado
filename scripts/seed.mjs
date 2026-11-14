import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { entrarComoAdmin } from './firebase-client.mjs'
import { CATEGORIAS, DOCUMENTOS, QUIZ, TRILHA } from './seed-data.mjs'

const { db, usuario } = await entrarComoAdmin()

function semTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function criadoEmDe(valor) {
  return valor && typeof valor.toMillis === 'function' ? valor : serverTimestamp()
}

async function gravar(caminho, id, campos) {
  const ref = doc(db, caminho, id)
  const anterior = await getDoc(ref)
  await setDoc(ref, {
    ...campos,
    criadoEm: criadoEmDe(anterior.exists() ? anterior.data().criadoEm : undefined),
    atualizadoEm: serverTimestamp(),
  })
  console.log(`${anterior.exists() ? 'atualizado' : 'criado'} ${caminho}/${id}`)
}

const audienciaPublica = { publico: true, unidades: [], papeis: [], uidsExtra: [], uids: [] }

for (const [id, nome, ordem, descricao] of CATEGORIAS) {
  const ref = doc(db, 'categorias', id)
  const anterior = await getDoc(ref)
  const atual = anterior.exists() ? anterior.data() : {}
  const nomeAtual = typeof atual.nome === 'string' && atual.nome.trim() ? atual.nome : typeof atual.titulo === 'string' ? atual.titulo : nome
  await setDoc(ref, {
    nome: nomeAtual,
    descricao: typeof atual.descricao === 'string' && atual.descricao.trim() ? atual.descricao : descricao,
    ordem: typeof atual.ordem === 'number' ? atual.ordem : ordem,
    parentId: typeof atual.parentId === 'string' ? atual.parentId : null,
    publico: atual.publico === false ? false : true,
    unidades: Array.isArray(atual.unidades) ? atual.unidades : [],
    papeis: Array.isArray(atual.papeis) ? atual.papeis : [],
    uidsExtra: Array.isArray(atual.uidsExtra) ? atual.uidsExtra : [],
    uids: atual.publico === false && Array.isArray(atual.uids) ? atual.uids : [],
    criadoEm: criadoEmDe(atual.criadoEm),
    atualizadoEm: serverTimestamp(),
  })
  console.log(`categoria ${id}`)
}

for (const documento of DOCUMENTOS) {
  const ref = doc(db, 'documentos', documento.id)
  const anterior = await getDoc(ref)
  if (anterior.exists() && process.env.SEED_FORCE !== '1') {
    console.log(`documento ${documento.id} já existe (use SEED_FORCE=1 para regravar)`)
    continue
  }
  const conteudoTexto = semTags(documento.htmlConteudo || documento.html).slice(0, 800000)
  await setDoc(ref, {
    titulo: documento.titulo,
    categoriaId: documento.categoriaId,
    tipo: documento.tipo,
    formato: documento.formato,
    status: documento.status,
    versao: 1,
    leituraObrigatoria: documento.leituraObrigatoria,
    conteudoHtml: documento.html,
    conteudoTexto,
    htmlConteudo: documento.htmlConteudo || '',
    htmlUrl: '',
    anexos: documento.id === 'doc-boas-vindas' ? [{ nome: 'Site da rede', url: 'https://ubox.net.br', tipo: 'link' }] : [],
    ...audienciaPublica,
    criadoEm: criadoEmDe(anterior.exists() ? anterior.data().criadoEm : undefined),
    atualizadoEm: serverTimestamp(),
    atualizadoPor: usuario.uid,
    atualizadoPorNome: 'Franqueadora',
    publicadoEm: documento.status === 'publicado' ? serverTimestamp() : null,
  })
  if (documento.status === 'publicado') {
    const versaoRef = doc(db, 'documentos', documento.id, 'versoes', '1')
    const versao = await getDoc(versaoRef)
    if (!versao.exists()) {
      await setDoc(versaoRef, {
        versao: 1,
        titulo: documento.titulo,
        formato: documento.formato,
        conteudoHtml: documento.html,
        conteudoTexto,
        htmlConteudo: documento.htmlConteudo || '',
        htmlUrl: '',
        criadoEm: serverTimestamp(),
        autorId: usuario.uid,
        autorNome: 'Franqueadora',
      })
    }
  }
  console.log(`documento ${documento.id}`)
}

const trilhaRef = doc(db, 'trilhas', TRILHA.id)
const trilhaAnterior = await getDoc(trilhaRef)
if (!trilhaAnterior.exists() || process.env.SEED_FORCE === '1') {
  await gravar('trilhas', TRILHA.id, {
    titulo: TRILHA.titulo,
    descricao: TRILHA.descricao,
    notaMinima: TRILHA.notaMinima,
    publicado: true,
    itens: TRILHA.itens,
    ...audienciaPublica,
  })
  await gravar('quizzes', QUIZ.id, {
    trilhaId: TRILHA.id,
    titulo: QUIZ.titulo,
    notaMinima: TRILHA.notaMinima,
    perguntas: QUIZ.perguntas,
    publicado: true,
    ...audienciaPublica,
  })
} else {
  console.log('trilha de exemplo já existe')
}

const avisoRef = doc(db, 'avisos', 'aviso-biblioteca-inicial')
if (!(await getDoc(avisoRef)).exists()) {
  await setDoc(avisoRef, {
    titulo: 'Biblioteca de exemplo publicada',
    mensagem: 'Há um manual de boas-vindas, POPs e uma trilha de integração para validar o portal.',
    documentoId: 'doc-boas-vindas',
    tipo: 'geral',
    ...audienciaPublica,
    criadoEm: serverTimestamp(),
  })
  console.log('aviso inicial criado')
}

console.log('Seed concluído.')
