import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, Lock, PlayCircle, RotateCcw } from 'lucide-react'
import { Aviso, Carregando, Selo, Vazio, cx } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData, paraMillis } from '../../lib/format'
import { listarMeuProgresso, listarProgressoVisivel, listarTrilhaManuais } from '../../lib/manuaisApi'
import {
  fazTrilha,
  formatarDuracao,
  montarTrilhaDoUsuario,
  podeGerirTrilha,
  resumirProgresso,
  type EstadoManual,
  type ItemTrilhaManual,
  type ProgressoManual,
} from '../../lib/manuaisTrilha'
import { useVisao } from '../../lib/visao'

const ESTADO: Record<EstadoManual, { rotulo: string; tom: 'neutro' | 'marca' | 'lima' | 'alerta' }> = {
  bloqueado: { rotulo: 'Bloqueado', tom: 'neutro' },
  disponivel: { rotulo: 'Disponível', tom: 'marca' },
  em_andamento: { rotulo: 'Em andamento', tom: 'alerta' },
  concluido: { rotulo: 'Concluído', tom: 'lima' },
}

export function TrilhaManuaisPage() {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const [itens, setItens] = useState<ItemTrilhaManual[]>([])
  const [meus, setMeus] = useState<ProgressoManual[]>([])
  const [equipe, setEquipe] = useState<ProgressoManual[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!user || !pessoa) {
      setCarregando(false)
      return
    }
    let ativo = true
    setCarregando(true)
    setErro('')
    const pedidos: [Promise<ItemTrilhaManual[]>, Promise<ProgressoManual[]>, Promise<ProgressoManual[]>] = [
      listarTrilhaManuais(),
      fazTrilha(pessoa) ? listarMeuProgresso(pessoa.uid) : Promise.resolve([]),
      !comoFranqueado && user.papel === 'franqueado' ? listarProgressoVisivel(user) : Promise.resolve([]),
    ]
    void Promise.all(pedidos)
      .then(([trilha, progresso, daEquipe]) => {
        if (!ativo) return
        setItens(trilha)
        setMeus(progresso)
        setEquipe(daEquipe)
      })
      .catch((falha) => ativo && setErro(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [user, pessoa, comoFranqueado])

  const etapas = useMemo(() => montarTrilhaDoUsuario(itens, meus), [itens, meus])
  const todos = etapas.flatMap((etapa) => etapa.itens)
  const concluidos = todos.filter((item) => item.estado === 'concluido').length
  const proximo = todos.find((item) => item.estado === 'disponivel' || item.estado === 'em_andamento')
  const tempoRestante = todos.filter((item) => item.estado !== 'concluido').reduce((soma, item) => soma + item.tempoMinimoSeg, 0)
  const percentual = todos.length ? Math.round((concluidos / todos.length) * 100) : 0
  const resumoEquipe = useMemo(() => resumirProgresso(itens, equipe.map((p) => ({ ...p, concluidoMs: paraMillis(p.concluidoEm) }))), [itens, equipe])
  const gestor = podeGerirTrilha(user, ehAdmin)
  const meusPorDoc = new Map(meus.map((p) => [p.documentoId, p]))

  if (!user) return null
  if (comoFranqueado && !simulado) return <Aviso>Escolha qual franqueado simular para ver a trilha dessa pessoa.</Aviso>

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="cabecalho-pagina flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Manuais e Processos</p>
          <h1 className="text-2xl font-bold text-ink">Trilha de manuais</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Os manuais abrem um de cada vez, na ordem definida pela franqueadora. Cada um tem um tempo mínimo de leitura e, se você
            sair da tela, o cronômetro recomeça.
          </p>
        </div>
        {gestor && !comoFranqueado ? (
          <Link to="/manuais/gestao" className="inline-flex items-center justify-center rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:border-ink/30">
            Gestão da trilha
          </Link>
        ) : null}
      </header>

      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {comoFranqueado ? <Aviso>Simulação: você vê a trilha como {simulado?.nome}. Nada é gravado em nome dessa pessoa.</Aviso> : null}
      {!fazTrilha(pessoa) && !comoFranqueado ? (
        <Aviso>A trilha é feita pelas unidades. Aqui você vê como ela aparece; o acompanhamento fica na Gestão da trilha.</Aviso>
      ) : null}

      {carregando ? <Carregando texto="Carregando a trilha…" /> : null}

      {!carregando && !todos.length ? (
        <Vazio titulo="Nenhum manual na trilha ainda" texto="Quando a franqueadora montar a trilha, os manuais aparecem aqui na ordem certa." />
      ) : null}

      {todos.length ? (
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumo da trilha">
          <article className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Concluídos</p>
            <p className="mt-1.5 text-3xl font-bold text-ink">
              {concluidos}
              <span className="text-lg font-bold text-muted"> / {todos.length}</span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={percentual} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da trilha">
              <div className="h-full rounded-full bg-lime" style={{ width: `${percentual}%` }} />
            </div>
          </article>
          <article className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Próximo manual</p>
            <p className="mt-1.5 line-clamp-2 text-sm font-bold text-ink">{proximo ? proximo.titulo : 'Trilha completa'}</p>
            {proximo && fazTrilha(pessoa) && !comoFranqueado ? (
              <Link to={`/manuais/estudo/${proximo.documentoId}`} className="mt-2 inline-block text-xs font-semibold text-brand-dark hover:underline">
                {proximo.estado === 'em_andamento' ? 'Continuar agora' : 'Começar agora'}
              </Link>
            ) : null}
          </article>
          <article className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Tempo mínimo restante</p>
            <p className="mt-1.5 text-3xl font-bold text-ink">{formatarDuracao(tempoRestante)}</p>
            <p className="mt-1 text-xs text-muted">Somando os manuais que faltam</p>
          </article>
        </section>
      ) : null}

      {etapas.map((etapa) => (
        <section key={etapa.etapa} className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
          <h2 className="border-b border-line bg-paper/60 px-5 py-3 text-sm font-bold uppercase tracking-wider text-muted">{etapa.etapa}</h2>
          <ol className="divide-y divide-line">
            {etapa.itens.map((item) => {
              const progresso = meusPorDoc.get(item.documentoId)
              const podeAbrir = item.estado !== 'bloqueado' && fazTrilha(pessoa) && !comoFranqueado
              return (
                <li key={item.documentoId} className={cx('flex flex-wrap items-center gap-3 px-5 py-4', item.estado === 'bloqueado' && 'opacity-70')}>
                  <span
                    className={cx(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                      item.estado === 'concluido' ? 'bg-lime/20 text-lime-dark' : item.estado === 'bloqueado' ? 'bg-paper text-muted' : 'bg-brand/10 text-brand-dark',
                    )}
                    aria-hidden="true"
                  >
                    {item.estado === 'concluido' ? <CheckCircle2 className="h-5 w-5" /> : item.estado === 'bloqueado' ? <Lock className="h-5 w-5" /> : item.estado === 'em_andamento' ? <RotateCcw className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">
                      {item.ordem}. {item.titulo}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> mínimo {formatarDuracao(item.tempoMinimoSeg)}
                      </span>
                      {item.videoMinutos ? <span>vídeo de {item.videoMinutos} min</span> : null}
                      {item.estado === 'bloqueado' ? <span>Conclua o manual anterior para abrir.</span> : null}
                      {item.estado === 'concluido' && progresso ? <span>Concluído em {formatarData(progresso.concluidoEm)}</span> : null}
                    </span>
                  </span>
                  <Selo tom={ESTADO[item.estado].tom}>{ESTADO[item.estado].rotulo}</Selo>
                  {podeAbrir ? (
                    <Link
                      to={`/manuais/estudo/${item.documentoId}`}
                      className={cx(
                        'rounded-xl px-3 py-2 text-sm font-semibold',
                        item.estado === 'concluido' ? 'border border-line bg-surface text-ink hover:border-ink/30' : 'bg-brand text-white hover:bg-brand-dark',
                      )}
                    >
                      {item.estado === 'concluido' ? 'Rever' : item.estado === 'em_andamento' ? 'Continuar' : 'Começar'}
                    </Link>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </section>
      ))}

      {!comoFranqueado && user.papel === 'franqueado' && todos.length ? (
        <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-lg font-bold text-ink">Progresso da sua equipe</h2>
            <p className="text-xs text-muted">Quem da unidade já começou a trilha. Pessoas que ainda não abriram nenhum manual não aparecem.</p>
          </div>
          {resumoEquipe[0]?.pessoas.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-paper/60 text-[11px] font-bold uppercase tracking-wider text-muted">
                    <th className="px-5 py-3">Pessoa</th>
                    <th className="px-4 py-3">Concluídos</th>
                    <th className="px-4 py-3">Último concluído</th>
                    <th className="px-5 py-3 text-right">Reinícios</th>
                  </tr>
                </thead>
                <tbody>
                  {resumoEquipe[0].pessoas.map((p) => (
                    <tr key={p.uid} className="border-b border-line last:border-0">
                      <td className="px-5 py-3 font-medium">{p.nome}</td>
                      <td className="px-4 py-3">
                        {p.concluidos} / {p.total}
                      </td>
                      <td className="px-4 py-3 text-muted">{p.ultimoConcluido || '—'}</td>
                      <td className="px-5 py-3 text-right text-muted">{p.reinicios}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-muted">Ninguém da equipe começou a trilha ainda.</p>
          )}
        </section>
      ) : null}
    </div>
  )
}
