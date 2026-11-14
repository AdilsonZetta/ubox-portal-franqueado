import { Link, useSearchParams } from 'react-router-dom'
import { Vazio } from '../components/ui'
import { cadeiaCategoria } from '../lib/trilha'
import { pontuarBusca, trecho } from '../lib/text'
import { usePortal } from '../lib/portal'

export function BuscaPage() {
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const { documentos, categorias } = usePortal()
  const resultados = documentos
    .filter((documento) => documento.status === 'publicado')
    .map((documento) => ({ documento, pontos: pontuarBusca(q, documento.titulo, documento.conteudoTexto) }))
    .filter((item) => item.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-extrabold">Busca</h1>
      <p className="text-sm text-ink/60">{q ? `Resultados para “${q}”` : 'Digite um termo na busca do topo.'}</p>
      {!q || resultados.length ? null : <Vazio titulo="Nada encontrado" texto="Tente o nome do POP, da unidade ou de uma etapa da operação." />}
      <ul className="space-y-3">
        {resultados.map(({ documento }) => {
          const categoria = cadeiaCategoria(categorias, documento.categoriaId).map((item) => item.nome).join(' / ')
          return (
            <li key={documento.id}>
              <Link to={`/documento/${documento.id}`} className="block rounded-2xl border border-line bg-white p-4 hover:border-brand">
                <p className="font-semibold">{documento.titulo}</p>
                <p className="mt-1 text-xs text-ink/50">{categoria}</p>
                <p className="mt-2 text-sm text-ink/70">{trecho(documento.conteudoTexto, q)}</p>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
