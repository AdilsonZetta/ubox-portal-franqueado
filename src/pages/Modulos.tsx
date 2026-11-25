import { Aviso, Button, Carregando, Selo, Vazio } from '../components/ui'
import { usePendencias } from '../lib/usePendencias'
import { Textura } from '../components/Textura'
import { Link, useParams } from 'react-router-dom'
import { GRUPOS, MODULOS, moduloPorSlug } from '../data/modulos'
import { useAuth } from '../lib/auth'
import { primeiroNome } from '../lib/format'
import { podeModulo } from '../lib/modulosAcesso'
import { useVisao } from '../lib/visao'
import { CartaoUniversidade } from './universidade/Universidade'

export function ModulosPage() {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const pendencias = usePendencias()
  const modulos = MODULOS.filter((modulo) => ehAdmin || podeModulo(pessoa, modulo.slug, comoFranqueado))
  return (
    <div>
      <div className="mx-auto max-w-6xl">
        <header className="apresentacao">
          <div className="relative px-5 py-8 sm:px-8 sm:py-10">
            <Textura variante="linha" className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden h-full w-1/3 opacity-50 xl:block" />
            <p className="text-xs font-semibold uppercase tracking-wider text-lime-soft">UBOX · Portal do Franqueado</p>
            <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Olá, {primeiroNome(user?.nome ?? '')}.</h1>
            <p className="mt-3 max-w-xl text-base font-light leading-relaxed text-line-strong">
              {modulos.length ? 'Escolha um dos módulos abaixo para continuar.' : 'Ainda não há módulos disponíveis nesta visão.'}
            </p>
          </div>
          <Textura className="h-8 w-full sm:h-12" />
        </header>
        {comoFranqueado ? (
          <div className="mt-6"><Aviso>Na simulação, as pendências da unidade ficam ocultas para proteger os dados dela.</Aviso></div>
        ) : (
          <section className="mt-6 space-y-3" aria-labelledby="pendencias-titulo">
            <h2 id="pendencias-titulo" className="text-lg font-bold">Pendências</h2>
            {pendencias.carregando ? <Carregando texto="Consultando pendências…" /> : null}
            {pendencias.falhou ? (
              <Aviso>
                Algumas pendências ficaram indisponíveis.{' '}
                <Button variant="ghost" onClick={pendencias.recarregar} disabled={pendencias.carregando}>Tentar novamente</Button>
              </Aviso>
            ) : null}
            {!pendencias.carregando && !pendencias.falhou && !pendencias.itens.length ? (
              <p className="text-sm text-muted">Você está em dia. Escolha um módulo abaixo para continuar.</p>
            ) : null}
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {pendencias.itens.map((item) => (
                <li key={item.id}>
                  <Link to={item.para} className="block rounded-2xl border border-line bg-surface p-4 hover:border-brand">
                    <p className="mb-2 font-semibold">{item.titulo}</p>
                    <Selo tom={item.tom === 'alerta' ? 'alerta' : 'neutro'}>{item.detalhe}</Selo>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {podeModulo(pessoa, 'universidade', comoFranqueado) ? (
          <div className="mt-6 max-w-2xl">
            <CartaoUniversidade />
          </div>
        ) : null}
        <div className="mt-8 space-y-8">
          {!modulos.length ? <Vazio titulo="Nenhum módulo disponível" texto="Confirme com a franqueadora quais módulos estão liberados." /> : null}
          {GRUPOS.map((grupo) => {
            const itens = modulos.filter((modulo) => modulo.grupo === grupo)
            if (!itens.length) return null
            return (
            <section key={grupo}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{grupo}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {itens.map((modulo) => {
                  const Icone = modulo.icon
                  const destino = modulo.ativo && modulo.para ? modulo.para : `/modulos/${modulo.slug}`
                  return (
                    <Link
                      key={modulo.slug}
                      to={destino}
                      className="cartao-modulo flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5"
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="icone-modulo grid h-11 w-11 place-items-center rounded-[10px]">
                          <Icone className="h-5 w-5" aria-hidden="true" />
                        </span>
                        {modulo.ativo ? null : <Selo>Em breve</Selo>}
                      </span>
                      <h3 className="mt-4 font-bold leading-snug">{modulo.nome}</h3>
                      <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">{modulo.descricao}</p>
                    </Link>
                  )
                })}
              </div>
            </section>
            )
          })}
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
          <Icone className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-muted">{modulo.grupo}</p>
        <h1 className="mt-1 text-3xl font-bold">{modulo.nome}</h1>
        <div className="mt-3"><Selo>Em breve</Selo></div>
        <p className="mt-4 text-ink/70">{modulo.descricao} Este módulo ainda não está ligado. Quando abrir, a unidade vai encontrar aqui:</p>
        <ul className="mt-6 space-y-3">
          {modulo.recursos.map((recurso) => (
            <li key={recurso} className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
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
