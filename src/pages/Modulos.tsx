import { Link, useParams } from 'react-router-dom'
import { GRUPOS, MODULOS, moduloPorSlug } from '../data/modulos'
import { useAuth } from '../lib/auth'
import { primeiroNome } from '../lib/format'

export function ModulosPage() {
  const { user } = useAuth()
  return (
    <div>
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-medium text-ink/50">UBOX · Portal do Franqueado</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Olá, {primeiroNome(user?.nome ?? '')}. Escolha um módulo.</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Cada frente da rede tem o seu lugar. Manuais e a Universidade já estão abertos. Os demais módulos mostram o que vem por aí.
        </p>
        <div className="mt-8 space-y-8">
          {GRUPOS.map((grupo) => (
            <section key={grupo}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/40">{grupo}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {MODULOS.filter((modulo) => modulo.grupo === grupo).map((modulo) => {
                  const Icone = modulo.icon
                  const destino = modulo.ativo && modulo.para ? modulo.para : `/modulos/${modulo.slug}`
                  return (
                    <Link
                      key={modulo.slug}
                      to={destino}
                      className="group flex flex-col rounded-2xl border border-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md"
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand transition group-hover:bg-brand group-hover:text-white">
                          <Icone className="h-5 w-5" />
                        </span>
                        <span className={modulo.ativo ? 'rounded-full bg-lime/25 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-lime-dark' : 'rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink/45'}>
                          {modulo.ativo ? 'Aberto' : 'Em breve'}
                        </span>
                      </span>
                      <h3 className="mt-4 font-bold leading-snug">{modulo.nome}</h3>
                      <p className="mt-1 flex-1 text-sm leading-relaxed text-ink/60">{modulo.descricao}</p>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ModuloEmBrevePage() {
  const { slug = '' } = useParams()
  const modulo = moduloPorSlug(slug)
  if (!modulo || modulo.ativo) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper">
        <Link to="/" className="font-semibold text-brand">Voltar aos módulos</Link>
      </div>
    )
  }
  const Icone = modulo.icon
  return (
    <div className="mx-auto max-w-2xl">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand">
          <Icone className="h-7 w-7" />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-ink/40">{modulo.grupo}</p>
        <h1 className="mt-1 text-3xl font-extrabold">{modulo.nome}</h1>
        <span className="mt-3 inline-flex rounded-full bg-ink/5 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-ink/50">Em breve</span>
        <p className="mt-4 text-ink/70">{modulo.descricao} Este módulo ainda não está ligado. Quando abrir, a unidade vai encontrar aqui:</p>
        <ul className="mt-6 space-y-3">
          {modulo.recursos.map((recurso) => (
            <li key={recurso} className="rounded-2xl border border-line bg-white px-4 py-3 text-sm">
              {recurso}
            </li>
          ))}
        </ul>
        <Link to="/" className="mt-8 inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">
          Voltar aos módulos
        </Link>
    </div>
  )
}
