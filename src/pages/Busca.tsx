import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAcessoTrilha } from '../lib/useAcessoTrilha'
import { Aviso, Button, Campo, Carregando, Vazio, inputClass } from '../components/ui'
import { cadeiaCategoria } from '../lib/trilha'
import { pontuarBusca, trecho } from '../lib/text'
import { usePortal } from '../lib/portal'

export function BuscaPage() {
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const { documentos, categorias, carregando, erro, atualizar } = usePortal()
  const trilhaAcesso = useAcessoTrilha()
  const buscando = Boolean(q && (carregando || trilhaAcesso.carregando))
  const resultados = q && !buscando ? documentos
    .filter((documento) => documento.status === 'publicado')
    .map((documento) => {
      const acesso = trilhaAcesso.acesso(documento.id)
      const pontos = pontuarBusca(q, documento.titulo, acesso.liberado ? documento.conteudoTexto : '')
      return { documento, acesso, pontos }
    })
    .filter((item) => item.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos) : []

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-extrabold">Busca</h1>
      <FormularioBusca termo={q} buscar={(termo) => setParams({ q: termo })} />
      {erro ? (
        <Aviso tom="erro">{erro}{' '}
          <Button type="button" variant="ghost" disabled={carregando} onClick={() => void atualizar()}>Tentar novamente</Button>
        </Aviso>
      ) : null}
      {buscando ? <Carregando texto="Buscando documentos…" /> : null}
      {q && !buscando && (!erro || resultados.length) ? (
        <p role="status" className="text-sm text-muted">
          {resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'} para “{q}”
        </p>
      ) : null}
      {q && !buscando && !erro && !resultados.length ? (
        <Vazio titulo="Nada encontrado" texto="Tente o nome do POP, da unidade ou de uma etapa da operação." />
      ) : null}
      <ul className="space-y-3">
        {resultados.map(({ documento, acesso }) => {
          const categoria = cadeiaCategoria(categorias, documento.categoriaId).map((item) => item.nome).join(' / ')
          if (!acesso.liberado) {
            return (
              <li key={documento.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
                <Lock className="h-4 w-4 shrink-0 text-ink/45" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink/60">{documento.titulo}</span>
                  <span className="text-xs text-muted">Bloqueado: abre na trilha de manuais.</span>
                </span>
                <Link to="/manuais/trilha" className="text-xs font-semibold text-brand-dark hover:underline">Ver na trilha</Link>
              </li>
            )
          }
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

function FormularioBusca({ termo, buscar }: { termo: string; buscar: (termo: string) => void }) {
  const [texto, setTexto] = useState(termo)
  const [termoAnterior, setTermoAnterior] = useState(termo)
  if (termoAnterior !== termo) {
    setTermoAnterior(termo)
    setTexto(termo)
  }
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (texto.trim()) buscar(texto.trim())
  }

  return (
    <form onSubmit={enviar} role="search" className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <Campo label="Buscar documentos">
        <input type="search" className={inputClass} value={texto} onChange={(evento) => setTexto(evento.target.value)} />
      </Campo>
      <Button type="submit" disabled={!texto.trim()}>Buscar</Button>
    </form>
  )
}
