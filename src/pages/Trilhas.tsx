import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Aviso, Selo, Vazio } from '../components/ui'
import { emitirCertificado } from '../lib/api'
import { useAuth } from '../lib/auth'
import { codigoCertificado } from '../lib/format'
import { usePortal } from '../lib/portal'
import { useVisao } from '../lib/visao'
import { quizAprovado, trilhaConcluida, ultimaTentativaAprovada } from '../lib/quiz'

export function TrilhasPage() {
  const { trilhas, carregando } = usePortal()
  const { ehAdmin } = useVisao()
  const visiveis = trilhas.filter((trilha) => trilha.publicado || ehAdmin)
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">Trilhas de treinamento</h1>
      <p className="max-w-2xl text-sm text-ink/65">Percursos com documentos e quizzes. A nota é calculada neste aparelho. Ao concluir, o certificado fica pronto para impressão.</p>
      {!carregando && !visiveis.length ? <Vazio titulo="Nenhuma trilha publicada" texto="A franqueadora monta os percursos de integração aqui." /> : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {visiveis.map((trilha) => (
          <li key={trilha.id}>
            <Link to={`/trilhas/${trilha.id}`} className="block h-full rounded-2xl border border-line bg-white p-5 hover:border-brand">
              <div className="flex gap-2">
                {!trilha.publicado ? <Selo tom="alerta">Rascunho</Selo> : <Selo tom="lima">Publicada</Selo>}
              </div>
              <h2 className="mt-2 text-lg font-bold">{trilha.titulo}</h2>
              <p className="mt-1 text-sm text-ink/65">{trilha.descricao}</p>
              <p className="mt-3 text-xs text-ink/45">{trilha.itens.length} etapas · mínimo {trilha.notaMinima}%</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TrilhaPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const portal = usePortal()
  const trilha = portal.trilhas.find((item) => item.id === id)
  const certificado = portal.certificados.find((item) => item.trilhaId === id && item.uid === user?.uid)

  useEffect(() => {
    if (!user || !trilha || certificado) return
    if (!trilhaConcluida(trilha, user.uid, portal.documentos, portal.leituras, portal.tentativas)) return
    const quizzes = trilha.itens.filter((item) => item.tipo === 'quiz').map((item) => item.refId)
    const tentativa = ultimaTentativaAprovada(portal.tentativas, user.uid, quizzes)
    void emitirCertificado({
      uid: user.uid,
      trilhaId: trilha.id,
      nome: user.nome,
      trilhaTitulo: trilha.titulo.slice(0, 120),
      codigo: codigoCertificado(trilha.id),
      tentativaId: tentativa?.id || 'sem-quiz',
    })
      .then(() => portal.atualizar())
      .catch(() => undefined)
  }, [user, trilha, certificado, portal])

  if (!trilha) return <Aviso tom="erro">Trilha indisponível.</Aviso>
  if (!user) return null
  const concluida = trilhaConcluida(trilha, user.uid, portal.documentos, portal.leituras, portal.tentativas)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <p className="text-sm text-ink/50">
        <Link to="/trilhas">Trilhas</Link>
      </p>
      <h1 className="text-3xl font-extrabold">{trilha.titulo}</h1>
      <p className="text-ink/70">{trilha.descricao}</p>
      {concluida ? (
        <Aviso tom="ok">
          Trilha concluída.{' '}
          <Link to={`/certificado/${trilha.id}`} className="font-semibold underline">
            Abrir certificado
          </Link>
        </Aviso>
      ) : null}
      <ol className="space-y-3">
        {trilha.itens.map((item, indice) => {
          const feito = item.tipo === 'quiz'
            ? quizAprovado(portal.tentativas, user.uid, item.refId)
            : portal.leituras.some((leitura) => leitura.uid === user.uid && leitura.documentoId === item.refId && leitura.versao === portal.documentos.find((documento) => documento.id === item.refId)?.versao)
          const destino = item.tipo === 'quiz' ? `/trilhas/${trilha.id}/quiz/${item.refId}` : `/documento/${item.refId}`
          return (
            <li key={item.id}>
              <Link to={destino} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4 hover:border-brand">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-sm font-bold text-white">{indice + 1}</span>
                <span className="flex-1">
                  <span className="block font-semibold">{item.titulo}</span>
                  <span className="text-xs text-ink/50">{item.tipo === 'quiz' ? 'Quiz' : 'Documento'}</span>
                </span>
                {feito ? <Selo tom="lima">Concluído</Selo> : <Selo>Pendente</Selo>}
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
