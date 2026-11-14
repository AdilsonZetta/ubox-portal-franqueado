import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Anexos, DocumentoView } from '../components/DocumentoView'
import { Aviso, Button, Selo } from '../components/ui'
import { listarVersoes, registrarAceite, registrarLeitura } from '../lib/api'
import { useAuth } from '../lib/auth'
import { mensagemErro } from '../lib/errors'
import { formatarData, rotuloTipo } from '../lib/format'
import { leituraDaVersao } from '../lib/quiz'
import { usePortal } from '../lib/portal'
import { useVisao } from '../lib/visao'
import { aplicarSumario } from '../lib/text'
import { cadeiaCategoria } from '../lib/trilha'
import type { VersaoDocumento } from '../types'

export function DocumentoPage() {
  const { id = '' } = useParams()
  const imprimir = window.location.hash.includes('/imprimir')
  const { user } = useAuth()
  const { ehAdmin } = useVisao()
  const portal = usePortal()
  const documento = portal.documentos.find((item) => item.id === id)
  const [erro, setErro] = useState('')
  const [versoes, setVersoes] = useState<VersaoDocumento[]>([])
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (!documento || !user) return
    document.title = `${documento.titulo} · Portal Ubox`
    if (documento.status !== 'publicado') return
    if (leituraDaVersao(portal.leituras, user.uid, documento.id, documento.versao)) return
    void registrarLeitura(user, documento)
      .then(() => portal.atualizar())
      .catch(() => undefined)
  }, [documento?.id, documento?.versao, user?.uid])

  useEffect(() => {
    if (imprimir) {
      const timer = window.setTimeout(() => window.print(), 400)
      return () => window.clearTimeout(timer)
    }
  }, [imprimir])

  useEffect(() => {
    if (!ehAdmin || !documento) return
    void listarVersoes(documento.id).then(setVersoes).catch(() => undefined)
  }, [ehAdmin, documento?.id])

  if (!user) return null
  if (portal.carregando && !documento) return <p>Carregando documento…</p>
  if (!documento) return <Aviso tom="erro">Documento indisponível para o seu usuário.</Aviso>

  const trilha = cadeiaCategoria(portal.categorias, documento.categoriaId)
  const aceito = portal.aceites.some((aceite) => aceite.uid === user.uid && aceite.documentoId === documento.id && aceite.versao === documento.versao)
  const lido = leituraDaVersao(portal.leituras, user.uid, documento.id, documento.versao)

  async function aceitar() {
    if (!user || !documento) return
    setOcupado(true)
    setErro('')
    try {
      await registrarAceite(user, documento)
      await portal.atualizar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  const sumario = documento.formato === 'html' ? { html: documento.conteudoHtml, itens: [] } : aplicarSumario(documento.conteudoHtml)
  const documentoLeitura = { ...documento, conteudoHtml: sumario.html }
  const interativo = documento.formato === 'html'

  return (
    <article className={imprimir ? 'folha mx-auto w-full max-w-[1200px]' : 'mx-auto w-full max-w-[1200px]'}>
      <p className="no-print text-sm text-ink/50">
        <Link to="/biblioteca">Biblioteca</Link>
        {trilha.map((categoria) => (
          <span key={categoria.id}>
            {' / '}
            <Link to={`/biblioteca/${categoria.id}`}>{categoria.nome}</Link>
          </span>
        ))}
      </p>
      <header className="mt-3">
        <div className="flex flex-wrap gap-2">
          <Selo>{rotuloTipo(documento.tipo)}</Selo>
          <Selo tom="neutro">Versão {documento.versao}</Selo>
          {documento.leituraObrigatoria ? <Selo tom="marca">Leitura obrigatória</Selo> : null}
          {lido ? <Selo tom="lima">Lido</Selo> : null}
          {aceito ? <Selo tom="lima">Aceito</Selo> : null}
        </div>
        <h1 className="mt-3 text-3xl font-extrabold">{documento.titulo}</h1>
        <p className="mt-2 text-sm text-ink/55">
          Atualizado em {formatarData(documento.atualizadoEm)}
          {documento.atualizadoPorNome ? ` · ${documento.atualizadoPorNome}` : ''}
        </p>
      </header>
      <div className="no-print mt-4 flex flex-wrap gap-2">
        <Link to={`/documento/${documento.id}/imprimir`} className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold">
          Imprimir / PDF
        </Link>
        {ehAdmin ? (
          <Link to={`/admin/documento/${documento.id}`} className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold">
            Editar
          </Link>
        ) : null}
      </div>
      {erro ? <div className="mt-4"><Aviso tom="erro">{erro}</Aviso></div> : null}
      <div className={interativo ? 'mt-6' : 'mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_220px]'}>
        <div className={interativo ? '' : 'folha rounded-3xl border border-line bg-white p-5 shadow-sm md:p-8'}>
          <DocumentoView documento={documentoLeitura} />
          <Anexos anexos={documento.anexos} />
          <p className="mt-10 border-t border-line pt-4 text-xs text-ink/45">Documento controlado · Ubox Self Storage · versão {documento.versao}</p>
        </div>
        {sumario.itens.length ? (
          <aside className="no-print sticky top-6 hidden rounded-2xl border border-line bg-white p-4 xl:block">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Sumário</p>
            <ol className="mt-3 space-y-2">
              {sumario.itens.map((item) => (
                <li key={item.id} style={{ paddingLeft: `${(item.nivel - 1) * 10}px` }}>
                  <a href={`#${item.id}`} className="text-sm text-ink/70 hover:text-brand">
                    {item.texto}
                  </a>
                </li>
              ))}
            </ol>
          </aside>
        ) : null}
      </div>
      {documento.leituraObrigatoria && documento.status === 'publicado' ? (
        <div className="no-print sticky bottom-20 mt-4 rounded-2xl border border-line bg-white p-4 shadow-lg lg:bottom-4">
          {aceito ? (
            <Aviso tom="ok">Você registrou “Li e concordo” nesta versão.</Aviso>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">Ao confirmar, gravamos seu nome, e-mail, a versão e o horário do servidor.</p>
              <Button onClick={() => void aceitar()} disabled={ocupado}>
                Li e concordo
              </Button>
            </div>
          )}
        </div>
      ) : null}
      {versoes.length ? (
        <section className="no-print mt-6">
          <h2 className="text-sm font-semibold">Versões</h2>
          <ul className="mt-2 text-sm text-ink/70">
            {versoes.map((versao) => (
              <li key={versao.id}>
                Versão {versao.versao} · {formatarData(versao.criadoEm)} · {versao.autorNome}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  )
}
