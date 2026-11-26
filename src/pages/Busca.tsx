import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAcessoTrilha } from '../lib/useAcessoTrilha'
import { Aviso, Button, Campo, Carregando, LinkBotao, Selo, Vazio, inputClass } from '../components/ui'
import { cadeiaCategoria } from '../lib/trilha'
import { pontuarBusca, trecho } from '../lib/text'
import { usePortal } from '../lib/portal'
import { useAuth } from '../lib/auth'
import { useVisao } from '../lib/visao'
import { acoesDoPortal, buscarAcoes, destinoDaBusca } from '../lib/buscaPortal'
import { podeModulo } from '../lib/modulosAcesso'

export function BuscaPage() {
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const { documentos, categorias, carregando, erro, atualizar } = usePortal()
  const { user } = useAuth()
  const { comoFranqueado, simulado, ehAdmin } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const trilhaAcesso = useAcessoTrilha()
  const acoes = q ? buscarAcoes(q, acoesDoPortal(pessoa, { ehAdmin, simulando: comoFranqueado })) : []
  const destinoPergunta = podeModulo(pessoa, 'manuais', comoFranqueado) ? destinoDaBusca(q, 'perguntar') : null
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
  const total = acoes.length + resultados.length

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-extrabold">Busca</h1>
      <FormularioBusca termo={q} buscar={(termo) => setParams({ q: termo })} />
      {destinoPergunta ? <Link to={destinoPergunta} className="inline-block text-sm font-semibold text-brand-dark hover:underline">Perguntar ao portal</Link> : null}
      {erro ? (
        <Aviso tom="erro">{erro}{' '}
          <Button type="button" variant="ghost" disabled={carregando} onClick={() => void atualizar()}>Tentar novamente</Button>
        </Aviso>
      ) : null}
      {buscando ? <Carregando texto="Buscando documentos…" /> : null}
      {q && !buscando && (!erro || total) ? (
        <p role="status" className="text-sm text-muted">
          {total} {total === 1 ? 'resultado' : 'resultados'} para “{q}”
        </p>
      ) : null}
      {q && !buscando && !erro && !total ? (
        <Vazio titulo="Nada encontrado" texto="Tente o nome de um documento, de uma ação ou de uma etapa da operação." />
      ) : null}
      {acoes.length ? (
        <section aria-labelledby="acoes-encontradas" className="space-y-2">
          <h2 id="acoes-encontradas" className="text-base font-semibold">Ações</h2>
          <ul className="space-y-3">
            {acoes.map((acao) => (
              <li key={acao.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{acao.titulo}</h3>
                    <Selo tom="marca">Ação</Selo>
                  </div>
                  <p className="mt-1 text-sm text-muted">{acao.descricao}</p>
                </div>
                <LinkBotao to={acao.to}>Abrir<span className="sr-only"> {acao.titulo}</span></LinkBotao>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ul className="space-y-3">
        {resultados.map(({ documento, acesso }) => {
          const categoria = cadeiaCategoria(categorias, documento.categoriaId).map((item) => item.nome).join(' / ')
          if (!acesso.liberado) {
            const proximo = trilhaAcesso.proximoPasso(documento.id)
            return (
              <li key={documento.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
                <Lock className="h-4 w-4 shrink-0 text-ink/45" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink/60">{documento.titulo}</span>
                    <Selo>Documento</Selo>
                  </span>
                  <span className="text-xs text-muted">Bloqueado: abre na trilha de manuais.</span>
                  {proximo ? <Link to={`/manuais/estudo/${proximo.documentoId}`} className="block text-xs font-semibold text-brand-dark hover:underline">Próximo passo: concluir “{proximo.titulo}”</Link> : null}
                </span>
                <Link to="/manuais/trilha" className="text-xs font-semibold text-brand-dark hover:underline">Ver na trilha</Link>
              </li>
            )
          }
          return (
            <li key={documento.id}>
              <Link to={`/documento/${documento.id}${acesso.consulta ? '?consulta=1' : ''}`} className="block rounded-2xl border border-line bg-white p-4 hover:border-brand">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{documento.titulo}</p>
                  <Selo>Documento</Selo>
                  {acesso.consulta ? <Selo tom="marca">Consulta livre</Selo> : null}
                </div>
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
      <Campo label="Buscar documentos e ações">
        <input type="search" className={inputClass} value={texto} onChange={(evento) => setTexto(evento.target.value)} />
      </Campo>
      <Button type="submit" disabled={!texto.trim()}>Buscar</Button>
    </form>
  )
}
