import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Aviso, Carregando, Selo, Vazio } from '../components/ui'
import { useVisao } from '../lib/visao'
import { formatarData, rotuloExibicao, seloExibicao, tipoExibicao, tiposPresentes, type TipoExibicao } from '../lib/format'
import { usePortal } from '../lib/portal'
import { cadeiaCategoria, filhosDe } from '../lib/trilha'
import { paraMillis } from '../lib/format'
import { useAcessoTrilha } from '../lib/useAcessoTrilha'

export function BibliotecaPage() {
  const { categoriaId } = useParams()
  const { ehAdmin } = useVisao()
  const { categorias, documentos, carregando, erro } = usePortal()
  const [filtro, setFiltro] = useState<TipoExibicao | 'todos'>('todos')
  const trilhaAcesso = useAcessoTrilha()
  const atual = categorias.find((categoria) => categoria.id === categoriaId)
  const filhos = filhosDe(categorias, atual ? atual.id : null)
  const trilha = atual ? cadeiaCategoria(categorias, atual.id) : []
  const daPasta = useMemo(
    () =>
      documentos
        .filter((documento) => (ehAdmin ? true : documento.status === 'publicado'))
        .filter((documento) => (atual ? documento.categoriaId === atual.id : true)),
    [documentos, atual, ehAdmin],
  )
  // Os filtros mostram só os tipos que esta pasta tem.
  const tipos = useMemo(() => tiposPresentes(daPasta), [daPasta])
  useEffect(() => {
    if (filtro !== 'todos' && !tipos.includes(filtro)) setFiltro('todos')
  }, [filtro, tipos])
  const lista = useMemo(
    () =>
      daPasta
        .filter((documento) => (filtro === 'todos' ? true : tipoExibicao(documento) === filtro))
        .sort((a, b) => paraMillis(b.atualizadoEm) - paraMillis(a.atualizadoEm)),
    [daPasta, filtro],
  )
  const filtros: Array<TipoExibicao | 'todos'> = tipos.length ? ['todos', ...tipos] : []

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <p className="text-sm text-ink/45">
          <Link to="/biblioteca">Documentos</Link>
          {trilha.map((categoria) => (
            <span key={categoria.id}>
              {'  /  '}
              <Link to={`/biblioteca/${categoria.id}`}>{categoria.nome.replace(/^\d+\s*/, '')}</Link>
            </span>
          ))}
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">{atual ? atual.nome.replace(/^\d+\s*/, '') : 'Todos os documentos'}</h1>
            <p className="text-sm text-ink/55">{atual?.descricao || 'POPs, manuais, políticas e processos da rede.'}</p>
          </div>
          {ehAdmin ? (
            <Link to="/admin/documento/novo" className="rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white">
              Novo documento
            </Link>
          ) : null}
        </div>
      </header>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {carregando ? <Carregando /> : null}
      {filhos.length ? (
        <div className="flex gap-2 overflow-x-auto">
          {filhos.map((categoria) => (
            <Link key={categoria.id} to={`/biblioteca/${categoria.id}`} className="shrink-0 rounded-xl border border-line bg-white px-3 py-2 text-sm hover:border-brand">
              {categoria.nome.replace(/^\d+\s*/, '')}
            </Link>
          ))}
        </div>
      ) : null}
      {filtros.length ? (
      <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Filtrar por tipo">
        {filtros.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFiltro(item)}
            aria-pressed={item === filtro}
            className={item === filtro ? 'rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white' : 'rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink/60'}
          >
            {item === 'todos' ? 'Todos' : rotuloExibicao(item)}
          </button>
        ))}
      </div>
      ) : null}
      {lista.length ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {lista.map((documento) => {
            const acesso = trilhaAcesso.acesso(documento.id)
            if (!acesso.liberado) {
              return (
                <div key={documento.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0" aria-label={`${documento.titulo}: bloqueado pela trilha`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-paper text-ink/45"><Lock className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink/55">{documento.titulo}</span>
                    <span className="text-xs text-ink/40">Abre na trilha de manuais, depois do manual anterior.</span>
                  </span>
                  <Link to="/manuais/trilha" className="shrink-0 text-xs font-semibold text-brand-dark hover:underline">Ver na trilha</Link>
                </div>
              )
            }
            return (
            <Link key={documento.id} to={`/documento/${documento.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-paper">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-paper text-[10px] font-bold uppercase text-ink/70">{seloExibicao(tipoExibicao(documento))}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{documento.titulo}</span>
                <span className="text-xs text-ink/40">Atualizado {formatarData(documento.atualizadoEm)}</span>
              </span>
              <span className="hidden text-xs text-ink/40 sm:block">v{documento.versao}</span>
              {acesso.estado === 'concluido' ? <Selo tom="lima">Trilha: concluído</Selo> : acesso.estado ? <Selo>Na trilha</Selo> : null}
              {documento.status === 'rascunho' ? <Selo tom="alerta">Rascunho</Selo> : null}
              {documento.leituraObrigatoria ? <Selo tom="marca">Aceite</Selo> : null}
            </Link>
            )
          })}
        </div>
      ) : (
        <Vazio titulo="Nenhum documento neste filtro" texto="A franqueadora publica os materiais oficiais nesta área." />
      )}
    </div>
  )
}
