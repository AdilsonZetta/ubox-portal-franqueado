import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Aviso, Carregando, Selo, Vazio } from '../components/ui'
import { useVisao } from '../lib/visao'
import { formatarData, rotuloTipo } from '../lib/format'
import { usePortal } from '../lib/portal'
import { cadeiaCategoria, filhosDe } from '../lib/trilha'
import { paraMillis } from '../lib/format'

const filtros = ['todos', 'pop', 'manual', 'processo', 'politica', 'checklist', 'html'] as const

export function BibliotecaPage() {
  const { categoriaId } = useParams()
  const { ehAdmin } = useVisao()
  const { categorias, documentos, carregando, erro } = usePortal()
  const [filtro, setFiltro] = useState<(typeof filtros)[number]>('todos')
  const atual = categorias.find((categoria) => categoria.id === categoriaId)
  const filhos = filhosDe(categorias, atual ? atual.id : null)
  const trilha = atual ? cadeiaCategoria(categorias, atual.id) : []
  const lista = useMemo(() => {
    return documentos
      .filter((documento) => (ehAdmin ? true : documento.status === 'publicado'))
      .filter((documento) => (atual ? documento.categoriaId === atual.id : true))
      .filter((documento) => (filtro === 'todos' ? true : documento.tipo === filtro))
      .sort((a, b) => paraMillis(b.atualizadoEm) - paraMillis(a.atualizadoEm))
  }, [documentos, atual, filtro, ehAdmin])

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
      <div className="flex gap-2 overflow-x-auto">
        {filtros.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFiltro(item)}
            className={item === filtro ? 'rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white' : 'rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink/60'}
          >
            {item === 'todos' ? 'Todos' : rotuloTipo(item)}
          </button>
        ))}
      </div>
      {lista.length ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {lista.map((documento) => (
            <Link key={documento.id} to={`/documento/${documento.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-paper">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-paper text-[10px] font-bold uppercase text-ink/70">{rotuloTipo(documento.tipo).slice(0, 3)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{documento.titulo}</span>
                <span className="text-xs text-ink/40">Atualizado {formatarData(documento.atualizadoEm)}</span>
              </span>
              <span className="hidden text-xs text-ink/40 sm:block">v{documento.versao}</span>
              {documento.status === 'rascunho' ? <Selo tom="alerta">Rascunho</Selo> : null}
              {documento.leituraObrigatoria ? <Selo tom="marca">Aceite</Selo> : null}
            </Link>
          ))}
        </div>
      ) : (
        <Vazio titulo="Nenhum documento neste filtro" texto="A franqueadora publica os materiais oficiais nesta área." />
      )}
    </div>
  )
}
