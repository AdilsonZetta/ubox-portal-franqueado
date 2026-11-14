import { Link } from 'react-router-dom'
import { MODELOS } from '../data/modelos'
import { useAuth } from '../lib/auth'
import { rotuloTipo } from '../lib/format'

export function ModelosPage() {
  const { user } = useAuth()
  const areas = [...new Set(MODELOS.map((modelo) => modelo.area))]
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Modelos</h1>
        <p className="text-sm text-ink/55">Comece um POP, uma política ou um checklist sem página em branco. A franqueadora adapta e publica.</p>
      </header>
      {areas.map((area) => (
        <section key={area}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink/40">{area}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {MODELOS.filter((modelo) => modelo.area === area).map((modelo) => (
              <article key={modelo.id} className="rounded-2xl border border-line bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">{rotuloTipo(modelo.tipo)}</p>
                <h3 className="mt-1 font-semibold">{modelo.nome}</h3>
                {user?.papel === 'admin' ? (
                  <Link to={`/admin/documento/novo?modelo=${modelo.id}`} className="mt-3 inline-block text-sm font-semibold text-brand">
                    Usar modelo
                  </Link>
                ) : (
                  <p className="mt-3 text-xs text-ink/45">A franqueadora usa este modelo para publicar o documento.</p>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
