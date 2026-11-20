import { Textura } from '../components/Textura'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Route } from 'lucide-react'
import { Aviso, Carregando, Selo, Vazio } from '../components/ui'
import { useAuth } from '../lib/auth'
import { primeiroNome, rotuloExibicao, seloExibicao, tipoExibicao, paraMillis } from '../lib/format'
import { leituraDaVersao } from '../lib/quiz'
import { usePortal } from '../lib/portal'
import { useVisao } from '../lib/visao'
import { filhosDe } from '../lib/trilha'
import { CartaoUniversidade } from './universidade/Universidade'

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
      <section className="apresentacao">
        <div className="px-5 py-7 sm:px-8 sm:py-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-lime-soft">Base de conhecimento · {user.unidade || 'Rede Ubox'}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Olá, {primeiroNome(user.nome)}. O que você precisa fazer?</h1>
          <form onSubmit={enviar} className="mt-5 flex max-w-2xl flex-col gap-2 sm:flex-row">
            <input
              value={pergunta}
              aria-label="Pergunta sobre a operação"
              onChange={(evento) => setPergunta(evento.target.value)}
              placeholder="Pergunte sobre um POP, uma política ou um passo da operação"
              className="min-h-11 min-w-0 flex-1 rounded-[10px] bg-surface px-3 py-2 text-sm text-ink"
            />
            <button className="min-h-11 rounded-[10px] bg-lime px-4 py-2 text-sm font-semibold text-ink hover:bg-lime-soft">Perguntar</button>
          </form>
        </div>
        <Textura className="h-8 w-full sm:h-12" />
      </section>
      {portal.erro ? <Aviso tom="erro">{portal.erro}</Aviso> : null}
      {portal.carregando ? <Carregando /> : null}

      {pendentes.length ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Atribuído para você</h2>
            <span className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-semibold tabular-nums text-brand">{pendentes.length} pendente{pendentes.length === 1 ? '' : 's'}</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {pendentes.slice(0, 4).map((documento) => (
              <Link key={documento.id} to={`/documento/${documento.id}`} className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 hover:border-brand">
                <span>
                  <span className="block text-sm font-semibold">{documento.titulo}</span>
                  <span className="text-xs text-muted">Aceite da versão {documento.versao}</span>
                </span>
                <span className="text-sm font-semibold text-brand">Ler</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <Link
        to="/manuais/trilha"
        className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 transition hover:border-brand hover:shadow-sm"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand-dark" aria-hidden="true">
          <Route className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-ink">Trilha de manuais</span>
          <span className="block text-sm text-muted">Os manuais abrem um de cada vez, com tempo mínimo de leitura. Veja onde você parou.</span>
        </span>
        <span className="text-sm font-semibold text-brand">Abrir</span>
      </Link>

      <CartaoUniversidade />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Áreas</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {raizes.map((categoria) => (
            <Link key={categoria.id} to={`/biblioteca/${categoria.id}`} className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-sm hover:border-brand">
              {categoria.nome.replace(/^\d+\s*/, '')}
            </Link>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-semibold">Documentos recentes</h2>
          <Link to="/biblioteca" className="text-sm font-semibold text-brand">Ver todos</Link>
        </div>
        {recentes.map((documento) => (
          <Link key={documento.id} to={`/documento/${documento.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-paper">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10 text-[10px] font-bold uppercase text-brand-dark">{seloExibicao(tipoExibicao(documento))}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{documento.titulo}</span>
              <span className="text-xs text-muted">{rotuloExibicao(tipoExibicao(documento))} · versão {documento.versao}</span>
            </span>
            {leituraDaVersao(portal.leituras, user.uid, documento.id, documento.versao) ? <Selo tom="lima">Lido</Selo> : null}
          </Link>
        ))}
        {!recentes.length && !portal.carregando ? <Vazio titulo="Nenhum documento publicado ainda." texto="Consulte as áreas ou volte depois para ver novos documentos." /> : null}
      </section>
    </div>
  )
}
