import { normalizar } from '../lib/text'
import { BotaoCsv } from '../components/BotaoCsv'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, LinkBotao, Selo, Vazio, inputClass } from '../components/ui'
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
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState('recentes')
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
        .filter((documento) => normalizar(documento.titulo).includes(normalizar(busca.trim())))
        .sort((a, b) => ordem === 'nome' ? a.titulo.localeCompare(b.titulo, 'pt-BR') : paraMillis(b.atualizadoEm) - paraMillis(a.atualizadoEm)),
    [daPasta, filtro, busca, ordem],
  )
  const filtros: Array<TipoExibicao | 'todos'> = tipos.length ? ['todos', ...tipos] : []

  if (categoriaId && !atual) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        {carregando ? <Carregando texto="Carregando a pasta…" /> : erro ? (
          <Aviso tom="erro">{erro} <button type="button" onClick={() => void atualizar()} className="underline">Tentar novamente</button></Aviso>
        ) : <Vazio titulo="Pasta não encontrada" texto="A pasta pode ter sido movida ou não estar disponível para sua conta." />}
        <LinkBotao to="/biblioteca">Voltar à biblioteca</LinkBotao>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="cabecalho-pagina">
        <p className="text-sm text-muted">
          <Link to="/biblioteca">Biblioteca</Link>
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
        <div className="flex flex-wrap gap-2">
          {filhos.map((categoria) => (
            <Link key={categoria.id} to={`/biblioteca/${categoria.id}`} className="flex min-h-11 max-w-full items-center rounded-xl border border-line bg-surface px-3 py-2 text-sm wrap-anywhere hover:border-ink/20">
              {categoria.nome.replace(/^\d+\s*/, '')}
            </Link>
          ))}
        </div>
      ) : null}
      {filtros.length ? (
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
        {filtros.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFiltro(item)}
            aria-pressed={item === filtro}
            className={item === filtro ? 'min-h-11 rounded-full bg-lime px-3 py-1 text-xs font-semibold text-ink' : 'min-h-11 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted hover:bg-table-head'}
          >
            {item === 'todos' ? 'Todos' : rotuloExibicao(item)}
          </button>
        ))}
      </div>
      ) : null}
      {daPasta.length ? (
        <div className="flex flex-wrap items-end gap-3">
          <Campo label="Buscar pelo título"><input className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
          <Campo label="Ordenar por">
            <select className={inputClass} value={ordem} onChange={(e) => setOrdem(e.target.value)}>
              <option value="recentes">Mais recentes</option>
              <option value="nome">Título</option>
            </select>
          </Campo>
          {trilhaAcesso.carregando ? null : <BotaoCsv arquivo="biblioteca" cabecalhos={['Título', 'Tipo', 'Atualização', 'Versão']}
            linhas={lista.filter((d) => trilhaAcesso.acesso(d.id).liberado).map((d) => [
              d.titulo, rotuloExibicao(tipoExibicao(d)), formatarData(d.atualizadoEm), d.versao,
            ])} />}
        </div>
      ) : null}
      {lista.length ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {lista.map((documento) => {
            const acesso = trilhaAcesso.acesso(documento.id)
            if (!acesso.liberado) {
              const proximo = trilhaAcesso.proximoPasso(documento.id)
              return (
                <div key={documento.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0" aria-label={`${documento.titulo}: bloqueado pela trilha`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-paper text-muted"><Lock className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block wrap-anywhere font-medium text-muted">{documento.titulo}</span>
                    <span className="text-xs text-muted">Abre na trilha de manuais, depois do manual anterior.</span>
                    {proximo ? <Link to={`/manuais/estudo/${proximo.documentoId}`} className="block text-xs font-semibold text-brand-dark hover:underline">Próximo passo: concluir “{proximo.titulo}”</Link> : null}
                  </span>
                  <Link to="/manuais/trilha" className="shrink-0 text-xs font-semibold text-brand-dark hover:underline">Ver na trilha</Link>
                </div>
              )
            }
            return (
              <div key={documento.id} className="flex items-center border-b border-line last:border-0 hover:bg-paper">
                <Link to={`/documento/${documento.id}${acesso.consulta ? '?consulta=1' : ''}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-3 px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-paper text-[10px] font-bold uppercase text-ink/70">{seloExibicao(tipoExibicao(documento))}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block wrap-anywhere font-medium">{documento.titulo}</span>
                    <span className="text-xs text-muted">Atualizado {formatarData(documento.atualizadoEm)}</span>
                  </span>
                  <span className="hidden text-xs text-muted sm:block">v{documento.versao}</span>
                  {acesso.consulta ? <Selo tom="marca">Consulta livre</Selo> : acesso.estado === 'concluido' ? <Selo tom="lima">Trilha: concluído</Selo> : acesso.estado ? <Selo>Na trilha</Selo> : null}
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
        <Vazio
          titulo={daPasta.length ? 'Nenhum resultado para este filtro' : 'Nenhum documento'}
          texto={daPasta.length ? 'Ajuste a busca ou o tipo de documento.' : gestor ? 'Use Novo documento para cadastrar um material.' : 'A franqueadora publica os materiais oficiais nesta área.'}
          acao={daPasta.length ? (
            <Button type="button" variant="secondary" onClick={() => {
              setBusca('')
              setFiltro('todos')
            }}>Limpar filtros</Button>
          ) : undefined}
        />
      ) : null}
    </div>
  )
}
