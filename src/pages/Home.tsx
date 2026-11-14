import { Link } from 'react-router-dom'
import { Aviso, Carregando, Selo } from '../components/ui'
import { useAuth } from '../lib/auth'
import { primeiroNome, rotuloTipo } from '../lib/format'
import { leituraDaVersao } from '../lib/quiz'
import { usePortal } from '../lib/portal'
import { filhosDe } from '../lib/trilha'
import { paraMillis } from '../lib/format'

export function HomePage() {
  const { user } = useAuth()
  const portal = usePortal()
  if (!user) return null
  const raizes = filhosDe(portal.categorias, null)
  const obrigatorios = portal.documentos.filter((documento) => documento.leituraObrigatoria && documento.status === 'publicado')
  const pendentes = obrigatorios.filter(
    (documento) => !portal.aceites.some((aceite) => aceite.documentoId === documento.id && aceite.versao === documento.versao && aceite.uid === user.uid),
  )
  const recentes = [...portal.documentos]
    .filter((documento) => documento.status === 'publicado')
    .sort((a, b) => paraMillis(b.atualizadoEm) - paraMillis(a.atualizadoEm))
    .slice(0, 5)

  return (
    <div className="space-y-8">
      <header className="rise">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Biblioteca da rede</p>
        <h1 className="mt-2 text-3xl font-extrabold md:text-4xl">Olá, {primeiroNome(user.nome)}.</h1>
        <p className="mt-2 max-w-2xl text-ink/70">
          POPs, manuais e trilhas da Ubox para a unidade {user.unidade || 'da rede'}. O que está publicado aqui é o combinado da franquia.
        </p>
      </header>
      {portal.erro ? <Aviso tom="erro">{portal.erro}</Aviso> : null}
      {portal.carregando ? <Carregando /> : null}

      {pendentes.length ? (
        <section className="rounded-3xl border border-brand/30 bg-white p-5">
          <h2 className="font-bold">Leitura obrigatória</h2>
          <ul className="mt-3 divide-y divide-line">
            {pendentes.map((documento) => (
              <li key={documento.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{documento.titulo}</p>
                  <p className="text-xs text-ink/55">Versão {documento.versao}</p>
                </div>
                <Link to={`/documento/${documento.id}`} className="text-sm font-semibold text-brand">
                  Ler e aceitar
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 font-bold">Categorias</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {raizes.map((categoria, indice) => {
            const quantidade = portal.documentos.filter((documento) => documento.categoriaId === categoria.id && documento.status === 'publicado').length
            return (
              <Link
                key={categoria.id}
                to={`/biblioteca/${categoria.id}`}
                className="rise rounded-2xl border border-line bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand"
                style={{ animationDelay: `${indice * 40}ms` }}
              >
                <p className="text-xs font-bold uppercase tracking-wide text-brand">{String(categoria.ordem).padStart(2, '0')}</p>
                <h3 className="mt-1 font-semibold">{categoria.nome}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-ink/60">{categoria.descricao}</p>
                <p className="mt-3 text-xs text-ink/45">{quantidade} documento{quantidade === 1 ? '' : 's'}</p>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-bold">Atualizados recentemente</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
            {recentes.map((documento) => (
              <li key={documento.id}>
                <Link to={`/documento/${documento.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                  <span>
                    <span className="block font-medium">{documento.titulo}</span>
                    <span className="text-xs text-ink/50">{rotuloTipo(documento.tipo)} · v{documento.versao}</span>
                  </span>
                  {leituraDaVersao(portal.leituras, user.uid, documento.id, documento.versao) ? <Selo tom="lima">Lido</Selo> : null}
                </Link>
              </li>
            ))}
            {!recentes.length && !portal.carregando ? <li className="px-4 py-6 text-sm text-ink/60">Nenhum documento publicado ainda.</li> : null}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 font-bold">Trilhas</h2>
          <ul className="space-y-3">
            {portal.trilhas
              .filter((trilha) => trilha.publicado || user.papel === 'admin')
              .slice(0, 4)
              .map((trilha) => (
                <li key={trilha.id}>
                  <Link to={`/trilhas/${trilha.id}`} className="block rounded-2xl border border-line bg-white p-4 hover:border-brand">
                    <p className="font-semibold">{trilha.titulo}</p>
                    <p className="mt-1 text-sm text-ink/60">{trilha.itens.length} etapas · nota mínima {trilha.notaMinima}</p>
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
