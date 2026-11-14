import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Aviso, Carregando, Selo } from '../components/ui'
import { useAuth } from '../lib/auth'
import { primeiroNome, rotuloTipo, paraMillis } from '../lib/format'
import { leituraDaVersao } from '../lib/quiz'
import { usePortal } from '../lib/portal'
import { useVisao } from '../lib/visao'
import { filhosDe } from '../lib/trilha'

export function HomePage() {
  const { user } = useAuth()
  const { ehAdmin } = useVisao()
  const portal = usePortal()
  const navigate = useNavigate()
  const [pergunta, setPergunta] = useState('')
  if (!user) return null
  const raizes = filhosDe(portal.categorias, null)
  const publicados = portal.documentos.filter((documento) => documento.status === 'publicado' || ehAdmin)
  const pendentes = publicados.filter(
    (documento) =>
      documento.leituraObrigatoria &&
      documento.status === 'publicado' &&
      !portal.aceites.some((aceite) => aceite.documentoId === documento.id && aceite.versao === documento.versao && aceite.uid === user.uid),
  )
  const recentes = [...publicados].sort((a, b) => paraMillis(b.atualizadoEm) - paraMillis(a.atualizadoEm)).slice(0, 6)

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    const texto = pergunta.trim()
    if (!texto) return
    navigate(`/pergunte?q=${encodeURIComponent(texto)}`)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="pt-2 text-center">
        <p className="text-sm font-medium text-ink/50">Base de conhecimento · {user.unidade || 'Rede Ubox'}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">Olá, {primeiroNome(user.nome)}. O que você precisa fazer?</h1>
        <form onSubmit={enviar} className="mx-auto mt-5 flex max-w-2xl gap-2 rounded-2xl border border-line bg-white p-2 shadow-sm">
          <input
            value={pergunta}
            onChange={(evento) => setPergunta(evento.target.value)}
            placeholder="Pergunte sobre um POP, uma política ou um passo da operação"
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          />
          <button className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">Perguntar</button>
        </form>
      </section>
      {portal.erro ? <Aviso tom="erro">{portal.erro}</Aviso> : null}
      {portal.carregando ? <Carregando /> : null}

      {pendentes.length ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/45">Atribuído para você</h2>
            <span className="text-xs text-brand-dark">{pendentes.length} pendente{pendentes.length === 1 ? '' : 's'}</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {pendentes.slice(0, 4).map((documento) => (
              <Link key={documento.id} to={`/documento/${documento.id}`} className="flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3 hover:border-brand">
                <span>
                  <span className="block text-sm font-semibold">{documento.titulo}</span>
                  <span className="text-xs text-ink/45">Aceite da versão {documento.versao}</span>
                </span>
                <span className="text-sm font-semibold text-brand">Ler</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink/45">Áreas</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {raizes.map((categoria) => (
            <Link key={categoria.id} to={`/biblioteca/${categoria.id}`} className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:border-brand">
              {categoria.nome.replace(/^\d+\s*/, '')}
            </Link>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-semibold">Documentos recentes</h2>
          <Link to="/biblioteca" className="text-sm font-semibold text-brand">Ver todos</Link>
        </div>
        {recentes.map((documento) => (
          <Link key={documento.id} to={`/documento/${documento.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-paper">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10 text-[10px] font-bold uppercase text-brand-dark">{rotuloTipo(documento.tipo).slice(0, 3)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{documento.titulo}</span>
              <span className="text-xs text-ink/45">{rotuloTipo(documento.tipo)} · versão {documento.versao}</span>
            </span>
            {leituraDaVersao(portal.leituras, user.uid, documento.id, documento.versao) ? <Selo tom="lima">Lido</Selo> : null}
          </Link>
        ))}
        {!recentes.length && !portal.carregando ? <p className="px-4 py-8 text-sm text-ink/50">Nenhum documento publicado ainda.</p> : null}
      </section>
    </div>
  )
}
