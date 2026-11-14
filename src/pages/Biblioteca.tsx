import { Link, useParams } from 'react-router-dom'
import { Aviso, Carregando, Selo, Vazio } from '../components/ui'
import { cadeiaCategoria, documentosDaCategoria, filhosDe } from '../lib/trilha'
import { usePortal } from '../lib/portal'
import { rotuloTipo } from '../lib/format'

export function BibliotecaPage() {
  const { categoriaId } = useParams()
  const { categorias, documentos, carregando, erro } = usePortal()
  const atual = categorias.find((categoria) => categoria.id === categoriaId)
  const filhos = filhosDe(categorias, atual ? atual.id : null)
  const lista = atual ? documentosDaCategoria(documentos.filter((documento) => documento.status === 'publicado' || true), atual.id) : []
  const publicados = atual ? lista.filter((documento) => documento.status === 'publicado' || documento.status === 'rascunho') : []
  const trilha = atual ? cadeiaCategoria(categorias, atual.id) : []

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-ink/50">
          <Link to="/biblioteca">Biblioteca</Link>
          {trilha.map((categoria) => (
            <span key={categoria.id}>
              {' / '}
              <Link to={`/biblioteca/${categoria.id}`}>{categoria.nome}</Link>
            </span>
          ))}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold">{atual?.nome ?? 'Biblioteca'}</h1>
        <p className="mt-2 max-w-2xl text-ink/65">{atual?.descricao ?? 'Nove áreas da operação Ubox. Escolha uma categoria para abrir os documentos.'}</p>
      </header>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {carregando ? <Carregando /> : null}
      {filhos.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {filhos.map((categoria) => (
            <Link key={categoria.id} to={`/biblioteca/${categoria.id}`} className="rounded-2xl border border-line bg-white p-4 hover:border-brand">
              <p className="text-xs font-bold text-brand">{String(categoria.ordem).padStart(2, '0')}</p>
              <h2 className="font-semibold">{categoria.nome}</h2>
              <p className="mt-1 text-sm text-ink/60">{categoria.descricao}</p>
            </Link>
          ))}
        </div>
      ) : null}
      {atual ? (
        publicados.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
            {publicados.map((documento) => (
              <li key={documento.id}>
                <Link to={`/documento/${documento.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                  <span>
                    <span className="font-medium">{documento.titulo}</span>
                    <span className="mt-0.5 block text-xs text-ink/50">Versão {documento.versao}</span>
                  </span>
                  <span className="flex gap-2">
                    {documento.status === 'rascunho' ? <Selo tom="alerta">Rascunho</Selo> : null}
                    {documento.leituraObrigatoria ? <Selo tom="marca">Obrigatório</Selo> : null}
                    <Selo>{rotuloTipo(documento.tipo)}</Selo>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Vazio titulo="Nenhum documento nesta categoria" texto="A franqueadora publica os materiais oficiais aqui." />
        )
      ) : null}
    </div>
  )
}
