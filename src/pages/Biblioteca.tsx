import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Aviso, Carregando, Selo, Vazio } from '../components/ui'
import { useAuth } from '../lib/auth'
import { podeGerirTrilha } from '../lib/manuaisTrilha'
import { useVisao } from '../lib/visao'
import { formatarData, rotuloExibicao, seloExibicao, tipoExibicao, tiposPresentes, type TipoExibicao } from '../lib/format'
import { usePortal } from '../lib/portal'
import { cadeiaCategoria, filhosDe } from '../lib/trilha'
import { paraMillis } from '../lib/format'
import { useAcessoTrilha } from '../lib/useAcessoTrilha'

export function BibliotecaPage() {
  const { categoriaId } = useParams()
  const { user } = useAuth()
  const { ehAdmin } = useVisao()
  const gestor = podeGerirTrilha(user, ehAdmin)
  const { categorias, documentos, carregando, erro, atualizar } = usePortal()
  const [filtro, setFiltro] = useState<TipoExibicao | 'todos'>('todos')
  const trilhaAcesso = useAcessoTrilha()
  const atual = categorias.find((categoria) => categoria.id === categoriaId)
  const filhos = filhosDe(categorias, atual ? atual.id : null)
  const trilha = atual ? cadeiaCategoria(categorias, atual.id) : []
  const daPasta = useMemo(
    () =>
      documentos
        .filter((documento) => gestor || documento.status === 'publicado')
        .filter((documento) => (atual ? documento.categoriaId === atual.id : true)),
    [documentos, atual, gestor],
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
      <header className="cabecalho-pagina">
        <p className="text-sm text-muted">
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
            <h1 className="text-2xl font-bold">{atual ? atual.nome.replace(/^\d+\s*/, '') : 'Todos os documentos'}</h1>
            <p className="text-sm text-muted">{atual?.descricao || 'POPs, manuais, políticas e processos da rede.'}</p>
          </div>
          {gestor ? (
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/categorias" className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold">
                Gerenciar categorias
              </Link>
              <Link to="/admin/documento/novo" className="rounded-xl bg-brand-dark px-3 py-2 text-sm font-semibold text-white">
                Novo documento
              </Link>
            </div>
          ) : null}
        </div>
      </header>
      {erro ? <Aviso tom="erro">{erro} <button type="button" onClick={() => void atualizar()} className="underline">Tentar novamente</button></Aviso> : null}
      {carregando ? <Carregando /> : null}
      {filhos.length ? (
        <div className="flex gap-2 overflow-x-auto">
          {filhos.map((categoria) => (
            <Link key={categoria.id} to={`/biblioteca/${categoria.id}`} className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm hover:border-brand">
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
            className={item === filtro ? 'min-h-9 shrink-0 rounded-full bg-lime px-3 py-1 text-xs font-semibold text-ink' : 'min-h-9 shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted hover:bg-table-head'}
          >
            {item === 'todos' ? 'Todos' : rotuloExibicao(item)}
          </button>
        ))}
      </div>
      ) : null}
      {lista.length ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {lista.map((documento) => {
            const acesso = trilhaAcesso.acesso(documento.id)
            if (!acesso.liberado) {
              return (
                <div key={documento.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0" aria-label={`${documento.titulo}: bloqueado pela trilha`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-paper text-muted"><Lock className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-muted">{documento.titulo}</span>
                    <span className="text-xs text-muted">Abre na trilha de manuais, depois do manual anterior.</span>
                  </span>
                  <Link to="/manuais/trilha" className="shrink-0 text-xs font-semibold text-brand-dark hover:underline">Ver na trilha</Link>
                </div>
              )
            }
            return (
              <div key={documento.id} className="flex items-center border-b border-line last:border-0 hover:bg-paper">
                <Link to={`/documento/${documento.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-3 px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-paper text-[10px] font-bold uppercase text-ink/70">{seloExibicao(tipoExibicao(documento))}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{documento.titulo}</span>
                    <span className="text-xs text-muted">Atualizado {formatarData(documento.atualizadoEm)}</span>
                  </span>
                  <span className="hidden text-xs text-muted sm:block">v{documento.versao}</span>
                  {acesso.estado === 'concluido' ? <Selo tom="lima">Trilha: concluído</Selo> : acesso.estado ? <Selo>Na trilha</Selo> : null}
                  {documento.status === 'rascunho' ? <Selo tom="alerta">Rascunho</Selo> : null}
                  {documento.leituraObrigatoria ? <Selo tom="marca">Aceite</Selo> : null}
                </Link>
                {gestor ? (
                  <Link to={`/admin/documento/${documento.id}`} className="mr-4 rounded-lg px-2 py-1 text-sm font-semibold text-brand-dark hover:underline" aria-label={`Editar ${documento.titulo}`}>
                    Editar
                  </Link>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : !carregando && !erro ? (
        <Vazio titulo="Nenhum documento neste filtro" texto={gestor ? "Use Novo documento para cadastrar um material." : "A franqueadora publica os materiais oficiais nesta área."} />
      ) : null}
    </div>
  )
}
